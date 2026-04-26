import React, { useEffect, useRef, useState } from 'react';
import { getConfig, getGoogleAuthUrl, getStatus, postConfig, triggerSync, type ApiConfig, type ApiStatus } from '../api';
import styles from './Setup.module.css';

interface Props {
  onDone: () => void;
}

interface CredFieldProps {
  label: string;
  name: string;
  value: string;
  placeholder: string;
  type?: 'text' | 'password';
  isSet?: boolean;
  onChange: (v: string) => void;
}

function CredField({ label, name, value, placeholder, type = 'text', isSet = false, onChange }: CredFieldProps) {
  const [locked, setLocked] = useState(isSet);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocked(isSet); }, [isSet]);

  function unlock() {
    if (!locked) return;
    setLocked(false);
    onChange('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const inputCls = [styles.credInput, locked ? styles.locked : ''].filter(Boolean).join(' ');

  return (
    <div className={styles.credField}>
      <label className={styles.credLabel}>{label}</label>
      <div className={styles.credInputWrap} onClick={unlock}>
        <input
          ref={inputRef}
          type={type}
          id={name}
          name={name}
          value={value}
          placeholder={locked ? value : placeholder}
          readOnly={locked}
          autoComplete="off"
          spellCheck={false}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        />
        {locked && <span className={styles.credEditIcon}>{'\u270E'}</span>}
      </div>
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  const cls = [styles.statusDot, ok ? styles.ok : styles.warn].join(' ');
  return (
    <div className={cls}>
      <span className={styles.dot} />
      {label}
    </div>
  );
}

export default function Setup({ onDone }: Props) {
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
      setMessage({ type: 'success', text: `Settings saved \u00b7 ${count} field${count !== 1 ? 's' : ''} written` });
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
    if (diffMins < 1) return 'last sync \u00b7 just now \u00b7 ';
    if (diffMins < 60) return `last sync \u00b7 ${diffMins} minute${diffMins !== 1 ? 's' : ''} ago \u00b7 `;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `last sync \u00b7 ${diffHours} hour${diffHours !== 1 ? 's' : ''} ago \u00b7 `;
    const diffDays = Math.floor(diffHours / 24);
    return `last sync \u00b7 ${diffDays} day${diffDays !== 1 ? 's' : ''} ago \u00b7 `;
  })() : 'No sync yet';

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Setup</h1>
          <p className={styles.subtitle}>Configure integrations and check connection status.</p>
        </div>
        <div className={styles.headerActions}>
          {lastSync && (
            <span className={styles.syncLabel}>
              {syncLabel}
              <span className={status?.lastSyncSuccess ? styles.syncSuccess : styles.syncFailed}>
                {status?.lastSyncSuccess ? '\u2713 success' : '\u2717 failed'}
              </span>
            </span>
          )}
          {!lastSync && !syncing && <span className={styles.syncLabel}>No sync yet</span>}
          <button onClick={handleSync} disabled={syncing} className={styles.syncButton}>
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Banner */}
      {message && (
        <div className={`${styles.banner} ${message.type === 'success' ? styles.bannerSuccess : styles.bannerError}`}>
          <span>{message.type === 'success' ? '\u2713' : '\u2717'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave}>
        <div className={styles.table}>
          <div className={styles.tableHead}>
            <span className={styles.sectionLabel}>Integration</span>
            <span className={styles.sectionLabel}>Status</span>
            <span className={styles.sectionLabel}>Credentials</span>
          </div>

          {/* Google */}
          <div className={styles.tableRow}>
            <div>
              <div className={styles.integrationName}>Google</div>
              <div className={styles.integrationDesc}>Gmail + Calendar</div>
            </div>
            <div>
              {!googleCredOk && <StatusDot ok={false} label="Not configured" />}
              {googleCredOk && !googleAuthed && (
                <>
                  <StatusDot ok={false} label="Auth required" />
                  <button type="button" onClick={handleGoogleAuth} className={styles.authLink}>
                    Authorize &rarr;
                  </button>
                </>
              )}
              {googleCredOk && googleAuthed && <StatusDot ok={true} label="Connected" />}
            </div>
            <div className={styles.credRow}>
              <CredField label="Client ID" name="GOOGLE_CLIENT_ID" value={fields.GOOGLE_CLIENT_ID} placeholder="123456789-abc\u2026apps.go\u2026" isSet={present.includes('GOOGLE_CLIENT_ID')} onChange={v => setField('GOOGLE_CLIENT_ID', v)} />
              <CredField label="Client Secret" name="GOOGLE_CLIENT_SECRET" value={fields.GOOGLE_CLIENT_SECRET} placeholder="GOCSPX-\u2026" type="password" isSet={present.includes('GOOGLE_CLIENT_SECRET')} onChange={v => setField('GOOGLE_CLIENT_SECRET', v)} />
            </div>
          </div>

          {/* Notion */}
          <div className={styles.tableRow}>
            <div>
              <div className={styles.integrationName}>Notion</div>
              <div className={styles.integrationDesc}>Tasks DB</div>
            </div>
            <div><StatusDot ok={notionOk} label={notionOk ? 'Connected' : 'Not configured'} /></div>
            <div className={styles.credRow}>
              <CredField label="Integration Token" name="NOTION_TOKEN" value={fields.NOTION_TOKEN} placeholder="ntn_ or secret_\u2026" type="password" isSet={present.includes('NOTION_TOKEN')} onChange={v => setField('NOTION_TOKEN', v)} />
              <CredField label="Database ID" name="NOTION_DATABASE_ID" value={fields.NOTION_DATABASE_ID} placeholder="xxxx\u2026" isSet={present.includes('NOTION_DATABASE_ID')} onChange={v => setField('NOTION_DATABASE_ID', v)} />
            </div>
          </div>

          {/* Slack */}
          <div className={styles.tableRow}>
            <div>
              <div className={styles.integrationName}>Slack</div>
              <div className={styles.integrationDesc}>DMs</div>
            </div>
            <div><StatusDot ok={slackOk} label={slackOk ? 'Connected' : 'Not configured'} /></div>
            <div className={styles.credRow}>
              <CredField label="User Token" name="SLACK_USER_TOKEN" value={fields.SLACK_USER_TOKEN} placeholder="xoxp-\u2026" type="password" isSet={slackOk} onChange={v => setField('SLACK_USER_TOKEN', v)} />
            </div>
          </div>

          {/* Anthropic */}
          <div className={`${styles.tableRow} ${styles.tableRowLast}`}>
            <div>
              <div className={styles.integrationName}>Anthropic</div>
              <div className={styles.integrationDesc}>Demo benchmarks</div>
            </div>
            <div><StatusDot ok={anthropicOk} label={anthropicOk ? 'Set' : 'Not set'} /></div>
            <div className={styles.credRow}>
              <CredField label="API Key" name="ANTHROPIC_API_KEY" value={fields.ANTHROPIC_API_KEY} placeholder="sk-ant-\u2026" type="password" isSet={anthropicOk} onChange={v => setField('ANTHROPIC_API_KEY', v)} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerInfo}>
            4 integrations &middot; {connectedCount} connected &middot; {pendingCount} field{pendingCount !== 1 ? 's' : ''} pending
          </span>
          <button type="submit" disabled={saving} className={styles.saveButton}>
            {saving ? 'Saving\u2026' : 'Save all'}
          </button>
        </div>
      </form>
    </div>
  );
}
