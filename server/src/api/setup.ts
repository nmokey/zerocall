import { getConfigStatus, writeConfig } from './config.js';
import { isAuthenticated } from '../auth/google.js';
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

/** Renders an inline credential input for the table layout.
 *
 * When `isSet` is true the input renders locked (readonly, muted style, pencil icon).
 * Clicking the wrapper calls `unlockField()` to make it editable.
 * Password fields clear their value on unlock so the user must retype;
 * text fields keep the current value for in-place editing.
 */
function credField(label: string, name: string, value: string, placeholder: string, type = 'text', isSet = false): string {
  if (isSet) {
    const displayValue = type === 'password' ? '' : value;
    const lockedPlaceholder = type === 'password' ? '••••••••' : value;
    return `<div class="cred-field">
      <label for="${name}">${esc(label)}</label>
      <div class="locked-wrap" data-field-type="${type}" onclick="unlockField(this)">
        <input type="${type}" id="${name}" name="${name}" value="${esc(displayValue)}" placeholder="${esc(lockedPlaceholder)}" autocomplete="off" spellcheck="false" readonly class="locked-input">
        <span class="edit-icon">&#9998;</span>
      </div>
    </div>`;
  }
  return `<div class="cred-field">
    <label for="${name}">${esc(label)}</label>
    <input type="${type}" id="${name}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
  </div>`;
}

/** Renders a status indicator dot + label. */
function statusCell(ok: boolean, label: string): string {
  return `<div class="status-cell ${ok ? 'status-ok' : 'status-warn'}">
    <span class="status-dot"></span>
    <span>${esc(label)}</span>
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
function barHtml(pct: number, color = '#c05a2b'): string {
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
      <p style="font-size:0.85rem;color:#8a7e70">Ask at least 5 questions through ZeroCall to unlock personalized context suggestions. (${stats.queryCount}/5 so far)</p>
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
    <p style="font-size:0.82rem;color:#6e6458;margin-bottom:4px">Query distribution (last 100):</p>
    <div class="dist-bar">${distBars}</div>
    <p style="font-size:0.8rem;color:#8a7e70;margin-top:8px">Active sections: ${configRows}</p>
    ${suggestionsHtml || '<p style="font-size:0.84rem;color:#2e7d4f;margin-top:12px">✓ All sections are relevant to your query patterns.</p>'}
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

/** Renders the setup/status HTML page. */
export function renderSetupPage(errors: string[] = [], saved: string | null = null): string {
  const config = getConfigStatus();
  const googleCredentialsOk = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].every(k => config.present.includes(k));
  const googleAuthed = isAuthenticated();
  const notionOk = ['NOTION_TOKEN', 'NOTION_DATABASE_ID'].every(k => config.present.includes(k));
  const anthropicOk = !!process.env.ANTHROPIC_API_KEY;
  const lastSync = readLastSyncLog();
  const env = (key: string) => process.env[key] ?? '';

  // Footer stats
  const connectedCount = [googleCredentialsOk && googleAuthed, notionOk, anthropicOk].filter(Boolean).length;
  const allFields = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NOTION_TOKEN', 'NOTION_DATABASE_ID', 'ANTHROPIC_API_KEY'];
  const pendingCount = allFields.filter(k => !env(k)).length;

  // Sync status in header
  let syncHtml = '<span class="sync-meta">No sync yet</span>';
  if (lastSync?.finished_at) {
    const cls = lastSync.success ? 'success' : 'failure';
    const label = lastSync.success ? '&#10003;&nbsp;success' : '&#10007;&nbsp;failed';
    syncHtml = `<span class="sync-meta">last sync &middot; ${esc(lastSync.finished_at)} &middot; <span class="${cls}">${label}</span></span>`;
  } else if (lastSync) {
    syncHtml = '<span class="sync-meta">syncing&hellip;</span>';
  }

  // Google status cell — shows an Authorize link when credentials are set but OAuth not done
  let googleStatus: string;
  if (!googleCredentialsOk) {
    googleStatus = statusCell(false, 'Not configured');
  } else if (!googleAuthed) {
    googleStatus = statusCell(false, 'Auth required') +
      '<button type="submit" form="google-auth-form" class="auth-link">Authorize &#8594;</button>';
  } else {
    googleStatus = statusCell(true, 'Connected');
  }

  const errorsHtml = errors.length
    ? `<div class="msg-banner msg-error">${errors.map(e => `<span>${esc(e)}</span>`).join('<br>')}</div>`
    : '';
  const savedHtml = saved
    ? `<div class="msg-banner msg-success"><span class="check-icon">&#10003;</span><span>${esc(saved)}</span></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZeroCall</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ece8dc; color: #2a2218; min-height: 100vh; padding: 48px 24px; }
    .page { max-width: 920px; margin: 0 auto; }

    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
    .header-left h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.025em; }
    .header-left p { color: #6e6458; font-size: 0.875rem; margin-top: 5px; }
    .header-right { display: flex; align-items: center; gap: 14px; padding-top: 4px; }
    .sync-meta { font-size: 0.78rem; color: #8a7e70; }
    .sync-meta .success { color: #2e7d4f; font-weight: 500; }
    .sync-meta .failure { color: #b53030; font-weight: 500; }

    .btn-sync { display: flex; align-items: center; gap: 7px; padding: 7px 14px; font-size: 0.82rem; font-weight: 500; border: 1.5px solid #c4bab0; border-radius: 7px; background: white; color: #3a3228; cursor: pointer; white-space: nowrap; }
    .btn-sync:hover { background: #f5f0e8; }
    .sync-dot { width: 10px; height: 10px; border-radius: 50%; background: #c05a2b; flex-shrink: 0; }
    .btn-save { padding: 9px 24px; font-size: 0.875rem; font-weight: 600; border: none; border-radius: 7px; background: #c05a2b; color: white; cursor: pointer; }
    .btn-save:hover { background: #a84c23; }
    .auth-link { display: block; margin-top: 5px; padding: 0; font-size: 0.75rem; color: #c05a2b; background: none; border: none; cursor: pointer; text-decoration: underline; text-align: left; }

    .msg-banner { display: flex; align-items: center; gap: 10px; padding: 13px 18px; border-radius: 8px; margin-bottom: 18px; font-size: 0.875rem; font-weight: 500; }
    .msg-success { background: #e6f4ea; border: 1px solid #9dceab; color: #1e6634; }
    .msg-error { background: #fdf0f0; border: 1px solid #efb8b8; color: #b53030; }
    .check-icon { font-size: 1rem; line-height: 1; }

    .table-card { border: 1.5px solid #c4bab0; border-radius: 10px; overflow: hidden; margin-bottom: 18px; }
    .table-head { display: grid; grid-template-columns: 196px 168px 1fr; padding: 10px 24px; background: #e4dfd2; border-bottom: 1.5px solid #c4bab0; }
    .table-head span { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #8a7e70; }
    .table-row { display: grid; grid-template-columns: 196px 168px 1fr; padding: 20px 24px; align-items: start; background: #f0ece2; border-bottom: 1px solid #ddd6c6; }
    .table-row:last-child { border-bottom: none; }

    .integration-name { font-weight: 600; font-size: 0.95rem; }
    .integration-sub { font-size: 0.8rem; color: #7a7060; margin-top: 3px; }

    .status-cell { display: flex; align-items: center; gap: 7px; font-size: 0.82rem; padding-top: 2px; }
    .status-cell .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .status-ok { color: #2e7d4f; }
    .status-ok .status-dot { background: #2e7d4f; }
    .status-warn { color: #c87830; }
    .status-warn .status-dot { background: #c87830; }

    .creds { display: flex; gap: 12px; }
    .cred-field { flex: 1; min-width: 0; }
    .cred-field label { display: block; font-size: 0.78rem; font-weight: 500; color: #524838; margin-bottom: 5px; }
    .cred-field input { width: 100%; padding: 7px 10px; border: 1px solid #c4bab0; border-radius: 6px; font-size: 0.78rem; font-family: 'SF Mono', 'Fira Code', monospace; background: white; color: #2a2218; }
    .cred-field input:focus { outline: none; border-color: #c05a2b; box-shadow: 0 0 0 2px rgba(192,90,43,0.14); }
    .cred-field input::placeholder { color: #b4a898; }
    .locked-wrap { position: relative; cursor: pointer; }
    .locked-wrap:hover .locked-input { border-color: #c05a2b; }
    .locked-input { background: #e8e4d8 !important; color: #7a7060 !important; cursor: pointer; }
    .locked-input::placeholder { color: #8a7e70 !important; }
    .edit-icon { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); font-size: 0.78rem; color: #8a7e70; pointer-events: none; }

    .footer-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border: 1.5px solid #c4bab0; border-radius: 8px; background: #e4dfd2; }
    .footer-meta { font-size: 0.82rem; color: #7a7060; }

    .card { background: #f0ece2; border: 1.5px solid #c4bab0; border-radius: 10px; padding: 20px 24px; margin-top: 18px; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .section-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #8a7e70; }
    .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 500; padding: 2px 8px; border-radius: 9999px; }
    .badge::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
    .badge-ok { color: #2e7d4f; background: #e6f4ea; }
    .badge-ok::before { background: #2e7d4f; }
    .dist-bar { display: flex; gap: 6px; align-items: center; margin: 10px 0 6px; font-size: 0.78rem; color: #524838; flex-wrap: wrap; }
    .dist-bar .cat { display: flex; align-items: center; gap: 4px; }
    .dist-bar .bar { display: inline-block; height: 8px; border-radius: 4px; }
    .suggestion { display: flex; align-items: center; justify-content: space-between; background: #fef9f0; border: 1px solid #e8c87a; border-radius: 6px; padding: 10px 14px; margin-top: 12px; gap: 12px; }
    .suggestion p { font-size: 0.84rem; color: #78350f; margin: 0; }
    .suggestion .savings { font-size: 0.72rem; color: #92400e; margin-top: 2px; }
    .btn-apply { background: #c05a2b; color: white; border: none; border-radius: 5px; padding: 6px 14px; font-size: 0.82rem; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .btn-apply:hover { background: #a84c23; }
    .section-on { color: #2e7d4f; font-weight: 600; }
    .section-off { color: #c87830; font-weight: 600; }
    .re-enable-row { margin-top: 10px; font-size: 0.8rem; color: #8a7e70; }
    .re-enable-row a { color: #c05a2b; text-decoration: none; cursor: pointer; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        <h1>ZeroCall</h1>
        <p>Configure integrations and check connection status.</p>
      </div>
      <div class="header-right">
        ${syncHtml}
        <button type="submit" form="sync-form" class="btn-sync">
          <span class="sync-dot"></span>
          Sync now
        </button>
      </div>
    </div>

    ${errorsHtml}${savedHtml}

    <form id="sync-form" method="POST" action="/setup/sync"></form>
    <form id="google-auth-form" method="POST" action="/setup/connect-google"></form>

    <form method="POST" action="/setup">
      <div class="table-card">
        <div class="table-head">
          <span>Integration</span>
          <span>Status</span>
          <span>Credentials</span>
        </div>

        <div class="table-row">
          <div>
            <div class="integration-name">Google</div>
            <div class="integration-sub">Gmail + Calendar</div>
          </div>
          <div>${googleStatus}</div>
          <div class="creds">
            ${credField('Client ID', 'GOOGLE_CLIENT_ID', env('GOOGLE_CLIENT_ID'), '123456789-abc … apps.go…', 'text', config.present.includes('GOOGLE_CLIENT_ID'))}
            ${credField('Client Secret', 'GOOGLE_CLIENT_SECRET', '', 'GOCSPX- …', 'password', config.present.includes('GOOGLE_CLIENT_SECRET'))}
          </div>
        </div>

        <div class="table-row">
          <div>
            <div class="integration-name">Notion</div>
            <div class="integration-sub">Tasks DB</div>
          </div>
          <div>${statusCell(notionOk, notionOk ? 'Connected' : 'Not configured')}</div>
          <div class="creds">
            ${credField('Integration Token', 'NOTION_TOKEN', '', 'ntn_ or secret_ …', 'password', config.present.includes('NOTION_TOKEN'))}
            ${credField('Database ID', 'NOTION_DATABASE_ID', env('NOTION_DATABASE_ID'), 'xxxx…', 'text', config.present.includes('NOTION_DATABASE_ID'))}
          </div>
        </div>

        <div class="table-row">
          <div>
            <div class="integration-name">Anthropic</div>
            <div class="integration-sub">Demo benchmarks</div>
          </div>
          <div>${statusCell(anthropicOk, anthropicOk ? 'Set' : 'Not set')}</div>
          <div class="creds">
            ${credField('API Key', 'ANTHROPIC_API_KEY', '', 'sk-ant- …', 'password', anthropicOk)}
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span class="footer-meta">3 integrations &middot; ${connectedCount} connected &middot; ${pendingCount} field${pendingCount !== 1 ? 's' : ''} pending</span>
        <button type="submit" class="btn-save">Save all</button>
      </div>
    </form>

    ${renderAdaptiveCard()}
  </div>
  <script>
    function unlockField(wrap) {
      if (wrap.dataset.unlocked) return;
      wrap.dataset.unlocked = '1';
      var input = wrap.querySelector('input');
      var icon = wrap.querySelector('.edit-icon');
      input.readOnly = false;
      input.classList.remove('locked-input');
      wrap.style.cursor = 'default';
      if (icon) icon.remove();
      if (wrap.dataset.fieldType === 'password') input.value = '';
      input.focus();
    }
  </script>
</body>
</html>`;
}

/**
 * Handles POST /setup. Ignores empty values so existing keys aren't overwritten with blanks.
 * Returns a redirect on success, or errors for re-render.
 */
export function handleSetupPost(
  body: Record<string, string>
): { ok: true; redirect: string } | { ok: false; errors: string[] } {
  const nonEmpty = Object.fromEntries(Object.entries(body).filter(([, v]) => v.trim() !== ''));

  const errors = validatePartial(nonEmpty);
  if (errors.length) return { ok: false, errors };

  try {
    writeConfig(nonEmpty);
    const count = Object.keys(nonEmpty).length;
    const msg = encodeURIComponent(`Settings saved · ${count} field${count !== 1 ? 's' : ''} written`);
    return { ok: true, redirect: `/setup?saved=${msg}` };
  } catch (e: any) {
    return { ok: false, errors: [e.message] };
  }
}
