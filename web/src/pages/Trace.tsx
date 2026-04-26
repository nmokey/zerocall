import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentRun, AdaptiveStats, TraceResult, ToolCallRecord, WorkStateSnapshot } from '../api';
import { getStatus, getSnapshot, getAdaptiveStats, applyAdaptiveSection } from '../api';
import type { Theme } from '../theme';

// ─── Animations ───────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes oc-spin      { to { transform: rotate(360deg); } }
@keyframes oc-fadein    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes oc-slidein   { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
@keyframes oc-toastin   { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes oc-toastout  { from { opacity: 1; } to { opacity: 0; } }
`;

// ─── Sync toast ───────────────────────────────────────────────────────────────

function SyncToast({ lastSync, T }: { lastSync: string; T: Theme }) {
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
      background: T.toastBg, border: `1.5px solid ${T.border}`,
      boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
      fontSize: '0.8rem', color: T.text,
      animation: 'oc-toastin 0.25s ease',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.success, flexShrink: 0, display: 'inline-block' }} />
      Synced · {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
  );
}

function Spinner({ size = 16, T }: { size?: number; T: Theme }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${T.border}`, borderTopColor: T.primary, borderRadius: '50%', animation: 'oc-spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 8, flexShrink: 0 }} />
  );
}

// ─── Big delta metrics strip ──────────────────────────────────────────────────

function DeltaStrip({ without, with: with_, deltas, T }: { without: AgentRun; with: AgentRun; deltas: TraceResult['deltas']; T: Theme }) {
  const llmTurnsSaved = without.llmTurns - with_.llmTurns;

  const items = [
    { label: 'tool calls',      display: `${with_.toolCalls.length}`,      sublabel: 'with ZeroCall' },
    { label: 'LLM turns saved', display: `${llmTurnsSaved}`,               sublabel: `${without.llmTurns} → ${with_.llmTurns}` },
    { label: 'faster',          display: `${deltas.latencyPct}%`,          sublabel: 'latency reduction' },
    { label: 'fewer tokens',    display: `${deltas.tokensPct}%`,           sublabel: 'token reduction' },
  ];

  const overlineGradient = `linear-gradient(90deg, ${T.withAccent}, ${T.primary})`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 12, marginBottom: 20, animation: 'oc-fadein 0.4s ease' }}>
      {items.map(({ label, display, sublabel }) => (
        <div key={label} style={{ textAlign: 'center', padding: '20px 12px', background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: overlineGradient }} />
          <div style={{ fontSize: '3rem', fontWeight: 800, color: T.withAccent, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {display}
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginTop: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: '0.7rem', color: T.muted, marginTop: 4 }}>
            {sublabel}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bar graph ────────────────────────────────────────────────────────────────

function MetricsBarGraph({ without, with: with_, deltas, T }: { without: AgentRun; with: AgentRun; deltas: TraceResult['deltas']; T: Theme }) {
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
    // Gradient fades from solid accent at top to 50% opacity at bottom
    const barGradient = `linear-gradient(to bottom, ${accent}, ${accent}80)`;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 6 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: accent }}>{value}</span>
        <div style={{ width: '100%', height: 100, background: T.barBg, borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${height}%`, background: barGradient, transition: 'height 0.4s ease' }} />
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agent panel ──────────────────────────────────────────────────────────────

function MetricBadge({ label, value, color, T }: { label: string; value: string | number; color?: string; T: Theme }) {
  return (
    <span style={{ fontSize: '0.75rem', color: T.muted }}>
      {label}: <span style={{ fontWeight: 600, color: color ?? T.text }}>{value}</span>
    </span>
  );
}

function ToolCallList({ calls, inProgress, T }: { calls: ToolCallRecord[]; inProgress: boolean; T: Theme }) {
  if (calls.length === 0 && !inProgress) {
    return <div style={{ fontSize: '0.82rem', color: T.muted, fontStyle: 'italic' }}>No tool calls</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {calls.map((tc, i) => {
        const argStr = Object.keys(tc.input).length > 0 ? JSON.stringify(tc.input) : '';
        const truncated = argStr.length > 70 ? argStr.slice(0, 70) + '…' : argStr;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '0.78rem', animation: 'oc-slidein 0.25s ease' }}>
            <span style={{ color: T.withoutAccent, fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
            <span style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontWeight: 600, color: T.text }}>{tc.tool}</span>
            {truncated && <span style={{ color: T.dimmer, fontFamily: "'SF Mono', 'Fira Code', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{truncated}</span>}
            <span style={{ color: T.latencyColor, fontWeight: 500, flexShrink: 0 }}>{tc.latencyMs}ms</span>
          </div>
        );
      })}
      {inProgress && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: T.muted, animation: 'oc-slidein 0.25s ease' }}>
          <span style={{ color: T.withoutAccent, fontWeight: 600, flexShrink: 0 }}>{calls.length + 1}.</span>
          <Spinner size={12} T={T} />
          <span>calling tool…</span>
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
  T: Theme;
}

function AgentPanel({ label, accent, run, liveToolCalls = [], waiting = false, T }: AgentPanelProps) {
  const isLive = !run;

  if (isLive && liveToolCalls.length === 0 && !waiting) {
    return (
      <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card }}>
        <div style={{ padding: '14px 20px', background: T.cardHead, borderBottom: `3px solid ${accent}` }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent }}>{label}</div>
        </div>
        <div style={{ padding: '48px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: '0.85rem' }}>
          <Spinner T={T} />Running…
        </div>
      </div>
    );
  }

  if (isLive) {
    return (
      <div style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', background: T.card }}>
        <div style={{ padding: '14px 20px', background: T.cardHead, borderBottom: `3px solid ${accent}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: accent, flex: 1 }}>{label}</div>
          <Spinner size={13} T={T} />
        </div>
        <div style={{ padding: '16px 20px' }}>
          <ToolCallList calls={liveToolCalls} inProgress={true} T={T} />
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
            <span style={{ fontWeight: 600 }}>✦ Work context auto-injected</span>
            <div style={{ color: T.muted, marginTop: 4, fontSize: '0.78rem' }}>0 tool calls — harness injected the snapshot before first token</div>
          </div>
        ) : (
          <ToolCallList calls={run!.toolCalls} inProgress={false} T={T} />
        )}
      </div>

      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer, marginBottom: 10 }}>Response</div>
        <div style={{ fontSize: '0.85rem', color: T.text, lineHeight: 1.65 }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.82rem' }}>{children}</table>
              ),
              th: ({ children }) => (
                <th style={{ border: `1px solid ${T.border}`, padding: '6px 10px', background: T.cardHead, fontWeight: 600, textAlign: 'left', color: T.text }}>{children}</th>
              ),
              td: ({ children }) => (
                <td style={{ border: `1px solid ${T.border}`, padding: '6px 10px', color: T.text }}>{children}</td>
              ),
            }}
          >{run!.finalResponse}</ReactMarkdown>
        </div>
      </div>

      <div style={{ padding: '12px 20px', background: T.cardHead, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <MetricBadge label="Latency" value={`${run!.totalLatencyMs}ms`} color={accent} T={T} />
        <MetricBadge label="Tokens" value={totalTokens} T={T} />
        <MetricBadge label="Tool calls" value={run!.toolCalls.length} color={accent} T={T} />
        <MetricBadge label="LLM turns" value={run!.llmTurns} T={T} />
      </div>
    </div>
  );
}

// ─── Query classification bar ─────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  calendar: '#f59e0b',
  email:    '#8b5cf6',
  tasks:    '#10b981',
  general:  '#94a3b8',
};

const CATEGORY_LABELS: Record<string, string> = {
  calendar: 'Calendar',
  email:    'Email',
  tasks:    'Tasks',
  general:  'General',
};

const SECTION_KEYS = ['calendar', 'email', 'tasks'] as const;

function QueryClassificationBar({
  stats,
  onToggle,
  T,
}: {
  stats: AdaptiveStats;
  onToggle: (section: string, enabled: boolean) => void;
  T: Theme;
}) {
  const { categoryDistribution, queryCount, currentConfig, sectionRelevance, suggestions } = stats;

  const rows = (['calendar', 'email', 'tasks', 'general'] as const)
    .map(cat => ({ cat, count: categoryDistribution[cat] ?? 0 }))
    .filter(r => r.count > 0);

  const suggestionSections = new Set(suggestions.map(s => s.section));

  return (
    <div style={{
      padding: '20px 24px',
      background: T.card,
      border: `1.5px solid ${T.border}`,
      borderRadius: 10,
      marginTop: 28,
      animation: 'oc-fadein 0.4s ease',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.dimmer }}>
            Adaptive context
          </span>
          <span style={{ fontSize: '0.72rem', color: T.muted }}>
            {queryCount} {queryCount === 1 ? 'query' : 'queries'} classified
          </span>
        </div>

        {/* Section enable/disable toggles */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SECTION_KEYS.map(sec => {
            const enabled = currentConfig[sec] !== false;
            const hasSuggestion = suggestionSections.has(sec);
            const relevancePct = Math.round((sectionRelevance[sec] ?? 0) * 100);
            const tokenSavings = suggestions.find(s => s.section === sec)?.projectedTokenSavings ?? 0;
            return (
              <button
                key={sec}
                onClick={() => onToggle(sec, !enabled)}
                title={
                  hasSuggestion
                    ? `Only ${relevancePct}% of queries need this — click to disable and save ~${tokenSavings} tokens/req`
                    : enabled
                      ? `${CATEGORY_LABELS[sec]} context injecting — click to disable`
                      : `${CATEGORY_LABELS[sec]} context disabled — click to enable`
                }
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20,
                  border: `1.5px solid ${hasSuggestion ? T.withoutAccent : enabled ? CATEGORY_COLORS[sec] : T.border}`,
                  background: enabled ? `${CATEGORY_COLORS[sec]}18` : T.cardHead,
                  color: hasSuggestion ? T.withoutAccent : enabled ? CATEGORY_COLORS[sec] : T.dimmer,
                  fontSize: '0.72rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: enabled ? CATEGORY_COLORS[sec] : T.border,
                  flexShrink: 0, display: 'inline-block',
                }} />
                {CATEGORY_LABELS[sec]}
                {!enabled && <span style={{ fontSize: '0.65rem', opacity: 0.7 }}> off</span>}
                {hasSuggestion && (
                  <span style={{ fontSize: '0.65rem', marginLeft: 2 }}>↓{tokenSavings}t</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Horizontal bar chart */}
      {rows.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: T.muted, fontStyle: 'italic' }}>
          No queries classified yet — run a trace to see your query breakdown.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(({ cat, count }) => {
            const pct = queryCount > 0 ? Math.round((count / queryCount) * 100) : 0;
            const color = CATEGORY_COLORS[cat];
            const isDisabled = cat !== 'general' && currentConfig[cat as 'calendar' | 'email' | 'tasks'] === false;
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600,
                  color: isDisabled ? T.dimmer : T.muted,
                  width: 60, flexShrink: 0,
                  textDecoration: isDisabled ? 'line-through' : 'none',
                }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <div style={{ flex: 1, height: 12, background: T.barBg, borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: isDisabled ? T.dimmer : color,
                    borderRadius: 6,
                    transition: 'width 0.5s ease',
                    opacity: isDisabled ? 0.4 : 1,
                  }} />
                </div>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700,
                  color: isDisabled ? T.dimmer : color,
                  width: 36, flexShrink: 0, textAlign: 'right',
                  opacity: isDisabled ? 0.5 : 1,
                }}>
                  {pct}%
                </span>
                <span style={{ fontSize: '0.72rem', color: T.dimmer, width: 20, flexShrink: 0, textAlign: 'right' }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Suggestion callout */}
      {suggestions.length > 0 && (
        <div style={{
          marginTop: 16, padding: '10px 14px',
          background: T.errorBg, border: `1px solid ${T.errorBorder}`,
          borderRadius: 8, fontSize: '0.8rem', color: T.error,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{ fontWeight: 600 }}>Adaptive suggestion</span>
          {suggestions.map(s => (
            <div key={s.section} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>
                <b>{CATEGORY_LABELS[s.section]}</b> context is only relevant for {Math.round(s.relevanceScore * 100)}% of your queries — disable to save ~{s.projectedTokenSavings} tokens/request
              </span>
              <button
                onClick={() => onToggle(s.section, false)}
                style={{
                  padding: '3px 12px', fontSize: '0.72rem', fontWeight: 600,
                  border: `1px solid ${T.error}`, borderRadius: 5,
                  background: 'transparent', color: T.error, cursor: 'pointer', flexShrink: 0,
                }}
              >
                Disable
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Snapshot-driven prompt suggestions ──────────────────────────────────────

const FALLBACK_PROMPTS = [
  'What should I focus on right now?',
  'Do I have any urgent emails that need a reply?',
  'What tasks are overdue or at risk?',
  'Give me a full standup summary — calendar, email, and tasks.',
];

/**
 * Generates up to 4 context-grounded suggested prompts from a live snapshot.
 * Prompts are intentionally vague and cross-signal so ZeroCall has maximum
 * advantage over the raw-tool agent (which must call multiple tools to answer).
 */
function generateSuggestedPrompts(snapshot: WorkStateSnapshot): string[] {
  const suggestions: string[] = [];

  // Always include a broad "what should I focus on" opener
  suggestions.push('What should I focus on right now?');

  // Email signal: mention a real counterparty if one exists
  const actionEmail = snapshot.email.action_required[0];
  const awaitingEmail = snapshot.email.awaiting_reply[0];
  if (actionEmail) {
    suggestions.push(`I have an email from ${actionEmail.counterparty} — should I prioritize it, and is my schedule clear to respond today?`);
  } else if (snapshot.email.unread_count > 0) {
    suggestions.push(`I have ${snapshot.email.unread_count} unread emails — are any urgent, and do I have time to address them today?`);
  }
  if (awaitingEmail) {
    suggestions.push(`I'm waiting on a reply from ${awaitingEmail.counterparty} — is there anything else blocking me in the meantime?`);
  }

  // Task signal: mention a real overdue or in-progress task if one exists
  const overdueTask = snapshot.tasks.overdue[0];
  const inProgressTask = snapshot.tasks.in_progress[0];
  if (overdueTask) {
    suggestions.push(`"${overdueTask.title}" is overdue — what else is blocked or at risk this week?`);
  } else if (inProgressTask) {
    suggestions.push(`I'm working on "${inProgressTask.title}" — what other tasks need attention today?`);
  } else if (snapshot.tasks.due_today.length > 0) {
    suggestions.push(`I have ${snapshot.tasks.due_today.length} task${snapshot.tasks.due_today.length > 1 ? 's' : ''} due today — how should I prioritize my time?`);
  }

  // Calendar signal: mention a real meeting or free block
  const nextMeeting = snapshot.calendar.today[0];
  const freeBlock = snapshot.calendar.free_blocks[0];
  if (nextMeeting && freeBlock) {
    suggestions.push(`I have a meeting for "${nextMeeting.title}" coming up — what should I prepare, and is there a free block to do it?`);
  } else if (freeBlock) {
    suggestions.push(`What's the most valuable thing I could do with my free time today given everything on my plate?`);
  }

  // Cap at 4, fill with a cross-signal fallback if short
  if (suggestions.length < 4) {
    suggestions.push('Give me a full standup summary — calendar, email, and tasks.');
  }

  return suggestions.slice(0, 4);
}

// ─── Main Trace page ──────────────────────────────────────────────────────────

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

export default function Trace({ T }: { T: Theme }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [adaptiveStats, setAdaptiveStats] = useState<AdaptiveStats | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(FALLBACK_PROMPTS);
  const lastSyncRef = useRef<string | null>(null);

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

  // Fetch adaptive stats on mount and after each trace completes.
  const refreshAdaptiveStats = useCallback(async () => {
    try {
      setAdaptiveStats(await getAdaptiveStats());
    } catch { /* ignore — server may not have any queries yet */ }
  }, []);

  useEffect(() => { refreshAdaptiveStats(); }, [refreshAdaptiveStats]);

  // Fetch snapshot on mount to generate context-grounded prompt suggestions.
  useEffect(() => {
    getSnapshot().then(s => {
      if (s) setSuggestedPrompts(generateSuggestedPrompts(s));
    }).catch(() => { /* ignore — fall back to static prompts */ });
  }, []);

  async function handleToggle(section: string, enabled: boolean) {
    try {
      await applyAdaptiveSection(section, enabled);
      await refreshAdaptiveStats();
    } catch { /* ignore */ }
  }

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
      // Refresh adaptive stats now that a new query has been logged.
      refreshAdaptiveStats();
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

  return (
    <div style={{ padding: '48px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{KEYFRAMES}</style>
      {lastSync && <SyncToast key={lastSync} lastSync={lastSync} T={T} />}

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
            style={{ flex: 1, padding: '10px 14px', border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: '0.925rem', background: T.inputBg, color: T.text, outline: 'none', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = T.primary; }}
            onBlur={e => { e.target.style.borderColor = T.border; }}
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            style={{ padding: '10px 24px', fontWeight: 600, fontSize: '0.875rem', border: 'none', borderRadius: 8, background: T.primary, color: 'white', cursor: loading || !prompt.trim() ? 'default' : 'pointer', opacity: loading || !prompt.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            {loading ? <><Spinner size={14} T={T} />Running…</> : 'Run Trace'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {suggestedPrompts.map((p: string) => (
            <button key={p} type="button" onClick={() => setPrompt(p)} disabled={loading}
              style={{ padding: '4px 10px', fontSize: '0.75rem', border: `1px solid ${T.border}`, borderRadius: 5, background: T.cardHead, color: T.muted, cursor: 'pointer' }}>
              {p}
            </button>
          ))}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div style={{ padding: '13px 18px', borderRadius: 8, background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error, fontSize: '0.875rem', marginBottom: 24 }}>
          ✗ {error}
        </div>
      )}

      {/* Results */}
      {stream && (
        <>
          {bothDone && stream.deltas && (
            <>
              <DeltaStrip without={stream.without!} with={stream.with!} deltas={stream.deltas} T={T} />
              <MetricsBarGraph without={stream.without!} with={stream.with!} deltas={stream.deltas} T={T} />
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
              T={T}
            />
            <AgentPanel
              label="WITH ZeroCall  (harness injection)"
              accent={T.withAccent}
              run={stream.with}
              T={T}
            />
          </div>
        </>
      )}

      {/* Adaptive context classification bar — shown whenever we have stats */}
      {adaptiveStats && (
        <QueryClassificationBar
          stats={adaptiveStats}
          onToggle={handleToggle}
          T={T}
        />
      )}
    </div>
  );
}
