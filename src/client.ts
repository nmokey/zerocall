import Anthropic from '@anthropic-ai/sdk';
import type { WorkStateSnapshot } from './types/snapshot.js';

/**
 * OneCallAnthropic subclasses the Anthropic SDK client and overrides the
 * `prepareOptions` lifecycle hook to automatically inject the current
 * WorkStateSnapshot into the system prompt of every /v1/messages request.
 *
 * Context is injected by the harness before the request leaves the process —
 * no tool call is needed. The model receives work state in its system prompt
 * and answers in a single generation pass.
 *
 * @param snapshotGetter - Called on every request to retrieve the current
 *   snapshot. Use `() => MOCK_SNAPSHOT` for demo/testing, or
 *   `readLatestSnapshot` for live production use.
 */
export class OneCallAnthropic extends Anthropic {
  private readonly snapshotGetter: () => WorkStateSnapshot | null;

  constructor(
    opts: ConstructorParameters<typeof Anthropic>[0] & {
      snapshotGetter: () => WorkStateSnapshot | null;
    }
  ) {
    const { snapshotGetter, ...anthropicOpts } = opts;
    super(anthropicOpts);
    this.snapshotGetter = snapshotGetter;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override async prepareOptions(options: any): Promise<void> {
    // Scope injection to POST /v1/messages only
    if (options.method !== 'post' || !String(options.path).includes('/messages')) return;

    const body = options.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return;

    const snapshot = this.snapshotGetter();
    if (!snapshot) return;

    // Handle string | undefined; leave TextBlockParam[] untouched
    const existing = body.system;
    if (existing !== undefined && typeof existing !== 'string') return;

    body.system = injectSnapshot(existing, snapshot);
  }
}

/**
 * Prepends (or creates) the OneCall context block in the system prompt.
 *
 * @param existing - The caller's system prompt, or undefined.
 * @param snapshot - The WorkStateSnapshot to format and inject.
 */
function injectSnapshot(existing: string | undefined, snapshot: WorkStateSnapshot): string {
  const block = formatSnapshot(snapshot);
  return existing ? `${existing}\n\n${block}` : block;
}

/**
 * Renders a WorkStateSnapshot as a compact, structured plain-text block.
 * Plain text is more token-efficient than JSON and reads well in demo output.
 *
 * @param s - The snapshot to format.
 */
function formatSnapshot(s: WorkStateSnapshot): string {
  const lines: string[] = [];

  lines.push(`--- ONECALL WORK CONTEXT (as of ${s.as_of}) ---`);

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

  lines.push('\n--- END ONECALL CONTEXT ---');

  return lines.join('\n');
}

/** Format an ISO timestamp as HH:MM (UTC) for calendar display. */
function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}

/** Format an ISO timestamp as YYYY-MM-DD for date display. */
function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}
