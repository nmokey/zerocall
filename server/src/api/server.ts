import express from 'express';
import cors from 'cors';
import { readLatestSnapshot, readLastSyncLog } from '../db/snapshot.js';
import { syncAll } from '../sync/syncAll.js';
import { exchangeCodeForTokens, isAuthenticated, getOAuthUrl } from '../auth/google.js';
import { getConfigStatus, validateConfig, writeConfig, getIntegrationPreferences, IntegrationPreferences } from './config.js';
import { renderSetupPage, handleSetupPost } from './setup.js';

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
    const { integrations, ...credentials } = req.body;
    const prefs: IntegrationPreferences | undefined = integrations;
    const errors = validateConfig(credentials, prefs);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }
    try {
      writeConfig(credentials, prefs);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ errors: [err.message] });
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

  app.get('/', (_req, res) => {
    res.redirect('/setup');
  });

  return app;
}
