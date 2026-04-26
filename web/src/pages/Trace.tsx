import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AgentRun, TraceResult } from '../api';

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
};

// ─── Loading spinner ──────────────────────────────────────────────────────────

const spinnerKeyframes = `
@keyframes oc-spin { to { transform: rotate(360deg); } }
@keyframes oc-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
`;

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <>
      <style>{spinnerKeyframes}</style>
      <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'oc-spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 8, flexShrink: 0 }} />
    </>
  );
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
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 12, marginBottom: 32, animation: 'oc-fadein 0.4s ease' }}>
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

// ─── Agent run panel ──────────────────────────────────────────────────────────

function MetricBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <span style={{ fontSize: '0.75rem', color: T.muted }}>
      {label}: <span style={{ fontWeight: 600, color: color ?? T.text }}>{value}</span>
    </span>
  );
}

function AgentPanel({ label, run, accent }: { label: string; run: AgentRun | null; accent: string }) {
  // Pending state — agent still running
  if (!run) {
    return (
      <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card }}>
        <div style={{ padding: '14px 20px', background: T.cardHead, borderBottom: `3px solid ${accent}` }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent }}>{label}</div>
        </div>
        <div style={{ padding: '48px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: '0.85rem' }}>
          <Spinner />Running…
        </div>
      </div>
    );
  }

  const totalTokens = run.inputTokens + run.outputTokens;

  return (
    <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card, animation: 'oc-fadein 0.35s ease' }}>
      {/* Panel header */}
      <div style={{ padding: '14px 20px', background: T.cardHead, borderBottom: `3px solid ${accent}` }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent, letterSpacing: '0.01em' }}>{label}</div>
      </div>

      {/* Tool calls or injection notice */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        {run.snapshotInjected ? (
          <div style={{ fontSize: '0.82rem', color: T.withAccent }}>
            <span style={{ fontWeight: 600 }}>✦ Work context auto-injected</span>
            <div style={{ color: T.muted, marginTop: 4, fontSize: '0.78rem' }}>0 tool calls — harness injected the snapshot before first token</div>
          </div>
        ) : run.toolCalls.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: T.muted, fontStyle: 'italic' }}>No tool calls</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {run.toolCalls.map((tc, i) => {
              const argStr = Object.keys(tc.input).length > 0 ? JSON.stringify(tc.input) : '';
              const truncated = argStr.length > 70 ? argStr.slice(0, 70) + '…' : argStr;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: accent, fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontWeight: 600, color: T.text }}>{tc.tool}</span>
                  {truncated && <span style={{ color: T.dimmer, fontFamily: "'SF Mono', 'Fira Code', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{truncated}</span>}
                  <span style={{ color: '#c87830', fontWeight: 500, flexShrink: 0 }}>{tc.latencyMs}ms</span>
                </div>
              );
            })}
          </div>
        )}
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
        <MetricBadge label="Latency" value={`${run.totalLatencyMs}ms`} color={accent} />
        <MetricBadge label="Tokens" value={totalTokens} />
        <MetricBadge label="Tool calls" value={run.toolCalls.length} color={accent} />
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
  without: AgentRun | null;
  with: AgentRun | null;
  deltas: TraceResult['deltas'] | null;
  prompt: string;
};

/** Computes percentage reduction from `from` to `to`, clamped to 0 when from=0. */
function pctReduction(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round((from - to) / from * 100);
}

export default function Trace() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setStream({ without: null, with: null, deltas: null, prompt: prompt.trim() });

    try {
      const url = `/api/trace/stream?prompt=${encodeURIComponent(prompt.trim())}`;
      const es = new EventSource(url);

      let withoutRun: AgentRun | null = null;
      let withRun: AgentRun | null = null;

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
        // Compute deltas once both runs are known
        if (withoutRun && withRun) {
          const withoutTokens = withoutRun.inputTokens + withoutRun.outputTokens;
          const withTokens = withRun.inputTokens + withRun.outputTokens;
          const deltas: TraceResult['deltas'] = {
            toolCallsPct: pctReduction(withoutRun.toolCalls.length, withRun.toolCalls.length),
            llmTurnsPct: pctReduction(withoutRun.llmTurns, withRun.llmTurns),
            latencyPct: pctReduction(withoutRun.totalLatencyMs, withRun.totalLatencyMs),
            tokensPct: pctReduction(withoutTokens, withTokens),
          };
          setStream(s => s ? { ...s, deltas } : s);
        }
      });

      es.addEventListener('error', (e: MessageEvent) => {
        es.close();
        setLoading(false);
        try {
          const data = JSON.parse(e.data);
          setError(data.error ?? 'Trace failed');
        } catch {
          setError('Trace failed');
        }
        setStream(null);
      });

      // Handle connection-level errors (network, server down)
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return;
        es.close();
        setLoading(false);
        setError('Connection lost — is the server running?');
        setStream(null);
      };
    } catch (err: any) {
      setLoading(false);
      setError(err.message ?? 'Trace failed');
      setStream(null);
    }
  }

  const bothDone = stream?.without && stream?.with;

  return (
    <div style={{ padding: '48px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{spinnerKeyframes}</style>

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

        {/* Example prompts */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {EXAMPLE_PROMPTS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPrompt(p)}
              disabled={loading}
              style={{ padding: '4px 10px', fontSize: '0.75rem', border: `1px solid ${T.border}`, borderRadius: 5, background: T.cardHead, color: T.muted, cursor: 'pointer' }}
            >
              {p}
            </button>
          ))}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div style={{ padding: '13px 18px', borderRadius: 8, background: '#fdf0f0', border: '1px solid #efb8b8', color: T.error, fontSize: '0.875rem', marginBottom: 24 }}>
          ✗ {error}
        </div>
      )}

      {/* Results */}
      {stream && (
        <>
          {/* Delta metrics — shown only when both agents are done */}
          {bothDone && stream.deltas && <DeltaStrip deltas={stream.deltas} />}

          <div style={{ marginBottom: 16, fontSize: '0.875rem', color: T.muted }}>
            Prompt: <span style={{ fontWeight: 600, color: T.text }}>"{stream.prompt}"</span>
          </div>

          {/* Side-by-side panels — each appears as its agent completes */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <AgentPanel
              label="WITHOUT OneCall  (raw tool calls)"
              run={stream.without}
              accent={T.withoutAccent}
            />
            <AgentPanel
              label="WITH OneCall  (harness injection)"
              run={stream.with}
              accent={T.withAccent}
            />
          </div>
        </>
      )}
    </div>
  );
}
