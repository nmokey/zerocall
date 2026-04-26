import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readLatestSnapshot, readLastSyncLog } from '../db/snapshot.js';
import { syncAll } from '../sync/syncAll.js';
import { exchangeCodeForTokens, isAuthenticated, getOAuthUrl } from '../auth/google.js';
import { getConfigStatus, validatePartialConfig, writeConfig, getIntegrationPreferences } from './config.js';
import { renderSetupPage, handleSetupPost } from './setup.js';
import { computeAdaptiveStats } from '../analytics/suggestions.js';
import { setAdaptiveSection } from '../db/adaptiveConfig.js';
import { runTraceComparison } from '../trace/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApiServer(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Setup / status page — human-facing UI for credential management
  app.get('/setup', (req, res) => {
    const saved = typeof req.query.saved === 'string' ? req.query.saved : null;
    res.send(renderSetupPage([], saved));
  });

  app.post('/setup', (req, res) => {
    const result = handleSetupPost(req.body as Record<string, string>);
    if (result.ok) {
      res.redirect(result.redirect);
    } else {
      res.status(400).send(renderSetupPage(result.errors));
    }
  });

  app.post('/setup/connect-google', (_req, res) => {
    try {
      res.redirect(getOAuthUrl());
    } catch (err: any) {
      res.status(400).send(renderSetupPage([err.message]));
    }
  });

  app.post('/setup/sync', (_req, res) => {
    syncAll().catch(err => console.error('[setup] sync error:', err));
    res.redirect('/setup?saved=Sync+started.');
  });

  app.get('/api/status', (_req, res) => {
    const config = getConfigStatus();
    const lastSync = readLastSyncLog();
    res.json({
      configured: config.missing.length === 0,
      authenticated: isAuthenticated(),
      lastSync: lastSync?.finished_at ?? null,
      lastSyncSuccess: lastSync ? lastSync.success === 1 : null,
    });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ ...getConfigStatus(), integrations: getIntegrationPreferences() });
  });

  app.post('/api/config', (req, res) => {
    const credentials = req.body as Record<string, string>;
    const errors = validatePartialConfig(credentials);
    if (errors.length > 0) {
      res.status(400).json({ error: errors[0] });
      return;
    }
    try {
      writeConfig(credentials);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/snapshot', (_req, res) => {
    res.json(readLatestSnapshot());
  });

  app.post('/api/sync', (_req, res) => {
    syncAll().catch(err => console.error('[api] sync error:', err));
    res.json({ started: true });
  });

  app.get('/api/auth/google', (_req, res) => {
    try {
      res.json({ url: getOAuthUrl() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code as string | undefined;
    if (!code) {
      res.status(400).send('Missing code parameter');
      return;
    }
    try {
      await exchangeCodeForTokens(code);
      res.redirect('/setup?saved=Google+account+connected.');
    } catch (err: any) {
      res.status(500).send(`OAuth failed: ${err.message}`);
    }
  });

  app.get('/api/adaptive/stats', (_req, res) => {
    res.json(computeAdaptiveStats());
  });

  app.post('/api/adaptive/apply', (req, res) => {
    const { section, enabled } = req.body as { section?: string; enabled?: boolean };
    const validSections = ['calendar', 'email', 'tasks'];
    if (!section || !validSections.includes(section)) {
      res.status(400).json({ error: 'section must be one of: calendar, email, tasks' });
      return;
    }
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    setAdaptiveSection(section as 'calendar' | 'email' | 'tasks', enabled);
    res.json({ ok: true, section, enabled });
  });

  app.post('/api/trace', async (req, res) => {
    const { prompt } = req.body as { prompt?: string };
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    try {
      const result = await runTraceComparison(prompt.trim());
      res.json(result);
    } catch (err: any) {
      console.error('[api] trace error:', err);
      res.status(500).json({ error: err.message ?? 'Trace failed' });
    }
  });

  // Serve the React SPA in production (web/dist built by `npm run build -w web`)
  const webDist = path.resolve(__dirname, '../../../web/dist');
  app.use(express.static(webDist));
  app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });

  return app;
}
