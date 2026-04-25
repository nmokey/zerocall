import { getConfigStatus, writeConfig } from './config.js';
import { isAuthenticated, getOAuthUrl } from '../auth/google.js';
import { readLastSyncLog } from '../db/snapshot.js';

/** Escapes HTML special characters to prevent XSS in template strings. */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders a status badge pill. */
function badge(ok: boolean, okLabel = 'Connected', failLabel = 'Not configured'): string {
  const cls = ok ? 'badge-ok' : 'badge-warn';
  return `<span class="badge ${cls}">${esc(ok ? okLabel : failLabel)}</span>`;
}

/** Renders a labeled form field with optional hint text. */
function field(
  label: string,
  name: string,
  value: string,
  opts: { type?: string; placeholder?: string; hint?: string } = {}
): string {
  const { type = 'text', placeholder = '', hint = '' } = opts;
  return `<div class="field">
    <label for="${name}">${esc(label)}</label>
    <input type="${type}" id="${name}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
  </div>`;
}

/** Validates format of credentials that are present (non-empty). Does not enforce required fields. */
function validatePartial(values: Record<string, string>): string[] {
  const errors: string[] = [];
  if (values.GOOGLE_CLIENT_ID && !values.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    errors.push('GOOGLE_CLIENT_ID should end with .apps.googleusercontent.com');
  }
  if (values.NOTION_TOKEN && !values.NOTION_TOKEN.startsWith('secret_') && !values.NOTION_TOKEN.startsWith('ntn_')) {
    errors.push('NOTION_TOKEN should start with secret_ or ntn_');
  }
  if (values.NOTION_DATABASE_ID && !/^[0-9a-f]{32}$/i.test(values.NOTION_DATABASE_ID.replace(/-/g, ''))) {
    errors.push('NOTION_DATABASE_ID should be a 32-character hex string');
  }
  return errors;
}

/** Renders the full setup/status HTML page. */
export function renderSetupPage(errors: string[] = [], saved: string | null = null): string {
  const config = getConfigStatus();
  const googleCredentialsOk = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].every(k => config.present.includes(k));
  const googleAuthed = isAuthenticated();
  const notionOk = ['NOTION_TOKEN', 'NOTION_DATABASE_ID'].every(k => config.present.includes(k));
  const lastSync = readLastSyncLog();
  const env = (key: string) => process.env[key] ?? '';

  let syncStatus = 'No sync yet';
  if (lastSync) {
    syncStatus = lastSync.finished_at
      ? `Last sync: ${lastSync.finished_at} — ${lastSync.success ? '✓ Success' : '✗ Failed'}`
      : `Syncing… (started ${lastSync.started_at})`;
  }

  const googleBadge = !googleCredentialsOk
    ? badge(false, '', 'Not configured')
    : !googleAuthed
    ? badge(false, '', 'Auth required')
    : badge(true);

  const errorsHtml = errors.length
    ? `<div class="msg-box error-box">${errors.map(e => `<p>${esc(e)}</p>`).join('')}</div>`
    : '';
  const savedHtml = saved
    ? `<div class="msg-box success-box"><p>${esc(saved)}</p></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OneCall — Setup</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 40px 20px; }
    .container { max-width: 560px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 6px; }
    .sync-status { color: #888; font-size: 0.78rem; margin-bottom: 28px; }
    .card { background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .section-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #888; }
    .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 500; padding: 2px 8px; border-radius: 9999px; }
    .badge::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
    .badge-ok { color: #166534; background: #dcfce7; }
    .badge-ok::before { background: #22c55e; }
    .badge-warn { color: #92400e; background: #fef3c7; }
    .badge-warn::before { background: #f59e0b; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 4px; }
    input { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.875rem; font-family: 'SF Mono', 'Fira Code', monospace; }
    input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79,70,229,0.15); }
    .hint { font-size: 0.78rem; color: #888; margin-top: 5px; line-height: 1.5; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .btn { display: block; width: 100%; padding: 10px; font-size: 0.9rem; font-weight: 500; border: none; border-radius: 6px; cursor: pointer; margin-top: 16px; }
    .btn-primary { background: #4f46e5; color: white; }
    .btn-primary:hover { background: #4338ca; }
    .btn-secondary { background: white; color: #4f46e5; border: 1px solid #c7d2fe; }
    .btn-secondary:hover { background: #eef2ff; }
    .msg-box { border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; font-size: 0.875rem; }
    .msg-box p { margin: 2px 0; }
    .error-box { background: #fff5f5; border: 1px solid #feb2b2; color: #c53030; }
    .success-box { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
  </style>
</head>
<body>
  <div class="container">
    <h1>OneCall</h1>
    <p class="subtitle">Configure integrations and check connection status.</p>
    <p class="sync-status">${esc(syncStatus)}</p>

    ${errorsHtml}${savedHtml}

    <div class="card">
      <div class="card-header">
        <span class="section-label">Google (Gmail + Calendar)</span>
        ${googleBadge}
      </div>
      <form method="POST" action="/setup">
        <input type="hidden" name="_section" value="google">
        ${field('Client ID', 'GOOGLE_CLIENT_ID', env('GOOGLE_CLIENT_ID'), {
          placeholder: '123456789-abc...apps.googleusercontent.com',
          hint: 'Google Cloud Console → Credentials → OAuth 2.0 Client ID. Enable Gmail API + Calendar API. Add http://localhost:3000/oauth2callback as a redirect URI.',
        })}
        ${field('Client Secret', 'GOOGLE_CLIENT_SECRET', '', {
          type: 'password',
          placeholder: 'GOCSPX-...',
        })}
        ${field('Redirect URI', 'GOOGLE_REDIRECT_URI', env('GOOGLE_REDIRECT_URI') || 'http://localhost:3000/oauth2callback', {
          hint: 'Must match the redirect URI you entered in Google Cloud Console.',
        })}
        <button type="submit" class="btn btn-primary">Save Google Credentials</button>
      </form>
      ${googleCredentialsOk ? `
      <form method="POST" action="/setup" style="margin-top:10px">
        <input type="hidden" name="_section" value="connect-google">
        <button type="submit" class="btn btn-secondary">${googleAuthed ? 'Reconnect Google Account' : 'Connect Google Account'}</button>
      </form>` : ''}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="section-label">Notion</span>
        ${badge(notionOk)}
      </div>
      <form method="POST" action="/setup">
        <input type="hidden" name="_section" value="notion">
        ${field('Integration Token', 'NOTION_TOKEN', '', {
          type: 'password',
          placeholder: 'ntn_ or secret_...',
          hint: 'notion.so/my-integrations → New integration → Internal Integration Secret. Share your task database with the integration via Connections.',
        })}
        ${field('Database ID', 'NOTION_DATABASE_ID', env('NOTION_DATABASE_ID'), {
          placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          hint: 'Found in your database URL: notion.so/{workspace}/THIS-PART?v=...',
        })}
        <button type="submit" class="btn btn-primary">Save Notion Credentials</button>
      </form>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="section-label">Optional</span>
      </div>
      <form method="POST" action="/setup">
        <input type="hidden" name="_section" value="optional">
        ${field('Anthropic API Key', 'ANTHROPIC_API_KEY', '', {
          type: 'password',
          placeholder: 'sk-ant-...',
          hint: 'Only needed for the demo benchmark scripts.',
        })}
        <div class="grid-2">
          <div class="field">
            <label for="WORK_DAY_START">Work Day Start</label>
            <input type="time" id="WORK_DAY_START" name="WORK_DAY_START" value="${esc(env('WORK_DAY_START') || '09:00')}">
          </div>
          <div class="field">
            <label for="WORK_DAY_END">Work Day End</label>
            <input type="time" id="WORK_DAY_END" name="WORK_DAY_END" value="${esc(env('WORK_DAY_END') || '18:00')}">
          </div>
        </div>
        ${field('Sync Interval (minutes)', 'SYNC_INTERVAL_MINUTES', env('SYNC_INTERVAL_MINUTES') || '15', { type: 'number' })}
        <button type="submit" class="btn btn-primary">Save Settings</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Handles POST /setup. Returns a redirect URL on success, or errors for re-render.
 * Empty field values are ignored so existing keys aren't overwritten with blanks.
 */
export function handleSetupPost(
  body: Record<string, string>
): { ok: true; redirect: string } | { ok: false; errors: string[] } {
  const { _section, ...values } = body;

  if (_section === 'connect-google') {
    try {
      return { ok: true, redirect: getOAuthUrl() };
    } catch (e: any) {
      return { ok: false, errors: [e.message] };
    }
  }

  const nonEmpty = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));

  const errors = validatePartial(nonEmpty);
  if (errors.length) return { ok: false, errors };

  try {
    writeConfig(nonEmpty);
    return { ok: true, redirect: '/setup?saved=Settings+saved.' };
  } catch (e: any) {
    return { ok: false, errors: [e.message] };
  }
}
