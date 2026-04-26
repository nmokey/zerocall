import Anthropic from '@anthropic-ai/sdk';
import type { WorkStateSnapshot } from './types.js';
import { formatLocalDate, formatLocalDateTime, formatLocalTime } from './timezone.js';

export interface SectionConfig {
  calendar: boolean;
  email: boolean;
  tasks: boolean;
  slack: boolean;
}

/**
 * ZeroCallAnthropic subclasses the Anthropic SDK client and overrides the
 * `prepareOptions` lifecycle hook to automatically inject the current
 * WorkStateSnapshot into the system prompt of every /v1/messages request.
 *
 * Context is injected by the harness before the request leaves the process —
 * no tool call is needed. The model receives work state in its system prompt
 * and answers in a single generation pass.
 *
 * @param snapshotGetter - Called on every request to retrieve the current
 *   snapshot. May return synchronously or as a Promise.
 *   Use `() => MOCK_SNAPSHOT` for demo/testing, or an async function
 *   like `ensureFreshSnapshot` for live use with lazy caching.
 * @param configGetter - Optional. Returns which snapshot sections are enabled.
 *   Defaults to all sections enabled if not provided.
 * @param queryLogger - Optional. Called with (queryText, category) after
 *   classifying the user's prompt. Used by live agents to persist query history.
 */
export class ZeroCallAnthropic extends Anthropic {
  private readonly snapshotGetter: () => WorkStateSnapshot | null | Promise<WorkStateSnapshot | null>;
  private readonly configGetter?: () => SectionConfig | null;
  private readonly queryLogger?: (queryText: string) => void;

  constructor(
    opts: ConstructorParameters<typeof Anthropic>[0] & {
      snapshotGetter: () => WorkStateSnapshot | null | Promise<WorkStateSnapshot | null>;
      configGetter?: () => SectionConfig | null;
      queryLogger?: (queryText: string) => void;
    }
  ) {
    const { snapshotGetter, configGetter, queryLogger, ...anthropicOpts } = opts;
    super(anthropicOpts);
    this.snapshotGetter = snapshotGetter;
    this.configGetter = configGetter;
    this.queryLogger = queryLogger;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override async prepareOptions(options: any): Promise<void> {
    // Scope injection to POST /v1/messages only
    if (options.method !== 'post' || !String(options.path).includes('/messages')) return;

    const body = options.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return;

    const snapshot = await Promise.resolve(this.snapshotGetter());
    if (!snapshot) return;

    // Handle string | undefined; leave TextBlockParam[] untouched
    const existing = body.system;
    if (existing !== undefined && typeof existing !== 'string') return;

    // Log the user query if a logger is wired in
    if (this.queryLogger) {
      const userText = extractUserText(body.messages);
      if (userText) this.queryLogger(userText);
    }

    const config = this.configGetter?.() ?? { calendar: true, email: true, tasks: true, slack: true };
    const filtered = filterSnapshot(snapshot, config);
    body.system = injectSnapshot(existing, filtered, config);
  }
}

/**
 * Extracts the text content of the last user message from a messages array.
 * Used to log the prompt for adaptive pattern analysis.
 */
function extractUserText(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const last = messages[messages.length - 1];
  if (!last || typeof last !== 'object') return null;
  const msg = last as Record<string, unknown>;
  if (msg.role !== 'user') return null;
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    const textBlock = msg.content.find(
      (b): b is { type: 'text'; text: string } =>
        typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text'
    );
    return textBlock?.text ?? null;
  }
  return null;
}

/**
 * Returns a copy of the snapshot with disabled sections zeroed out.
 * The type stays stable — formatSnapshot handles empty arrays gracefully.
 *
 * @param s - Original snapshot.
 * @param config - Which sections are enabled.
 */
function filterSnapshot(s: WorkStateSnapshot, config: SectionConfig): WorkStateSnapshot {
  return {
    ...s,
    calendar: config.calendar
      ? s.calendar
      : { today: [], free_blocks: [], upcoming_deadlines: [] },
    email: config.email
      ? s.email
      : { action_required: [], awaiting_reply: [], unread_count: 0 },
    tasks: config.tasks
      ? s.tasks
      : { overdue: [], due_today: [], in_progress: [] },
    // Slack is optional on the snapshot; disabled sections become undefined
    // so that formatSnapshot's guard (if config.slack && snapshot.slack) fires correctly.
    slack: config.slack ? s.slack : undefined,
  };
}

/**
 * Prepends (or creates) the ZeroCall context block in the system prompt.
 * Sections that are disabled in config are suppressed entirely (no header).
 *
 * @param existing - The caller's system prompt, or undefined.
 * @param snapshot - The (already filtered) WorkStateSnapshot to format.
 * @param config - Which sections are enabled, used to suppress headers.
 */
function injectSnapshot(
  existing: string | undefined,
  snapshot: WorkStateSnapshot,
  config: SectionConfig,
): string {
  const block = formatSnapshot(snapshot, config);
  return existing ? `${existing}\n\n${block}` : block;
}

/**
 * Renders a WorkStateSnapshot as a compact, structured plain-text block.
 * Plain text is more token-efficient than JSON and reads well in demo output.
 * Sections disabled in config are omitted entirely.
 *
 * @param s - The snapshot to format.
 * @param config - Which sections to include.
 */
function formatSnapshot(s: WorkStateSnapshot, config: SectionConfig): string {
  const lines: string[] = [];

  lines.push(`--- ZEROCALL WORK CONTEXT (as of ${formatLocalDateTime(s.as_of)}) ---`);
  lines.push(`Current local time: ${formatLocalDateTime(new Date())}`);

  if (config.calendar) {
    lines.push('\n[CALENDAR TODAY]');
    if (s.calendar.today.length === 0) {
      lines.push('  (no events)');
    } else {
      for (const evt of s.calendar.today) {
        const start = fmtTime(evt.start);
        const end = fmtTime(evt.end);
        const location = evt.location ? `  (${evt.location})` : '';
        const link = evt.meeting_link ? `  ${evt.meeting_link}` : '';
        lines.push(`  • ${start}–${end}  ${evt.title}${location}${link}`);
      }
    }

    lines.push('\n[FREE BLOCKS TODAY]');
    if (s.calendar.free_blocks.length === 0) {
      lines.push('  (none)');
    } else {
      const blocks = s.calendar.free_blocks
        .map(b => `${fmtTime(b.start)}–${fmtTime(b.end)} (${b.duration_minutes} min)`)
        .join(', ');
      lines.push(`  ${blocks}`);
    }

    lines.push('\n[UPCOMING DEADLINES]');
    if (s.calendar.upcoming_deadlines.length === 0) {
      lines.push('  (none)');
    } else {
      for (const evt of s.calendar.upcoming_deadlines) {
        lines.push(`  • ${fmtDate(evt.start)}  ${evt.title}`);
      }
    }
  }

  if (config.email) {
    lines.push('\n[EMAIL — ACTION REQUIRED]');
    if (s.email.action_required.length === 0) {
      lines.push('  (none)');
    } else {
      for (const t of s.email.action_required) {
        lines.push(`  • ${t.counterparty}: "${t.subject}" — ${t.snippet.slice(0, 120)}`);
      }
    }

    lines.push('\n[EMAIL — AWAITING REPLY]');
    if (s.email.awaiting_reply.length === 0) {
      lines.push('  (none)');
    } else {
      for (const t of s.email.awaiting_reply) {
        const since = t.waiting_since ? ` (waiting since ${fmtDate(t.waiting_since)})` : '';
        lines.push(`  • ${t.counterparty}${since}: "${t.subject}"`);
      }
    }
    lines.push(`  Total unread: ${s.email.unread_count}`);
  }

  if (config.tasks) {
    lines.push('\n[TASKS — OVERDUE]');
    if (s.tasks.overdue.length === 0) {
      lines.push('  (none)');
    } else {
      for (const t of s.tasks.overdue) {
        const due = t.due ? ` (due ${fmtDate(t.due)})` : '';
        lines.push(`  • ${t.title}${due}`);
      }
    }

    lines.push('\n[TASKS — DUE TODAY]');
    if (s.tasks.due_today.length === 0) {
      lines.push('  (none)');
    } else {
      for (const t of s.tasks.due_today) {
        lines.push(`  • ${t.title}`);
      }
    }

    lines.push('\n[TASKS — IN PROGRESS]');
    if (s.tasks.in_progress.length === 0) {
      lines.push('  (none)');
    } else {
      for (const t of s.tasks.in_progress) {
        lines.push(`  • ${t.title}`);
      }
    }
  }

  if (config.slack && s.slack) {
    lines.push('\n[SLACK — DMs NEEDING REPLY]');
    if (s.slack.dm_action_required.length === 0) {
      lines.push('  (none)');
    } else {
      for (const dm of s.slack.dm_action_required) {
        lines.push(`  • ${dm.counterparty}: "${dm.snippet}"`);
      }
    }

    lines.push('\n[SLACK — WAITING FOR REPLY]');
    if (s.slack.dm_awaiting_reply.length === 0) {
      lines.push('  (none)');
    } else {
      for (const dm of s.slack.dm_awaiting_reply) {
        const since = dm.waiting_since ? ` (waiting since ${fmtDate(dm.waiting_since)})` : '';
        lines.push(`  • ${dm.counterparty}${since}: "${dm.snippet}"`);
      }
    }
  }

  lines.push('\n--- END ZEROCALL CONTEXT ---');

  return lines.join('\n');
}

/** Format an ISO timestamp as HH:MM in the user's configured timezone. */
function fmtTime(iso: string): string {
  return formatLocalTime(iso);
}

/** Format an ISO timestamp as YYYY-MM-DD in the user's configured timezone. */
function fmtDate(iso: string): string {
  return formatLocalDate(iso);
}
