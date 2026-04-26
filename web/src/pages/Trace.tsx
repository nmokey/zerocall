import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AgentRun, TraceResult, ToolCallRecord } from '../api';
import { getStatus } from '../api';

const T = {
  bg: '#ece8dc',
  card: '#f0ece2',
  cardHead: '#e4dfd2',
  border: '#c4bab0',
  primary: '#c05a2b',
  text: '#2a2218',
  muted: '#7a7060',
  dimmer: '#8a7e70',
  success: '#2e7d4f',
  error: '#b53030',
  withoutAccent: '#b53030',
  withAccent: '#2e7d4f',
  traceBg: '#1e1b16',
  traceText: '#d4cfc4',
  traceGreen: '#6ec87a',
  traceYellow: '#e0b050',
  traceRed: '#e06050',
  traceDim: '#6a6458',
};

// ─── Animations ───────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes oc-spin      { to { transform: rotate(360deg); } }
@keyframes oc-fadein    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes oc-slidein   { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
@keyframes oc-toastin   { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes oc-toastout  { from { opacity: 1; } to { opacity: 0; } }
@keyframes oc-pulse     { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes oc-blink     { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
`;

// ─── Sync toast ───────────────────────────────────────────────────────────────

function SyncToast({ lastSync }: { lastSync: string }) {
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
      background: '#f0ece2', border: '1.5px solid #c4bab0',
      boxShadow: '0 2px 10px rgba(0,0,0,0.10)',
      fontSize: '0.8rem', color: '#2a2218',
      animation: 'oc-toastin 0.25s ease',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2e7d4f', flexShrink: 0, display: 'inline-block' }} />
      Synced · {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'oc-spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 8, flexShrink: 0 }} />
  );
}

// ─── Elapsed time hook ────────────────────────────────────────────────────────

function useElapsed(running: boolean): number {
  const startRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, [running]);

  return elapsed;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Big delta metrics strip ──────────────────────────────────────────────────

function DeltaStrip({ deltas }: { deltas: TraceResult['deltas'] }) {
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
        <div style={{ width: '100%', height: 100, background: '#e8e4d8', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
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

// ─── Tool Call Trace Panel (left side — terminal style) ───────────────────────

function ToolCallTracePanel({ calls, inProgress, run, elapsed }: {
  calls: ToolCallRecord[];
  inProgress: boolean;
  run: AgentRun | null;
  elapsed: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [calls.length, inProgress]);

  const isDone = !!run;
  const callCount = isDone ? run.toolCalls.length : calls.length;

  return (
    <div style={{
      flex: 1, minWidth: 0, borderRadius: 10, overflow: 'hidden',
      border: `1.5px solid ${isDone ? T.border : T.withoutAccent}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', background: T.traceBg,
        borderBottom: `3px solid ${T.withoutAccent}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: T.traceRed }}>
            WITHOUT ZeroCall
          </div>
          <div style={{ fontSize: '0.7rem', color: T.traceDim, marginTop: 2 }}>
            raw tool calls
          </div>
        </div>
        {/* Call counter badge */}
        {(inProgress || isDone) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              padding: '3px 10px', borderRadius: 12,
              background: isDone ? 'rgba(181,48,48,0.15)' : 'rgba(224,96,80,0.2)',
              color: T.traceRed, fontSize: '0.75rem', fontWeight: 700,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
            }}>
              {callCount} call{callCount !== 1 ? 's' : ''}
            </span>
            <span style={{
              padding: '3px 10px', borderRadius: 12,
              background: 'rgba(224,176,80,0.15)',
              color: T.traceYellow, fontSize: '0.75rem', fontWeight: 600,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
            }}>
              {isDone ? formatMs(run.totalLatencyMs) : formatMs(elapsed)}
            </span>
          </div>
        )}
        {inProgress && <Spinner size={13} />}
      </div>

      {/* Trace log */}
      <div ref={scrollRef} style={{
        background: T.traceBg, padding: '12px 16px',
        fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
        fontSize: '0.78rem', lineHeight: 1.8,
        minHeight: 200, maxHeight: 400, overflowY: 'auto',
        flex: 1,
      }}>
        {/* Initial prompt line */}
        {(calls.length > 0 || inProgress || isDone) && (
          <div style={{ color: T.traceDim, marginBottom: 8 }}>
            <span style={{ color: T.traceGreen }}>$</span> agent.run(prompt)
          </div>
        )}

        {/* Tool call entries */}
        {(isDone ? run.toolCalls : calls).map((tc, i) => {
          const cumMs = (isDone ? run.toolCalls : calls)
            .slice(0, i + 1)
            .reduce((sum, c) => sum + c.latencyMs, 0);
          return (
            <div key={i} style={{ animation: 'oc-slidein 0.25s ease', marginBottom: 4 }}>
              <div>
                <span style={{ color: T.traceDim }}>[{formatMs(cumMs)}]</span>{' '}
                <span style={{ color: T.traceYellow }}>TOOL</span>{' '}
                <span style={{ color: T.traceText, fontWeight: 600 }}>{tc.tool}</span>
                <span style={{ color: T.traceDim, marginLeft: 8 }}>({tc.latencyMs}ms)</span>
              </div>
              {Object.keys(tc.input).length > 0 && (
                <div style={{ color: T.traceDim, paddingLeft: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const s = JSON.stringify(tc.input);
                    return s.length > 80 ? s.slice(0, 80) + '...' : s;
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {/* In-flight indicator — only when we already have calls and another is pending */}
        {inProgress && !isDone && calls.length > 0 && (
          <div style={{ color: T.traceYellow, animation: 'oc-pulse 1.5s ease infinite' }}>
            <span style={{ color: T.traceDim }}>[{formatMs(elapsed)}]</span>{' '}
            <span style={{ color: T.traceYellow }}>TOOL</span>{' '}
            calling...
            <span style={{ animation: 'oc-blink 1s step-end infinite' }}>_</span>
          </div>
        )}

        {/* Waiting for first call */}
        {!isDone && calls.length === 0 && inProgress && (
          <div style={{ color: T.traceDim, animation: 'oc-pulse 1.5s ease infinite' }}>
            <span style={{ color: T.traceGreen }}>$</span> waiting for LLM to decide on tools...
            <span style={{ animation: 'oc-blink 1s step-end infinite' }}>_</span>
          </div>
        )}

        {/* Done summary line */}
        {isDone && (
          <div style={{ marginTop: 8, color: T.traceRed, fontWeight: 600 }}>
            <span style={{ color: T.traceDim }}>[{formatMs(run.totalLatencyMs)}]</span>{' '}
            DONE — {run.toolCalls.length} tool calls, {run.llmTurns} LLM turns, {run.inputTokens + run.outputTokens} tokens
          </div>
        )}
      </div>

      {/* Completed response */}
      {isDone && (
        <div style={{ background: T.card, borderTop: `1px solid ${T.border}` }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginBottom: 10 }}>Response</div>
            <div style={{ fontSize: '0.85rem', color: T.text, lineHeight: 1.65 }}>
              <ReactMarkdown>{run.finalResponse}</ReactMarkdown>
            </div>
          </div>
          <div style={{ padding: '12px 20px', background: T.cardHead, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <MetricBadge label="Latency" value={`${run.totalLatencyMs}ms`} color={T.withoutAccent} />
            <MetricBadge label="Tokens" value={run.inputTokens + run.outputTokens} />
            <MetricBadge label="Tool calls" value={run.toolCalls.length} color={T.withoutAccent} />
            <MetricBadge label="LLM turns" value={run.llmTurns} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ZeroCall Panel (right side) ──────────────────────────────────────────────

function MetricBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <span style={{ fontSize: '0.75rem', color: T.muted }}>
      {label}: <span style={{ fontWeight: 600, color: color ?? T.text }}>{value}</span>
    </span>
  );
}

function ZeroCallPanel({ run, elapsed, otherStillRunning }: {
  run: AgentRun | null;
  elapsed: number;
  otherStillRunning: boolean;
}) {
  const isDone = !!run;

  // Waiting state
  if (!isDone) {
    return (
      <div style={{
        flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10,
        overflow: 'hidden', background: T.card,
      }}>
        <div style={{
          padding: '14px 20px', background: T.cardHead,
          borderBottom: `3px solid ${T.withAccent}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: T.withAccent }}>
              WITH ZeroCall
            </div>
            <div style={{ fontSize: '0.7rem', color: T.muted, marginTop: 2 }}>
              harness injection
            </div>
          </div>
          <span style={{
            padding: '3px 10px', borderRadius: 12,
            background: 'rgba(224,176,80,0.15)',
            color: '#c87830', fontSize: '0.75rem', fontWeight: 600,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>
            {formatMs(elapsed)}
          </span>
          <Spinner size={13} />
        </div>
        <div style={{ padding: '48px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: '0.85rem' }}>
          <Spinner />Running…
        </div>
      </div>
    );
  }

  // Done state
  const totalTokens = run.inputTokens + run.outputTokens;
  return (
    <div style={{
      flex: 1, minWidth: 0, borderRadius: 10, overflow: 'hidden',
      border: `1.5px solid ${otherStillRunning ? T.withAccent : T.border}`,
      background: T.card, animation: 'oc-fadein 0.35s ease',
      boxShadow: otherStillRunning ? `0 0 12px rgba(46,125,79,0.15)` : 'none',
    }}>
      <div style={{
        padding: '14px 20px', background: T.cardHead,
        borderBottom: `3px solid ${T.withAccent}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: T.withAccent }}>
            WITH ZeroCall
          </div>
          <div style={{ fontSize: '0.7rem', color: T.muted, marginTop: 2 }}>
            harness injection
          </div>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: 12,
          background: 'rgba(46,125,79,0.15)',
          color: T.withAccent, fontSize: '0.75rem', fontWeight: 700,
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}>
          {run.toolCalls.length} call{run.toolCalls.length !== 1 ? 's' : ''}
        </span>
        <span style={{
          padding: '3px 10px', borderRadius: 12,
          background: 'rgba(46,125,79,0.15)',
          color: T.withAccent, fontSize: '0.75rem', fontWeight: 600,
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}>
          {formatMs(run.totalLatencyMs)}
        </span>
      </div>

      {/* Snapshot injected banner */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${T.border}`,
        background: otherStillRunning ? 'rgba(46,125,79,0.06)' : 'transparent',
      }}>
        <div style={{ fontSize: '0.82rem', color: T.withAccent }}>
          <span style={{ fontWeight: 600 }}>
            {otherStillRunning ? 'Already done' : 'Done'} — context auto-injected
          </span>
          <div style={{ color: T.muted, marginTop: 4, fontSize: '0.78rem' }}>
            {run.toolCalls.length} tool calls — harness injected the snapshot before first token
          </div>
        </div>
      </div>

      {/* Response */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginBottom: 10 }}>Response</div>
        <div style={{ fontSize: '0.85rem', color: T.text, lineHeight: 1.65 }}>
          <ReactMarkdown>{run.finalResponse}</ReactMarkdown>
        </div>
      </div>

      {/* Metrics footer */}
      <div style={{ padding: '12px 20px', background: T.cardHead, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <MetricBadge label="Latency" value={`${run.totalLatencyMs}ms`} color={T.withAccent} />
        <MetricBadge label="Tokens" value={totalTokens} />
        <MetricBadge label="Tool calls" value={run.toolCalls.length} color={T.withAccent} />
        <MetricBadge label="LLM turns" value={run.llmTurns} />
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

  const elapsed = useElapsed(loading);

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
      setError('Connection lost — is the server running?');
      setStream(null);
    };
  }

  const bothDone = !!(stream?.without && stream?.with);
  const withDoneWithoutPending = !!(stream?.with && !stream?.without);

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
            style={{ flex: 1, padding: '10px 14px', border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: '0.925rem', background: 'white', color: T.text, outline: 'none', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = T.primary; }}
            onBlur={e => { e.target.style.borderColor = T.border; }}
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            style={{ padding: '10px 24px', fontWeight: 600, fontSize: '0.875rem', border: 'none', borderRadius: 8, background: T.primary, color: 'white', cursor: loading || !prompt.trim() ? 'default' : 'pointer', opacity: loading || !prompt.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            {loading ? <><Spinner size={14} />Running…</> : 'Run Trace'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {EXAMPLE_PROMPTS.map(p => (
            <button key={p} type="button" onClick={() => setPrompt(p)} disabled={loading}
              style={{ padding: '4px 10px', fontSize: '0.75rem', border: `1px solid ${T.border}`, borderRadius: 5, background: T.cardHead, color: T.muted, cursor: 'pointer' }}>
              {p}
            </button>
          ))}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div style={{ padding: '13px 18px', borderRadius: 8, background: '#fdf0f0', border: '1px solid #efb8b8', color: T.error, fontSize: '0.875rem', marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {stream && (
        <>
          {/* Big numbers + bar graph — only when both done */}
          {bothDone && stream.deltas && (
            <>
              <DeltaStrip deltas={stream.deltas} />
              <MetricsBarGraph without={stream.without!} with={stream.with!} deltas={stream.deltas} />
            </>
          )}

          <div style={{ marginBottom: 16, fontSize: '0.875rem', color: T.muted }}>
            Prompt: <span style={{ fontWeight: 600, color: T.text }}>"{stream.prompt}"</span>
          </div>

          {/* Side-by-side: Trace on left, ZeroCall on right */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
            <ToolCallTracePanel
              calls={stream.liveToolCalls}
              inProgress={loading && !stream.without}
              run={stream.without}
              elapsed={elapsed}
            />
            <ZeroCallPanel
              run={stream.with}
              elapsed={elapsed}
              otherStillRunning={withDoneWithoutPending}
            />
          </div>
        </>
      )}
    </div>
  );
}
