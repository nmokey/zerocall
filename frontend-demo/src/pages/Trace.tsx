import React, { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentRun, AdaptiveStats, FetchProfile, TraceResult, ToolCallRecord, WorkStateSnapshot } from '../api';
import { getSnapshot, getAdaptiveStats, applyAdaptiveSection } from '../api';
import styles from './Trace.module.css';

const CATEGORY_LABELS: Record<string, string> = {
  calendar: 'Calendar',
  email:    'Email',
  tasks:    'Tasks',
  general:  'General',
};

const SECTION_KEYS = ['calendar', 'email', 'tasks'] as const;

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size, marginRight: 8 }}
    />
  );
}

function DeltaStrip({ without, with: with_, deltas }: { without: AgentRun; with: AgentRun; deltas: TraceResult['deltas'] }) {
  const llmTurnsSaved = without.llmTurns - with_.llmTurns;

  const items = [
    { label: 'tool calls',      display: `${with_.toolCalls.length}`,      sublabel: 'with ZeroCall' },
    { label: 'LLM turns saved', display: `${llmTurnsSaved}`,               sublabel: `${without.llmTurns} \u2192 ${with_.llmTurns}` },
    { label: 'faster',          display: `${deltas.latencyPct}%`,          sublabel: 'latency reduction' },
    { label: 'fewer tokens',    display: `${deltas.tokensPct}%`,           sublabel: 'token reduction' },
  ];

  return (
    <div className={styles.deltaStrip} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(({ label, display, sublabel }) => (
        <div key={label} className={styles.deltaCard}>
          <div className={styles.deltaCardOverline} />
          <div className={styles.deltaValue}>{display}</div>
          <div className={styles.deltaLabel}>{label}</div>
          <div className={styles.deltaSublabel}>{sublabel}</div>
        </div>
      ))}
    </div>
  );
}

function MetricsBarGraph({ without, with: with_, deltas }: { without: AgentRun; with: AgentRun; deltas: TraceResult['deltas'] }) {
  const withoutTokens = without.inputTokens + without.outputTokens;
  const withTokens = with_.inputTokens + with_.outputTokens;

  const metrics = [
    { label: 'Tool calls', without: without.toolCalls.length, with: with_.toolCalls.length, pct: deltas.toolCallsPct },
    { label: 'LLM turns',  without: without.llmTurns,         with: with_.llmTurns,         pct: deltas.llmTurnsPct },
    { label: 'Latency',    without: without.totalLatencyMs,   with: with_.totalLatencyMs,   pct: deltas.latencyPct },
    { label: 'Tokens',     without: withoutTokens,            with: withTokens,             pct: deltas.tokensPct },
  ];

  function Bar({ value, max, accent, sublabel }: { value: number; max: number; accent: 'without' | 'with'; sublabel: string }) {
    const height = max > 0 ? (value / max) * 100 : 0;
    const accentVar = accent === 'without' ? 'var(--zc-without-accent)' : 'var(--zc-with-accent)';
    return (
      <div className={styles.barColumn}>
        <span className={styles.barValueLabel} style={{ color: accentVar }}>{value}</span>
        <div className={styles.barOuter}>
          <div
            className={styles.barInner}
            style={{
              height: `${height}%`,
              background: `linear-gradient(to bottom, ${accentVar}, color-mix(in srgb, ${accentVar} 50%, transparent))`,
            }}
          />
        </div>
        <span className={styles.barSublabel}>{sublabel}</span>
      </div>
    );
  }

  return (
    <div className={styles.barGraph}>
      <div className={styles.barGraphTitle}>Metrics comparison</div>
      <div className={styles.barGraphGrid} style={{ gridTemplateColumns: `repeat(${metrics.length}, 1fr)` }}>
        {metrics.map(m => {
          const max = Math.max(m.without, m.with);
          return (
            <div key={m.label} className={styles.barMetricGroup}>
              <div className={styles.barMetricLabel}>{m.label}</div>
              <div className={styles.barPair}>
                <Bar value={m.without} max={max} accent="without" sublabel="Without" />
                <Bar value={m.with}    max={max} accent="with"    sublabel="With" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricBadge({ label, value, accentColor }: { label: string; value: string | number; accentColor?: string }) {
  return (
    <span className={styles.metricBadge}>
      {label}: <span className={styles.metricBadgeValue} style={accentColor ? { color: accentColor } : undefined}>{value}</span>
    </span>
  );
}

function ToolCallList({ calls, inProgress }: { calls: ToolCallRecord[]; inProgress: boolean }) {
  if (calls.length === 0 && !inProgress) {
    return <div className={styles.noToolCalls}>No tool calls</div>;
  }
  return (
    <div className={styles.toolCallList}>
      {calls.map((tc, i) => {
        const argStr = Object.keys(tc.input).length > 0 ? JSON.stringify(tc.input) : '';
        const truncated = argStr.length > 70 ? argStr.slice(0, 70) + '\u2026' : argStr;
        return (
          <div key={i} className={styles.toolCallItem}>
            <span className={styles.toolCallIndex}>{i + 1}.</span>
            <span className={styles.toolCallName}>{tc.tool}</span>
            {truncated && <span className={styles.toolCallArgs}>{truncated}</span>}
            <span className={styles.toolCallLatency}>{tc.latencyMs}ms</span>
          </div>
        );
      })}
      {inProgress && (
        <div className={styles.toolCallPending}>
          <span className={styles.toolCallIndex}>{calls.length + 1}.</span>
          <Spinner size={12} />
          <span>calling tool&hellip;</span>
        </div>
      )}
    </div>
  );
}

interface AgentPanelProps {
  label: string;
  agent: 'without' | 'with';
  run: AgentRun | null;
  liveToolCalls?: ToolCallRecord[];
  waiting?: boolean;
}

function AgentPanel({ label, agent, run, liveToolCalls = [], waiting = false }: AgentPanelProps) {
  const isLive = !run;
  const accentVar = agent === 'without' ? 'var(--zc-without-accent)' : 'var(--zc-with-accent)';

  if (isLive && liveToolCalls.length === 0 && !waiting) {
    return (
      <div className={styles.agentPanel}>
        <div className={styles.panelHeader} style={{ borderBottom: `3px solid ${accentVar}` }}>
          <div className={styles.panelTitle} style={{ color: accentVar }}>{label}</div>
        </div>
        <div className={styles.panelWaiting}>
          <Spinner />Running&hellip;
        </div>
      </div>
    );
  }

  if (isLive) {
    return (
      <div className={styles.agentPanel}>
        <div className={styles.panelHeader} style={{ borderBottom: `3px solid ${accentVar}` }}>
          <div className={styles.panelTitle} style={{ color: accentVar, flex: 1 }}>{label}</div>
          <Spinner size={13} />
        </div>
        <div className={styles.panelSection}>
          <ToolCallList calls={liveToolCalls} inProgress={true} />
        </div>
      </div>
    );
  }

  const totalTokens = run!.inputTokens + run!.outputTokens;
  return (
    <div className={styles.agentPanel}>
      <div className={styles.panelHeader} style={{ borderBottom: `3px solid ${accentVar}` }}>
        <div className={styles.panelTitle} style={{ color: accentVar }}>{label}</div>
      </div>

      <div className={styles.panelSection}>
        {run!.snapshotInjected ? (
          <div className={styles.snapshotInjected}>
            <span className={styles.snapshotInjectedBold}>{'\u2726'} Work context auto-injected</span>
            <div className={styles.snapshotInjectedSub}>0 tool calls &mdash; harness injected the snapshot before first token</div>
          </div>
        ) : (
          <ToolCallList calls={run!.toolCalls} inProgress={false} />
        )}
      </div>

      <div className={styles.panelSection}>
        <div className={styles.responseTitle}>Response</div>
        <div className={styles.responseBody}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => <table className={styles.mdTable}>{children}</table>,
              th: ({ children }) => <th className={styles.mdTh}>{children}</th>,
              td: ({ children }) => <td className={styles.mdTd}>{children}</td>,
            }}
          >{run!.finalResponse}</ReactMarkdown>
        </div>
      </div>

      <div className={styles.panelFooter}>
        <MetricBadge label="Latency" value={`${run!.totalLatencyMs}ms`} accentColor={accentVar} />
        <MetricBadge label="Tokens" value={totalTokens} />
        <MetricBadge label="Tool calls" value={run!.toolCalls.length} accentColor={accentVar} />
        <MetricBadge label="LLM turns" value={run!.llmTurns} />
      </div>
    </div>
  );
}

function fetchDepth(section: 'calendar' | 'email' | 'tasks', profile: FetchProfile): number {
  if (section === 'calendar') return (profile.calendar.deadlineDays - 3) / (14 - 3);
  if (section === 'email') {
    const d = (profile.email.newerThanDays - 1) / (7 - 1);
    const r = (profile.email.maxResults - 10) / (100 - 10);
    return (d + r) / 2;
  }
  return (profile.tasks.pageSize - 50) / (200 - 50);
}

function fetchDepthLabel(section: 'calendar' | 'email' | 'tasks', profile: FetchProfile): string {
  if (section === 'calendar') return `${profile.calendar.deadlineDays}d deadline window`;
  if (section === 'email')    return `${profile.email.newerThanDays}d lookback \u00b7 ${profile.email.maxResults} threads`;
  return `${profile.tasks.pageSize} pages`;
}

function QueryClassificationBar({
  stats,
  onToggle,
}: {
  stats: AdaptiveStats;
  onToggle: (section: string, enabled: boolean) => void;
}) {
  const { currentConfig, fetchProfile } = stats;

  return (
    <div className={styles.adaptiveCard}>
      <div className={styles.adaptiveHeader}>
        <span className={styles.adaptiveTitle}>Fetch depth \u00b7 adaptive</span>

        <div className={styles.sectionToggles}>
          {SECTION_KEYS.map(sec => {
            const enabled = currentConfig[sec] !== false;

            const toggleCls = [
              styles.sectionToggle,
              enabled ? styles.enabled : styles.disabled,
            ].join(' ');

            return (
              <button
                key={sec}
                onClick={() => onToggle(sec, !enabled)}
                data-section={sec}
                title={enabled ? `${CATEGORY_LABELS[sec]} context injecting \u2014 click to disable` : `${CATEGORY_LABELS[sec]} context disabled \u2014 click to enable`}
                className={toggleCls}
              >
                <span className={styles.sectionDot} />
                {CATEGORY_LABELS[sec]}
                {!enabled && <span className={styles.offLabel}> off</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.fetchDepthRows}>
        {SECTION_KEYS.map(sec => {
          const depth = fetchDepth(sec, fetchProfile) * 100;
          const isDisabled = currentConfig[sec] === false;
          return (
            <div key={sec} className={styles.fetchDepthRow}>
              <span className={`${styles.fetchDepthLabel} ${isDisabled ? styles.lineThrough : ''}`}>
                {CATEGORY_LABELS[sec]}
              </span>
              <div className={styles.fetchDepthBarOuter}>
                <div
                  className={`${styles.fetchDepthBarInner} ${isDisabled ? styles.barDisabled : ''}`}
                  data-cat={sec}
                  style={{ width: `${depth}%` }}
                />
              </div>
              <span className={`${styles.fetchDepthInfo} ${isDisabled ? styles.fetchDepthInfoDisabled : ''}`}>
                {fetchDepthLabel(sec, fetchProfile)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FALLBACK_PROMPTS = [
  'What should I focus on right now?',
  'Do I have any urgent emails that need a reply?',
  'What tasks are overdue or at risk?',
  'Give me a full standup summary \u2014 calendar, email, and tasks.',
];

function generateSuggestedPrompts(snapshot: WorkStateSnapshot): string[] {
  const suggested: string[] = [];

  suggested.push('What should I focus on right now?');

  const actionEmail = snapshot.email.action_required[0];
  const awaitingEmail = snapshot.email.awaiting_reply[0];
  if (actionEmail) {
    suggested.push(`I have an email from ${actionEmail.counterparty} \u2014 should I prioritize it, and is my schedule clear to respond today?`);
  } else if (snapshot.email.unread_count > 0) {
    suggested.push(`I have ${snapshot.email.unread_count} unread emails \u2014 are any urgent, and do I have time to address them today?`);
  }
  if (awaitingEmail) {
    suggested.push(`I'm waiting on a reply from ${awaitingEmail.counterparty} \u2014 is there anything else blocking me in the meantime?`);
  }

  const overdueTask = snapshot.tasks.overdue[0];
  const inProgressTask = snapshot.tasks.in_progress[0];
  if (overdueTask) {
    suggested.push(`"${overdueTask.title}" is overdue \u2014 what else is blocked or at risk this week?`);
  } else if (inProgressTask) {
    suggested.push(`I'm working on "${inProgressTask.title}" \u2014 what other tasks need attention today?`);
  } else if (snapshot.tasks.due_today.length > 0) {
    suggested.push(`I have ${snapshot.tasks.due_today.length} task${snapshot.tasks.due_today.length > 1 ? 's' : ''} due today \u2014 how should I prioritize my time?`);
  }

  const nextMeeting = snapshot.calendar.today[0];
  const freeBlock = snapshot.calendar.free_blocks[0];
  if (nextMeeting && freeBlock) {
    suggested.push(`I have a meeting for "${nextMeeting.title}" coming up \u2014 what should I prepare, and is there a free block to do it?`);
  } else if (freeBlock) {
    suggested.push('What\'s the most valuable thing I could do with my free time today given everything on my plate?');
  }

  if (suggested.length < 4) {
    suggested.push('Give me a full standup summary \u2014 calendar, email, and tasks.');
  }

  return suggested.slice(0, 4);
}

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
  const [adaptiveStats, setAdaptiveStats] = useState<AdaptiveStats | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(FALLBACK_PROMPTS);

  const refreshAdaptiveStats = useCallback(async () => {
    try {
      setAdaptiveStats(await getAdaptiveStats());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshAdaptiveStats(); }, [refreshAdaptiveStats]);

  useEffect(() => {
    getSnapshot().then(s => {
      if (s) setSuggestedPrompts(generateSuggestedPrompts(s));
    }).catch(() => { /* ignore */ });
  }, []);

  async function handleToggle(section: string, enabled: boolean) {
    setAdaptiveStats(prev => prev ? { ...prev, currentConfig: { ...prev.currentConfig, [section]: enabled } } : prev);
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
      setError('Connection lost \u2014 is the server running?');
      setStream(null);
    };
  }

  const bothDone = !!(stream?.without && stream?.with);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Live Trace</h1>
        <p className={styles.pageSubtitle}>
          Run both agents against your live data and see the side-by-side comparison.
        </p>
      </div>

      {/* Prompt input */}
      <form onSubmit={handleRun} className={styles.promptForm}>
        <div className={styles.promptInputRow}>
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder='e.g. "What should I focus on right now?"'
            disabled={loading}
            className={styles.promptInput}
          />
          <button type="submit" disabled={loading || !prompt.trim()} className={styles.runButton}>
            {loading ? <><Spinner size={14} />Running&hellip;</> : 'Run Trace'}
          </button>
        </div>
        <div className={styles.suggestedPrompts}>
          {suggestedPrompts.map((p: string) => (
            <button key={p} type="button" onClick={() => setPrompt(p)} disabled={loading} className={styles.suggestButton}>
              {p}
            </button>
          ))}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className={styles.errorBanner}>
          {'\u2717'} {error}
        </div>
      )}

      {/* Results */}
      {stream && (
        <>
          {bothDone && stream.deltas && (
            <>
              <DeltaStrip without={stream.without!} with={stream.with!} deltas={stream.deltas} />
              <MetricsBarGraph without={stream.without!} with={stream.with!} deltas={stream.deltas} />
            </>
          )}

          <div className={styles.promptLabel}>
            Prompt: <span className={styles.promptLabelText}>&ldquo;{stream.prompt}&rdquo;</span>
          </div>

          <div className={styles.resultPanels}>
            <AgentPanel
              label="WITHOUT ZeroCall  (raw tool calls)"
              agent="without"
              run={stream.without}
              liveToolCalls={stream.liveToolCalls}
              waiting={loading && stream.liveToolCalls.length === 0}
            />
            <AgentPanel
              label="WITH ZeroCall  (harness injection)"
              agent="with"
              run={stream.with}
            />
          </div>
        </>
      )}

      {adaptiveStats && (
        <QueryClassificationBar
          stats={adaptiveStats}
          onToggle={handleToggle}
        />
      )}
    </div>
  );
}
