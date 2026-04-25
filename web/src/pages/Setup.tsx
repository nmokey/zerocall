import { useEffect, useState } from 'react';
import { getConfig, postConfig, getGoogleAuthUrl } from '../api';

interface Props {
  onComplete: () => void;
}

type Step = 'credentials' | 'oauth';

const FIELD_HINTS: Record<string, string> = {
  GOOGLE_CLIENT_ID: 'console.cloud.google.com → Credentials → OAuth 2.0 Client ID (Web). Enable Gmail API + Calendar API. Add http://localhost:3000/oauth2callback as a redirect URI.',
  GOOGLE_CLIENT_SECRET: '',
  NOTION_TOKEN: 'notion.so/my-integrations → New integration → Internal Integration Secret. Then share your task database with the integration via Connections.',
  NOTION_DATABASE_ID: 'Found in your database URL: notion.so/{workspace}/THIS-PART?v=...',
};

export default function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('credentials');
  const [values, setValues] = useState<Record<string, string>>({
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/oauth2callback',
    NOTION_TOKEN: '',
    NOTION_DATABASE_ID: '',
    ANTHROPIC_API_KEY: '',
    WORK_DAY_START: '09:00',
    WORK_DAY_END: '18:00',
    SYNC_INTERVAL_MINUTES: '15',
  });
  const [integrations, setIntegrations] = useState({ gmail: true, calendar: true, notion: true });
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Skip credentials step if already configured
  useEffect(() => {
    getConfig().then(c => {
      if (c.missing.length === 0) setStep('oauth');
      if (c.integrations) setIntegrations(c.integrations);
    });
  }, []);

  function set(key: string, value: string) {
    setValues(v => ({ ...v, [key]: value }));
  }

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    try {
      const result = await postConfig({ ...values, integrations: integrations as any });
      if (result.errors?.length) {
        setErrors(result.errors);
      } else {
        setStep('oauth');
      }
    } catch (err: any) {
      setErrors([err.message]);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConnectGoogle() {
    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (err: any) {
      setErrors([err.message]);
    }
  }

  if (step === 'oauth') {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <h1 style={styles.title}>OneCall</h1>
          <p style={styles.subtitle}>Connect your accounts to get started.</p>
          {errors.length > 0 && (
            <div style={styles.errorBox}>
              {errors.map((e, i) => <p key={i} style={{ margin: '2px 0' }}>{e}</p>)}
            </div>
          )}
          {(integrations.gmail || integrations.calendar) && (
            <div style={styles.card}>
              <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
                OneCall needs read-only access to Gmail and Google Calendar to build your work context snapshot.
              </p>
              <button style={styles.button} onClick={handleConnectGoogle}>
                Connect Google Account
              </button>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#999', marginTop: 16, textAlign: 'center' }}>
            Already connected?{' '}
            <span style={{ color: '#4f46e5', cursor: 'pointer' }} onClick={onComplete}>
              Go to dashboard
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>OneCall</h1>
        <p style={styles.subtitle}>Select integrations and enter credentials once — OneCall handles the rest.</p>
        {errors.length > 0 && (
          <div style={styles.errorBox}>
            {errors.map((e, i) => <p key={i} style={{ margin: '2px 0' }}>{e}</p>)}
          </div>
        )}
        <form onSubmit={handleCredentialsSubmit}>
          <div style={styles.card}>
            <h2 style={styles.sectionLabel}>Integrations</h2>
            <Checkbox label="Gmail" checked={integrations.gmail} onChange={c => setIntegrations(p => ({ ...p, gmail: c }))} hint="Sync email threads requiring action" />
            <Checkbox label="Google Calendar" checked={integrations.calendar} onChange={c => setIntegrations(p => ({ ...p, calendar: c }))} hint="Sync events and calculate free blocks" />
            <Checkbox label="Notion" checked={integrations.notion} onChange={c => setIntegrations(p => ({ ...p, notion: c }))} hint="Sync tasks by due date and status" />
          </div>

          {(integrations.gmail || integrations.calendar) && (
            <div style={styles.card}>
              <h2 style={styles.sectionLabel}>Google OAuth</h2>
              <Field label="Client ID" required name="GOOGLE_CLIENT_ID" value={values.GOOGLE_CLIENT_ID} onChange={v => set('GOOGLE_CLIENT_ID', v)} hint={FIELD_HINTS.GOOGLE_CLIENT_ID} placeholder="123456789-abc...apps.googleusercontent.com" />
              <Field label="Client Secret" required name="GOOGLE_CLIENT_SECRET" type="password" value={values.GOOGLE_CLIENT_SECRET} onChange={v => set('GOOGLE_CLIENT_SECRET', v)} hint="" placeholder="GOCSPX-..." />
              <Field label="Redirect URI" name="GOOGLE_REDIRECT_URI" value={values.GOOGLE_REDIRECT_URI} onChange={v => set('GOOGLE_REDIRECT_URI', v)} hint="Must match what you entered in Google Cloud Console." />
            </div>
          )}

          {integrations.notion && (
            <div style={styles.card}>
              <h2 style={styles.sectionLabel}>Notion</h2>
              <Field label="Integration Token" required name="NOTION_TOKEN" type="password" value={values.NOTION_TOKEN} onChange={v => set('NOTION_TOKEN', v)} hint={FIELD_HINTS.NOTION_TOKEN} placeholder="ntn_ or secret_..." />
              <Field label="Database ID" required name="NOTION_DATABASE_ID" value={values.NOTION_DATABASE_ID} onChange={v => set('NOTION_DATABASE_ID', v)} hint={FIELD_HINTS.NOTION_DATABASE_ID} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
          )}

          <div style={styles.card}>
            <h2 style={styles.sectionLabel}>Optional</h2>
            <Field label="Anthropic API Key" name="ANTHROPIC_API_KEY" type="password" value={values.ANTHROPIC_API_KEY} onChange={v => set('ANTHROPIC_API_KEY', v)} hint="Only needed for the demo benchmark scripts." placeholder="sk-ant-..." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <Field label="Work Day Start" name="WORK_DAY_START" type="time" value={values.WORK_DAY_START} onChange={v => set('WORK_DAY_START', v)} />
              <Field label="Work Day End" name="WORK_DAY_END" type="time" value={values.WORK_DAY_END} onChange={v => set('WORK_DAY_END', v)} />
            </div>
            <Field label="Sync Interval (min)" name="SYNC_INTERVAL_MINUTES" type="number" value={values.SYNC_INTERVAL_MINUTES} onChange={v => set('SYNC_INTERVAL_MINUTES', v)} />
          </div>

          <button style={{ ...styles.button, opacity: submitting ? 0.7 : 1 }} type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, name, value, onChange, required, type = 'text', placeholder, hint,
}: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  required?: boolean; type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div style={{ marginBottom: hint || placeholder ? 16 : 0 }}>
      <label style={styles.label}>
        {label}{required && <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={styles.input}
      />
      {hint && <p style={styles.hint}>{hint}</p>}
    </div>
  );
}

function Checkbox({
  label, checked, onChange, hint,
}: {
  label: string; checked: boolean; onChange: (c: boolean) => void; hint?: string;
}) {
  return (
    <div style={{ marginBottom: hint ? 16 : 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
      </label>
      {hint && <p style={styles.hint}>{hint}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#f5f5f5', minHeight: '100vh', padding: '40px 20px', color: '#1a1a1a' },
  container: { maxWidth: 560, margin: '0 auto' },
  title: { fontSize: '1.5rem', fontWeight: 600, marginBottom: 4 },
  subtitle: { color: '#666', fontSize: '0.9rem', marginBottom: 32 },
  card: { background: 'white', borderRadius: 8, padding: 24, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  sectionLabel: { fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', marginBottom: 16 },
  label: { display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 4 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.875rem', fontFamily: "'SF Mono', 'Fira Code', monospace", boxSizing: 'border-box' },
  hint: { fontSize: '0.78rem', color: '#888', marginTop: 5, lineHeight: 1.5 },
  button: { width: '100%', padding: 11, background: '#4f46e5', color: 'white', fontSize: '0.95rem', fontWeight: 500, border: 'none', borderRadius: 6, cursor: 'pointer', marginTop: 4 },
  errorBox: { background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: 6, padding: '12px 16px', marginBottom: 16, color: '#c53030', fontSize: '0.875rem' },
};
