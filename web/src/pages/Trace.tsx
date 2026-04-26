import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AgentRun, TraceResult, ToolCallRecord } from '../api';
import { getStatus } from '../api';
import { useTheme } from '../theme';

// ─── Animations ───────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes oc-spin      { to { transform: rotate(360deg); } }
@keyframes oc-fadein    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes oc-slidein   { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
@keyframes oc-toastin   { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes oc-toastout  { from { opacity: 1; } to { opacity: 0; } }
`;

// ─── Sync toast ───────────────────────────────────────────────────────────────

function SyncToast({ lastSync }: { lastSync: string }) {
  const { T } = useTheme();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, [lastSync]);

  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', top: 16, right: 24, zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 16px', borderRadius: 8,
      background: T.card, border: `1.5px solid ${T.border}`,
      boxShadow: '0 2px 10px rgba(0,0,0,0.10)',
      fontSize: '0.8rem', color: T.text,
      animation: 'oc-toastin 0.25s ease',
      transition: 'background 0.3s, border-color 0.3s, color 0.3s',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.success, flexShrink: 0, display: 'inline-block' }} />
      Synced \u00b7 {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  const { T } = useTheme();
  return (
    <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'oc-spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 8, flexShrink: 0 }} />
  );
}

// ─── Big delta metrics strip ──────────────────────────────────────────────────

function DeltaStrip({ deltas }: { deltas: TraceResult['deltas'] }) {
  const { T } = useTheme();
  const items = [
    { label: 'tool calls', value: deltas.toolCallsPct },
    { label: 'LLM turns', value: deltas.llmTurnsPct },
    { label: 'latency', value: deltas.latencyPct },
    { label: 'tokens', value: deltas.tokensPct },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 12, marginBottom: 20, animation: 'oc-fadein 0.4s ease' }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{ textAlign: 'center', padding: '20px 12px', background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, borderTop: `4px solid ${T.withAccent}` }}>
          <div style={{ fontSize: '3rem', fontWeight: 800, color: T.withAccent, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {value}%
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginTop: 8 }}>
            fewer {label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bar graph ────────────────────────────────────────────────────────────────

function MetricsBarGraph({ without, with: with_, deltas }: { without: AgentRun; with: AgentRun; deltas: TraceResult['deltas'] }) {
  const { T } = useTheme();
  const withoutTokens = without.inputTokens + without.outputTokens;
  const withTokens = with_.inputTokens + with_.outputTokens;

  const metrics = [
    { label: 'Tool calls', without: without.toolCalls.length, with: with_.toolCalls.length, pct: deltas.toolCallsPct },
    { label: 'LLM turns',  without: without.llmTurns,         with: with_.llmTurns,         pct: deltas.llmTurnsPct },
    { label: 'Latency',    without: without.totalLatencyMs,   with: with_.totalLatencyMs,   pct: deltas.latencyPct, unit: 'ms' },
    { label: 'Tokens',     without: withoutTokens,            with: withTokens,             pct: deltas.tokensPct },
  ];

  function Bar({ value, max, accent, sublabel }: { value: number; max: number; accent: string; sublabel: string }) {
    const height = max > 0 ? (value / max) * 100 : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 6 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: accent }}>{value}</span>
        <div style={{ width: '100%', height: 100, background: T.lockedBg, borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${height}%`, background: accent, transition: 'height 0.4s ease' }} />
        </div>
        <span style={{ fontSize: '0.7rem', color: T.muted, textAlign: 'center' }}>{sublabel}</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 10, marginBottom: 28, animation: 'oc-fadein 0.4s ease' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginBottom: 16 }}>Metrics comparison</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length}, 1fr)`, gap: 16 }}>
        {metrics.map(m => {
          const max = Math.max(m.without, m.with);
          return (
            <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: T.text, textAlign: 'center' }}>{m.label}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Bar value={m.without} max={max} accent={T.withoutAccent} sublabel="Without" />
                <Bar value={m.with}    max={max} accent={T.withAccent}    sublabel="With" />
              </div>
              <div style={{ fontSize: '0.75rem', color: T.success, fontWeight: 600, textAlign: 'center' }}>{m.pct}% fewer</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agent panel ──────────────────────────────────────────────────────────────

function MetricBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const { T } = useTheme();
  return (
    <span style={{ fontSize: '0.75rem', color: T.muted }}>
      {label}: <span style={{ fontWeight: 600, color: color ?? T.text }}>{value}</span>
    </span>
  );
}

function ToolCallList({ calls, inProgress }: { calls: ToolCallRecord[]; inProgress: boolean }) {
  const { T } = useTheme();
  if (calls.length === 0 && !inProgress) {
    return <div style={{ fontSize: '0.82rem', color: T.muted, fontStyle: 'italic' }}>No tool calls</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {calls.map((tc, i) => {
        const argStr = Object.keys(tc.input).length > 0 ? JSON.stringify(tc.input) : '';
        const truncated = argStr.length > 70 ? argStr.slice(0, 70) + '\u2026' : argStr;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '0.78rem', animation: 'oc-slidein 0.25s ease' }}>
            <span style={{ color: T.withoutAccent, fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
            <span style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontWeight: 600, color: T.text }}>{tc.tool}</span>
            {truncated && <span style={{ color: T.dimmer, fontFamily: "'SF Mono', 'Fira Code', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{truncated}</span>}
            <span style={{ color: '#c87830', fontWeight: 500, flexShrink: 0 }}>{tc.latencyMs}ms</span>
          </div>
        );
      })}
      {inProgress && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: T.muted, animation: 'oc-slidein 0.25s ease' }}>
          <span style={{ color: T.withoutAccent, fontWeight: 600, flexShrink: 0 }}>{calls.length + 1}.</span>
          <Spinner size={12} />
          <span>calling tool\u2026</span>
        </div>
      )}
    </div>
  );
}

interface AgentPanelProps {
  label: string;
  accent: string;
  run: AgentRun | null;
  liveToolCalls?: ToolCallRecord[];
  waiting?: boolean;
}

function AgentPanel({ label, accent, run, liveToolCalls = [], waiting = false }: AgentPanelProps) {
  const { T } = useTheme();
  const isLive = !run;

  if (isLive && liveToolCalls.length === 0 && !waiting) {
    return (
      <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card }}>
        <div style={{ padding: '14px 20px', background: T.cardHead, borderBottom: `3px solid ${accent}` }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent }}>{label}</div>
        </div>
        <div style={{ padding: '48px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: '0.85rem' }}>
          <Spinner />Running\u2026
        </div>
      </div>
    );
  }

  if (isLive) {
    return (
      <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card }}>
        <div style={{ padding: '14px 20px', background: T.cardHead, borderBottom: `3px solid ${accent}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent, flex: 1 }}>{label}</div>
          <Spinner size={13} />
        </div>
        <div style={{ padding: '16px 20px' }}>
          <ToolCallList calls={liveToolCalls} inProgress={true} />
        </div>
      </div>
    );
  }

  const totalTokens = run!.inputTokens + run!.outputTokens;
  return (
    <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card, animation: 'oc-fadein 0.35s ease' }}>
      <div style={{ padding: '14px 20px', background: T.cardHead, borderBottom: `3px solid ${accent}` }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent }}>{label}</div>
      </div>

      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        {run!.snapshotInjected ? (
          <div style={{ fontSize: '0.82rem', color: T.withAccent }}>
            <span style={{ fontWeight: 600 }}>\u2726 Work context auto-injected</span>
            <div style={{ color: T.muted, marginTop: 4, fontSize: '0.78rem' }}>0 tool calls \u2014 harness injected the snapshot before first token</div>
          </div>
        ) : (
          <ToolCallList calls={run!.toolCalls} inProgress={false} />
        )}
      </div>

      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginBottom: 10 }}>Response</div>
        <div style={{ fontSize: '0.85rem', color: T.text, lineHeight: 1.65 }}>
          <ReactMarkdown>{run!.finalResponse}</ReactMarkdown>
        </div>
      </div>

      <div style={{ padding: '12px 20px', background: T.cardHead, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <MetricBadge label="Latency" value={`${run!.totalLatencyMs}ms`} color={accent} />
        <MetricBadge label="Tokens" value={totalTokens} />
        <MetricBadge label="Tool calls" value={run!.toolCalls.length} color={accent} />
        <MetricBadge label="LLM turns" value={run!.llmTurns} />
      </div>
    </div>
  );
}

// ─── Main Trace page ──────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  'What should I focus on right now?',
  'Am I free at 3pm today?',
  'What tasks are overdue?',
  'Did anyone email me urgently?',
];

type StreamState = {
  prompt: string;
  without: AgentRun | null;
  with: AgentRun | null;
  liveToolCalls: ToolCallRecord[];
  deltas: TraceResult['deltas'] | null;
};

function pctReduction(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round((from - to) / from * 100);
}

export default function Trace() {
  const { T } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const lastSyncRef = useRef<string | null>(null);

  // Poll /api/status every 30s and show a toast whenever lastSync changes.
  useEffect(() => {
    async function check() {
      try {
        const s = await getStatus();
        if (s.lastSync && s.lastSync !== lastSyncRef.current) {
          lastSyncRef.current = s.lastSync;
          setLastSync(s.lastSync);
        }
      } catch { /* ignore polling errors silently */ }
    }
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setStream({ prompt: prompt.trim(), without: null, with: null, liveToolCalls: [], deltas: null });

    const url = `/api/trace/stream?prompt=${encodeURIComponent(prompt.trim())}`;
    const es = new EventSource(url);

    let withoutRun: AgentRun | null = null;
    let withRun: AgentRun | null = null;

    es.addEventListener('tool_call', (e: MessageEvent) => {
      const record = JSON.parse(e.data) as ToolCallRecord;
      setStream(s => s ? { ...s, liveToolCalls: [...s.liveToolCalls, record] } : s);
    });

    es.addEventListener('without', (e: MessageEvent) => {
      withoutRun = JSON.parse(e.data) as AgentRun;
      setStream(s => s ? { ...s, without: withoutRun } : s);
    });

    es.addEventListener('with', (e: MessageEvent) => {
      withRun = JSON.parse(e.data) as AgentRun;
      setStream(s => s ? { ...s, with: withRun } : s);
    });

    es.addEventListener('done', () => {
      es.close();
      setLoading(false);
      if (withoutRun && withRun) {
        const withoutTokens = withoutRun.inputTokens + withoutRun.outputTokens;
        const withTokens = withRun.inputTokens + withRun.outputTokens;
        setStream(s => s ? { ...s, deltas: {
          toolCallsPct: pctReduction(withoutRun!.toolCalls.length, withRun!.toolCalls.length),
          llmTurnsPct:  pctReduction(withoutRun!.llmTurns,         withRun!.llmTurns),
          latencyPct:   pctReduction(withoutRun!.totalLatencyMs,   withRun!.totalLatencyMs),
          tokensPct:    pctReduction(withoutTokens,                withTokens),
        }} : s);
      }
    });

    es.addEventListener('error', (e: MessageEvent) => {
      es.close();
      setLoading(false);
      try { setError((JSON.parse(e.data) as any).error ?? 'Trace failed'); }
      catch { setError('Trace failed'); }
      setStream(null);
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      es.close();
      setLoading(false);
      setError('Connection lost \u2014 is the server running?');
      setStream(null);
    };
  }

  const bothDone = !!(stream?.without && stream?.with);

  return (
    <div style={{ padding: '48px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{KEYFRAMES}</style>
      {lastSync && <SyncToast key={lastSync} lastSync={lastSync} />}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em', color: T.text }}>Live Trace</h1>
        <p style={{ color: T.muted, fontSize: '0.875rem', marginTop: 5 }}>
          Run both agents against your live data and see the side-by-side comparison.
        </p>
      </div>

      {/* Prompt input */}
      <form onSubmit={handleRun} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder='e.g. "What should I focus on right now?"'
            disabled={loading}
            style={{ flex: 1, padding: '10px 14px', border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: '0.925rem', background: T.inputBg, color: T.text, outline: 'none', fontFamily: 'inherit', transition: 'background 0.3s, color 0.3s, border-color 0.3s' }}
            onFocus={e => { e.target.style.borderColor = T.primary; }}
            onBlur={e => { e.target.style.borderColor = T.border; }}
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            style={{ padding: '10px 24px', fontWeight: 600, fontSize: '0.875rem', border: 'none', borderRadius: 8, background: T.primary, color: 'white', cursor: loading || !prompt.trim() ? 'default' : 'pointer', opacity: loading || !prompt.trim() ? 0.6 : 1, whiteSpace: 'nowrap', transition: 'background 0.3s' }}
          >
            {loading ? <><Spinner size={14} />Running\u2026</> : 'Run Trace'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {EXAMPLE_PROMPTS.map(p => (
            <button key={p} type="button" onClick={() => setPrompt(p)} disabled={loading}
              style={{ padding: '4px 10px', fontSize: '0.75rem', border: `1px solid ${T.border}`, borderRadius: 5, background: T.cardHead, color: T.muted, cursor: 'pointer', transition: 'background 0.3s, border-color 0.3s, color 0.3s' }}>
              {p}
            </button>
          ))}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div style={{ padding: '13px 18px', borderRadius: 8, background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error, fontSize: '0.875rem', marginBottom: 24, transition: 'background 0.3s, border-color 0.3s, color 0.3s' }}>
          \u2717 {error}
        </div>
      )}

      {/* Results */}
      {stream && (
        <>
          {bothDone && stream.deltas && (
            <>
              <DeltaStrip deltas={stream.deltas} />
              <MetricsBarGraph without={stream.without!} with={stream.with!} deltas={stream.deltas} />
            </>
          )}

          <div style={{ marginBottom: 16, fontSize: '0.875rem', color: T.muted }}>
            Prompt: <span style={{ fontWeight: 600, color: T.text }}>"{stream.prompt}"</span>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <AgentPanel
              label="WITHOUT ZeroCall  (raw tool calls)"
              accent={T.withoutAccent}
              run={stream.without}
              liveToolCalls={stream.liveToolCalls}
              waiting={loading && stream.liveToolCalls.length === 0}
            />
            <AgentPanel
              label="WITH ZeroCall  (harness injection)"
              accent={T.withAccent}
              run={stream.with}
            />
          </div>
        </>
      )}
    </div>
  );
}
