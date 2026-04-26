import React, { useEffect, useRef, useState } from 'react';
import { getConfig, getGoogleAuthUrl, getStatus, postConfig, triggerSync, type ApiConfig, type ApiStatus } from '../api';
import type { Theme } from '../theme';

interface Props {
  onDone: () => void;
  T: Theme;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CredFieldProps {
  label: string;
  name: string;
  value: string;
  placeholder: string;
  type?: 'text' | 'password';
  isSet?: boolean;
  onChange: (v: string) => void;
  T: Theme;
}

function CredField({ label, name, value, placeholder, type = 'text', isSet = false, onChange, T }: CredFieldProps) {
  const [locked, setLocked] = useState(isSet);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocked(isSet); }, [isSet]);

  function unlock() {
    if (!locked) return;
    setLocked(false);
    onChange('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    border: `1px solid ${T.border}`,
    borderRadius: '6px',
    fontSize: '0.78rem',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    background: locked ? T.lockedBg : T.inputBg,
    color: locked ? T.lockedText : T.text,
    cursor: locked ? 'pointer' : 'text',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: T.label, marginBottom: 5 }}>{label}</label>
      <div style={{ position: 'relative' }} onClick={unlock}>
        <input
          ref={inputRef}
          type={locked ? type : type}
          id={name}
          name={name}
          value={locked ? value : value}
          placeholder={locked ? value : placeholder}
          readOnly={locked}
          autoComplete="off"
          spellCheck={false}
          onChange={e => onChange(e.target.value)}
          onFocus={e => { if (!locked) e.target.style.borderColor = T.primary; }}
          onBlur={e => { e.target.style.borderColor = T.border; }}
          style={inputStyle}
        />
        {locked && (
          <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', color: T.dimmer, pointerEvents: 'none' }}>✎</span>
        )}
      </div>
    </div>
  );
}

function StatusDot({ ok, label, T }: { ok: boolean; label: string; T: Theme }) {
  const color = ok ? T.success : T.warn;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.82rem', color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
      {label}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Setup({ onDone, T }: Props) {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    NOTION_TOKEN: '',
    NOTION_DATABASE_ID: '',
    SLACK_USER_TOKEN: '',
    ANTHROPIC_API_KEY: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([getStatus(), getConfig()]).then(([s, c]) => {
      setStatus(s);
      setConfig(c);
      if (c.values) {
        setFields({
          GOOGLE_CLIENT_ID: c.values.GOOGLE_CLIENT_ID || '',
          GOOGLE_CLIENT_SECRET: c.values.GOOGLE_CLIENT_SECRET || '',
          NOTION_TOKEN: c.values.NOTION_TOKEN || '',
          NOTION_DATABASE_ID: c.values.NOTION_DATABASE_ID || '',
          SLACK_USER_TOKEN: c.values.SLACK_USER_TOKEN || '',
          ANTHROPIC_API_KEY: c.values.ANTHROPIC_API_KEY || '',
        });
      }
    });
  }, []);

  function setField(key: string, val: string) {
    setFields(f => ({ ...f, [key]: val }));
    setDirty(d => new Set(d).add(key));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const nonEmpty = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v.trim() && dirty.has(k)));
    try {
      await postConfig(nonEmpty);
      const [s, c] = await Promise.all([getStatus(), getConfig()]);
      setStatus(s);
      setConfig(c);
      if (c.values) {
        setFields({
          GOOGLE_CLIENT_ID: c.values.GOOGLE_CLIENT_ID || '',
          GOOGLE_CLIENT_SECRET: c.values.GOOGLE_CLIENT_SECRET || '',
          NOTION_TOKEN: c.values.NOTION_TOKEN || '',
          NOTION_DATABASE_ID: c.values.NOTION_DATABASE_ID || '',
          SLACK_USER_TOKEN: c.values.SLACK_USER_TOKEN || '',
          ANTHROPIC_API_KEY: c.values.ANTHROPIC_API_KEY || '',
        });
      }
      setDirty(new Set());
      const count = Object.keys(nonEmpty).length;
      setMessage({ type: 'success', text: `Settings saved · ${count} field${count !== 1 ? 's' : ''} written` });
      if (s.configured && s.authenticated) onDone();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    const previousLastSync = status?.lastSync;
    setSyncing(true);
    await triggerSync().catch(() => null);

    // Poll until lastSync timestamp changes, then update status
    const pollInterval = setInterval(async () => {
      try {
        const newStatus = await getStatus();
        if (newStatus.lastSync !== null && newStatus.lastSync !== previousLastSync) {
          clearInterval(pollInterval);
          setStatus(newStatus);
          setSyncing(false);
        }
      } catch {
        clearInterval(pollInterval);
        setSyncing(false);
      }
    }, 1000);
  }

  async function handleGoogleAuth() {
    try {
      const { url } = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const present = config?.present ?? [];
  const googleCredOk = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].every(k => present.includes(k));
  const googleAuthed = status?.authenticated ?? false;
  const notionOk = ['NOTION_TOKEN', 'NOTION_DATABASE_ID'].every(k => present.includes(k));
  const slackOk = present.includes('SLACK_USER_TOKEN');
  const anthropicOk = present.includes('ANTHROPIC_API_KEY');
  const connectedCount = [googleCredOk && googleAuthed, notionOk, slackOk, anthropicOk].filter(Boolean).length;
  const allFields = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NOTION_TOKEN', 'NOTION_DATABASE_ID', 'SLACK_USER_TOKEN', 'ANTHROPIC_API_KEY'];
  const pendingCount = allFields.filter(k => !present.includes(k)).length;

  const lastSync = status?.lastSync;
  const syncLabel = lastSync ? (() => {
    const now = new Date();
    const syncTime = new Date(lastSync);
    const diffMs = now.getTime() - syncTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'last sync · just now · ';
    if (diffMins < 60) return `last sync · ${diffMins} minute${diffMins !== 1 ? 's' : ''} ago · `;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `last sync · ${diffHours} hour${diffHours !== 1 ? 's' : ''} ago · `;
    const diffDays = Math.floor(diffHours / 24);
    return `last sync · ${diffDays} day${diffDays !== 1 ? 's' : ''} ago · `;
  })() : 'No sync yet';

  const tableHead: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '196px 168px 1fr',
    padding: '10px 24px',
    background: T.cardHead,
    borderBottom: `1.5px solid ${T.border}`,
  };
  const tableRow: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '196px 168px 1fr',
    padding: '20px 24px',
    alignItems: 'start',
    background: T.card,
    borderBottom: `1px solid ${T.tableRowBorder}`,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: '0.68rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: T.dimmer,
  };

  return (
    <div style={{ padding: '48px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em', color: T.text }}>Setup</h1>
          <p style={{ color: T.muted, fontSize: '0.875rem', marginTop: 5 }}>Configure integrations and check connection status.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4 }}>
          {lastSync && (
            <span style={{ fontSize: '0.78rem', color: T.dimmer }}>
              {syncLabel}
              <span style={{ color: status?.lastSyncSuccess ? T.success : T.error, fontWeight: 500 }}>
                {status?.lastSyncSuccess ? '✓ success' : '✗ failed'}
              </span>
            </span>
          )}
          {!lastSync && !syncing && <span style={{ fontSize: '0.78rem', color: T.dimmer }}>No sync yet</span>}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 500, fontFamily: 'inherit', border: `1px solid ${T.border}`, borderRadius: 6, background: syncing ? T.inputBg : T.primary, color: syncing ? T.text : 'white', cursor: syncing ? 'default' : 'pointer', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Banner */}
      {message && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderRadius: 8, marginBottom: 18, fontSize: '0.875rem', fontWeight: 500, background: message.type === 'success' ? T.successBg : T.errorBg, border: `1px solid ${message.type === 'success' ? T.successBorder : T.errorBorder}`, color: message.type === 'success' ? T.success : T.error }}>
          <span>{message.type === 'success' ? '✓' : '✗'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave}>
        <div style={{ border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
          <div style={tableHead}>
            <span style={sectionLabel}>Integration</span>
            <span style={sectionLabel}>Status</span>
            <span style={sectionLabel}>Credentials</span>
          </div>

          {/* Google */}
          <div style={tableRow}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: T.text }}>Google</div>
              <div style={{ fontSize: '0.8rem', color: T.muted, marginTop: 3 }}>Gmail + Calendar</div>
            </div>
            <div>
              {!googleCredOk && <StatusDot ok={false} label="Not configured" T={T} />}
              {googleCredOk && !googleAuthed && (
                <>
                  <StatusDot ok={false} label="Auth required" T={T} />
                  <button type="button" onClick={handleGoogleAuth} style={{ display: 'block', marginTop: 5, padding: 0, fontSize: '0.75rem', fontFamily: 'inherit', color: T.primary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Authorize →
                  </button>
                </>
              )}
              {googleCredOk && googleAuthed && <StatusDot ok={true} label="Connected" T={T} />}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <CredField label="Client ID" name="GOOGLE_CLIENT_ID" value={fields.GOOGLE_CLIENT_ID} placeholder="123456789-abc…apps.go…" isSet={present.includes('GOOGLE_CLIENT_ID')} onChange={v => setField('GOOGLE_CLIENT_ID', v)} T={T} />
              <CredField label="Client Secret" name="GOOGLE_CLIENT_SECRET" value={fields.GOOGLE_CLIENT_SECRET} placeholder="GOCSPX-…" type="password" isSet={present.includes('GOOGLE_CLIENT_SECRET')} onChange={v => setField('GOOGLE_CLIENT_SECRET', v)} T={T} />
            </div>
          </div>

          {/* Notion */}
          <div style={tableRow}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: T.text }}>Notion</div>
              <div style={{ fontSize: '0.8rem', color: T.muted, marginTop: 3 }}>Tasks DB</div>
            </div>
            <div><StatusDot ok={notionOk} label={notionOk ? 'Connected' : 'Not configured'} T={T} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <CredField label="Integration Token" name="NOTION_TOKEN" value={fields.NOTION_TOKEN} placeholder="ntn_ or secret_…" type="password" isSet={present.includes('NOTION_TOKEN')} onChange={v => setField('NOTION_TOKEN', v)} T={T} />
              <CredField label="Database ID" name="NOTION_DATABASE_ID" value={fields.NOTION_DATABASE_ID} placeholder="xxxx…" isSet={present.includes('NOTION_DATABASE_ID')} onChange={v => setField('NOTION_DATABASE_ID', v)} T={T} />
            </div>
          </div>

          {/* Slack */}
          <div style={tableRow}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: T.text }}>Slack</div>
              <div style={{ fontSize: '0.8rem', color: T.muted, marginTop: 3 }}>DMs</div>
            </div>
            <div><StatusDot ok={slackOk} label={slackOk ? 'Connected' : 'Not configured'} T={T} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <CredField label="User Token" name="SLACK_USER_TOKEN" value={fields.SLACK_USER_TOKEN} placeholder="xoxp-…" type="password" isSet={slackOk} onChange={v => setField('SLACK_USER_TOKEN', v)} T={T} />
            </div>
          </div>

          {/* Anthropic */}
          <div style={{ ...tableRow, borderBottom: 'none' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: T.text }}>Anthropic</div>
              <div style={{ fontSize: '0.8rem', color: T.muted, marginTop: 3 }}>Demo benchmarks</div>
            </div>
            <div><StatusDot ok={anthropicOk} label={anthropicOk ? 'Set' : 'Not set'} T={T} /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <CredField label="API Key" name="ANTHROPIC_API_KEY" value={fields.ANTHROPIC_API_KEY} placeholder="sk-ant-…" type="password" isSet={anthropicOk} onChange={v => setField('ANTHROPIC_API_KEY', v)} T={T} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', border: `1.5px solid ${T.border}`, borderRadius: 8, background: T.cardHead }}>
          <span style={{ fontSize: '0.82rem', color: T.muted }}>
            4 integrations · {connectedCount} connected · {pendingCount} field{pendingCount !== 1 ? 's' : ''} pending
          </span>
          <button type="submit" disabled={saving} style={{ padding: '9px 24px', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', border: 'none', borderRadius: 7, background: T.primary, color: 'white', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {saving ? 'Saving…' : 'Save all'}
          </button>
        </div>
      </form>
    </div>
  );
}
