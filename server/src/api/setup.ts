import { getConfigStatus, writeConfig } from './config.js';
import { isAuthenticated, getOAuthUrl } from '../auth/google.js';
import { readLastSyncLog } from '../db/snapshot.js';
import { computeAdaptiveStats } from '../analytics/suggestions.js';

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

/** Renders a horizontal bar representing a percentage (0–100), max 120px wide. */
function barHtml(pct: number, color = '#4f46e5'): string {
  const width = Math.round(pct * 1.2); // 100% → 120px
  return `<span class="bar" style="width:${width}px;background:${esc(color)}"></span>`;
}

/** Renders the Adaptive Optimization card. Returns empty string if < 5 queries logged. */
function renderAdaptiveCard(): string {
  const stats = computeAdaptiveStats();
  if (stats.queryCount < 5) {
    return `<div class="card">
      <div class="card-header">
        <span class="section-label">Adaptive Optimization</span>
      </div>
      <p style="font-size:0.85rem;color:#888">Ask at least 5 questions through OneCall to unlock personalized context suggestions. (${stats.queryCount}/5 so far)</p>
    </div>`;
  }

  const total = stats.queryCount;
  const dist = stats.categoryDistribution;
  const categoryColors: Record<string, string> = {
    calendar: '#3b82f6',
    email: '#10b981',
    tasks: '#f59e0b',
    general: '#8b5cf6',
  };

  const distBars = ['calendar', 'email', 'tasks', 'general']
    .map(cat => {
      const count = dist[cat] ?? 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      if (count === 0) return '';
      return `<span class="cat">${barHtml(pct, categoryColors[cat])}<span>${esc(cat[0].toUpperCase() + cat.slice(1))} ${pct}%</span></span>`;
    })
    .filter(Boolean)
    .join('');

  const suggestionsHtml = stats.suggestions.map(s => {
    const pct = Math.round(s.relevanceScore * 100);
    return `<div class="suggestion">
      <div>
        <p>Disable <strong>${esc(s.section)}</strong> section — only relevant for ${pct}% of your queries</p>
        <p class="savings">Projected savings: ~${s.projectedTokenSavings} tokens/query</p>
      </div>
      <button class="btn-apply" onclick="applyAdaptive('${esc(s.section)}', false)">Apply</button>
    </div>`;
  }).join('');

  const configRows = (['calendar', 'email', 'tasks'] as const).map(s => {
    const on = stats.currentConfig[s];
    return `<span class="${on ? 'section-on' : 'section-off'}">${esc(s[0].toUpperCase() + s.slice(1))}: ${on ? 'on' : 'off'}</span>`;
  }).join(' &nbsp;·&nbsp; ');

  return `<div class="card">
    <div class="card-header">
      <span class="section-label">Adaptive Optimization</span>
      <span class="badge badge-ok" style="font-size:0.72rem">${total} queries analyzed</span>
    </div>
    <p style="font-size:0.82rem;color:#555;margin-bottom:4px">Query distribution (last 100):</p>
    <div class="dist-bar">${distBars}</div>
    <p style="font-size:0.8rem;color:#888;margin-top:8px">Active sections: ${configRows}</p>
    ${suggestionsHtml || '<p style="font-size:0.84rem;color:#166534;margin-top:12px">✓ All sections are relevant to your query patterns.</p>'}
    <p class="re-enable-row">Reset all sections: <a onclick="resetAdaptive()">Re-enable all</a></p>
  </div>
  <script>
    async function applyAdaptive(section, enabled) {
      await fetch('/api/adaptive/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, enabled }),
      });
      location.reload();
    }
    async function resetAdaptive() {
      await Promise.all(['calendar','email','tasks'].map(s =>
        fetch('/api/adaptive/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: s, enabled: true }),
        })
      ));
      location.reload();
    }
  </script>`;
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
    .dist-bar { display: flex; gap: 6px; align-items: center; margin: 10px 0 6px; font-size: 0.78rem; color: #555; flex-wrap: wrap; }
    .dist-bar .cat { display: flex; align-items: center; gap: 4px; }
    .dist-bar .bar { display: inline-block; height: 8px; border-radius: 4px; background: #4f46e5; }
    .suggestion { display: flex; align-items: center; justify-content: space-between; background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; margin-top: 12px; gap: 12px; }
    .suggestion p { font-size: 0.84rem; color: #78350f; margin: 0; }
    .suggestion .savings { font-size: 0.72rem; color: #92400e; margin-top: 2px; }
    .btn-apply { background: #4f46e5; color: white; border: none; border-radius: 5px; padding: 6px 14px; font-size: 0.82rem; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .btn-apply:hover { background: #4338ca; }
    .section-on { color: #166534; font-weight: 600; }
    .section-off { color: #92400e; font-weight: 600; }
    .re-enable-row { margin-top: 10px; font-size: 0.8rem; color: #888; }
    .re-enable-row a { color: #4f46e5; text-decoration: none; cursor: pointer; }
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

    ${renderAdaptiveCard()}
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
