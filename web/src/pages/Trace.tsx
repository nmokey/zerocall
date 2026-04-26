import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { runTrace, type AgentRun, type TraceResult } from '../api';

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
`;

function Spinner() {
  return (
    <>
      <style>{spinnerKeyframes}</style>
      <span style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'oc-spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 8 }} />
    </>
  );
}

// ─── Metrics bar graph ─────────────────────────────────────────────────────────

function MetricsBarGraph({ result }: { result: TraceResult }) {
  const { without, with: with_, deltas } = result;
  const withoutTokens = without.inputTokens + without.outputTokens;
  const withTokens = with_.inputTokens + with_.outputTokens;

  const metrics = [
    { label: 'Tool calls', without: without.toolCalls.length, with: with_.toolCalls.length, pct: deltas.toolCallsPct, unit: '' },
    { label: 'LLM turns', without: without.llmTurns, with: with_.llmTurns, pct: deltas.llmTurnsPct, unit: '' },
    { label: 'Latency', without: without.totalLatencyMs, with: with_.totalLatencyMs, pct: deltas.latencyPct, unit: 'ms' },
    { label: 'Tokens', without: withoutTokens, with: withTokens, pct: deltas.tokensPct, unit: '' },
  ];

  function Bar({ value, max, accent, label }: { value: number; max: number; accent: string; label: string }) {
    const height = max > 0 ? (value / max) * 100 : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 6 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: accent }}>{value}</span>
        <div style={{ width: '100%', height: 120, background: '#e8e4d8', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${height}%`, background: accent, transition: 'height 0.3s ease' }} />
        </div>
        <span style={{ fontSize: '0.7rem', color: T.muted, textAlign: 'center' }}>{label}</span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 64, padding: '20px 24px', background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 10, maxWidth: 550, margin: '0 auto' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginBottom: 16 }}>Metrics comparison</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length}, 1fr)`, gap: 16 }}>
        {metrics.map(metric => {
          const maxForMetric = Math.max(metric.without, metric.with);
          return (
            <div key={metric.label} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: T.text, textAlign: 'center', marginBottom: 4 }}>{metric.label}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Bar value={metric.without} max={maxForMetric} accent={T.withoutAccent} label="Without" />
                <Bar value={metric.with} max={maxForMetric} accent={T.withAccent} label="With" />
              </div>
              <div style={{ fontSize: '0.75rem', color: T.success, fontWeight: 600, textAlign: 'center' }}>
                {metric.pct}% fewer
              </div>
            </div>
          );
        })}
      </div>
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

function AgentPanel({ label, run, accent }: { label: string; run: AgentRun; accent: string }) {
  const totalTokens = run.inputTokens + run.outputTokens;

  return (
    <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card }}>
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

export default function Trace() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await runTrace(prompt.trim());
      setResult(res);
    } catch (err: any) {
      setError(err.message ?? 'Trace failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '48px 24px', maxWidth: 1100, margin: '0 auto' }}>
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
            {loading ? <><Spinner />Running…</> : 'Run Trace'}
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

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', border: `1.5px dashed ${T.border}`, borderRadius: 10, color: T.muted, fontSize: '0.875rem' }}>
          <Spinner />
          Running both agents in parallel — this takes 5–15 seconds…
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '13px 18px', borderRadius: 8, background: '#fdf0f0', border: '1px solid #efb8b8', color: T.error, fontSize: '0.875rem' }}>
          ✗ {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Metrics bar graph */}
          <MetricsBarGraph result={result} />

          <div style={{ marginBottom: 16, fontSize: '0.875rem', color: T.muted }}>
            Prompt: <span style={{ fontWeight: 600, color: T.text }}>"{result.prompt}"</span>
          </div>

          {/* Side-by-side panels */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <AgentPanel
              label="WITHOUT OneCall  (raw tool calls)"
              run={result.without}
              accent={T.withoutAccent}
            />
            <AgentPanel
              label="WITH OneCall  (harness injection)"
              run={result.with}
              accent={T.withAccent}
            />
          </div>
        </>
      )}
    </div>
  );
}
