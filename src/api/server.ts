import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readLatestSnapshot, readLastSyncLog } from '../db/snapshot.js';
import { syncAll } from '../sync/syncAll.js';
import { getOAuthUrl, exchangeCodeForTokens, isAuthenticated } from '../auth/google.js';
import { getConfigStatus, validateConfig, writeConfig, getIntegrationPreferences, IntegrationPreferences } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../../web/dist');

export function createApiServer(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

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
      res.redirect('/');
    } catch (err: any) {
      res.status(500).send(`OAuth failed: ${err.message}`);
    }
  });

  // Serve frontend static files in production
  app.use(express.static(WEB_DIST));

  // Catch-all for SPA routing
  app.use((_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });

  return app;
}
