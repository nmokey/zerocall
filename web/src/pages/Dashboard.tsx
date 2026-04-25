import { useEffect, useState, useCallback } from 'react';
import { getStatus, getSnapshot, triggerSync, WorkStateSnapshot, Status } from '../api';

// Per-query savings derived from benchmark runs (demo/benchmark.ts)
const BENCHMARK = { toolCalls: { without: 5, with: 0 }, turns: { without: 3, with: 1 }, tokenReduction: 88, latencyReduction: 67 };

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<WorkStateSnapshot | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [snap, stat] = await Promise.all([getSnapshot(), getStatus()]);
    setSnapshot(snap);
    setStatus(stat);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleSync() {
    setSyncing(true);
    try {
      await triggerSync();
      // Poll until the sync completes (lastSync timestamp changes)
      const before = status?.lastSync;
      const poll = setInterval(async () => {
        const s = await getStatus();
        if (s.lastSync !== before) {
          clearInterval(poll);
          setSyncing(false);
          refresh();
        }
      }, 1500);
    } catch {
      setSyncing(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>OneCall</h1>
            {status?.lastSync && (
              <p style={styles.syncTime}>
                Last sync: {new Date(status.lastSync).toLocaleTimeString()}
                {status.lastSyncSuccess === false && <span style={{ color: '#e53e3e', marginLeft: 8 }}>with errors</span>}
              </p>
            )}
          </div>
          <button style={{ ...styles.button, opacity: syncing ? 0.7 : 1 }} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Section title="Integrations">
            <IntegrationRow label="Gmail" active={snapshot?.meta.sources.includes('gmail') ?? false} />
            <IntegrationRow label="Google Calendar" active={snapshot?.meta.sources.includes('gcal') ?? false} />
            <IntegrationRow label="Notion" active={snapshot?.meta.sources.includes('notion') ?? false} />
          </Section>
          <Section title="Per-Query Impact">
            <StatRow label="Tool calls" value={`${BENCHMARK.toolCalls.with}`} comparison={`vs. ${BENCHMARK.toolCalls.without} without`} highlight />
            <StatRow label="LLM turns" value={`${BENCHMARK.turns.with}`} comparison={`vs. ${BENCHMARK.turns.without} without`} />
            <StatRow label="Token reduction" value={`~${BENCHMARK.tokenReduction}%`} />
            <StatRow label="Latency" value={`~${BENCHMARK.latencyReduction}% faster`} />
          </Section>
        </div>

        {!snapshot ? (
          <div style={styles.card}>
            <p style={{ color: '#888', fontSize: 14 }}>No snapshot yet — sync in progress.</p>
          </div>
        ) : (
          <>
            <ContextSummary snapshot={snapshot} />
            {snapshot.meta.errors.length > 0 && (
              <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#c53030' }}>
                <strong>Sync errors:</strong> {snapshot.meta.errors.join(' · ')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionLabel}>{title}</h2>
      {children}
    </div>
  );
}

function ContextSummary({ snapshot }: { snapshot: WorkStateSnapshot }) {
  const stats = [
    { value: snapshot.email.action_required.length, label: 'Emails need reply', accent: snapshot.email.action_required.length > 0 },
    { value: snapshot.email.awaiting_reply.length, label: 'Awaiting your reply', accent: false },
    { value: snapshot.email.unread_count, label: 'Unread emails', accent: false },
    { value: snapshot.calendar.today.length, label: "Today's meetings", accent: false },
    { value: snapshot.calendar.upcoming_deadlines.length, label: 'Deadlines this week', accent: snapshot.calendar.upcoming_deadlines.length > 0 },
    { value: snapshot.tasks.overdue.length, label: 'Overdue tasks', accent: snapshot.tasks.overdue.length > 0 },
    { value: snapshot.tasks.due_today.length, label: 'Due today', accent: false },
    { value: snapshot.tasks.in_progress.length, label: 'In progress', accent: false },
  ];
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionLabel}>What Claude knows right now</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ textAlign: 'center', padding: '12px 8px', background: '#f9f9f9', borderRadius: 6 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.accent ? '#e53e3e' : '#1a1a1a', lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.3 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#22c55e' : '#d1d5db', flexShrink: 0, display: 'inline-block' }} />
      <span>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 11, color: active ? '#16a34a' : '#9ca3af' }}>{active ? 'Synced' : 'Pending'}</span>
    </div>
  );
}

function StatRow({ label, value, comparison, highlight }: { label: string; value: string; comparison?: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <span style={{ color: '#555', minWidth: 100 }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight ? '#4f46e5' : '#1a1a1a' }}>{value}</span>
      {comparison && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{comparison}</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#f5f5f5', minHeight: '100vh', padding: '32px 20px', color: '#1a1a1a' },
  container: { maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title: { fontSize: '1.4rem', fontWeight: 600, marginBottom: 4 },
  syncTime: { fontSize: 12, color: '#888' },
  card: { background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  sectionLabel: { fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', marginBottom: 12 },
  button: { padding: '8px 16px', background: '#4f46e5', color: 'white', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 6, cursor: 'pointer' },
};
