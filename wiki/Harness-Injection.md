# Harness Injection

The harness is the centrepiece of ZeroCall. It intercepts every outgoing Anthropic API request and injects the current work context into the system prompt before the request leaves the process.

---

## ZeroCallAnthropic

`ZeroCallAnthropic` extends the Anthropic SDK's `Anthropic` class:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { WorkStateSnapshot } from './types/snapshot.js';

export class ZeroCallAnthropic extends Anthropic {
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
```

---

## How It Works

### The `prepareOptions` Hook

The Anthropic SDK calls `prepareOptions()` before every outgoing HTTP request, while `options` is still a mutable plain JS object. ZeroCall's override:

1. **Scopes to messages only** — checks `options.method === 'post'` and `options.path` contains `/messages`. Other endpoints (completions, embeddings, etc.) are left untouched.

2. **Guards against non-object bodies** — early-returns if the body is null, an array, or not an object.

3. **Calls `snapshotGetter()`** — retrieves the current `WorkStateSnapshot`. Returns early if null (no snapshot available yet).

4. **Checks existing system prompt** — if the caller already set a `system` prompt as a `TextBlockParam[]` (array), the override leaves it alone. If it's a string or undefined, injection proceeds.

5. **Injects the snapshot** — calls `injectSnapshot()` to prepend/create the context block in `options.body.system`.

### The `snapshotGetter` Parameter

The snapshot source is injected at construction time, decoupling the harness from any specific data source:

| Context | snapshotGetter |
|---------|---------------|
| Demo/testing | `() => MOCK_SNAPSHOT` |
| Production | `readLatestSnapshot` (from `src/db/snapshot.ts`) |
| Live evaluation | `() => { const s = readLatestSnapshot(); if (!s) throw ...; return s; }` |

---

## Snapshot Formatting

`formatSnapshot()` renders a `WorkStateSnapshot` as compact, structured plain text. This format is more token-efficient than raw JSON and reads clearly in demo terminal output.

### Output Format

```
--- ZEROCALL WORK CONTEXT (as of 2026-04-24T09:00:00Z) ---

[CALENDAR TODAY]
  • 10:00–11:00  Arvind Lab Meeting  (Boelter 4760)  https://zoom.us/j/123456789
  • 14:00–15:30  CS 269 Lecture  (Franz Hall 1178)
  • 16:00–16:30  Research sync w/ Sarah

[FREE BLOCKS TODAY]
  09:00–10:00 (60 min), 11:00–14:00 (180 min), 15:30–16:00 (30 min)

[UPCOMING DEADLINES]
  • 2026-04-26  CS 269 Project Proposal Due
  • 2026-04-28  Deadline: ICML submission

[EMAIL — ACTION REQUIRED]
  • Arvind Kumar <arvind@cs.ucla.edu>: "Action items from today's lab meeting" — ...
  • Sarah Chen <sarah@cs.ucla.edu>: "Re: ICML submission — author list" — ...

[EMAIL — AWAITING REPLY]
  • HPC Support (waiting since 2026-04-22): "GPU cluster access request"
  • Marcus Lee (waiting since 2026-04-23): "Coffee chat?"
  Total unread: 14

[TASKS — OVERDUE]
  • Write related work section for ICML draft (due 2026-04-22)

[TASKS — DUE TODAY]
  • Set up eval pipeline for benchmark suite
  • Review Sarah's lit review draft

[TASKS — IN PROGRESS]
  • Implement attention visualization module
  • Reproduce baseline results from prior paper

--- END ZEROCALL CONTEXT ---
```

### Sections

| Section | Source | Content |
|---------|--------|---------|
| `[CALENDAR TODAY]` | `snapshot.calendar.today` | Time, title, location, meeting link |
| `[FREE BLOCKS TODAY]` | `snapshot.calendar.free_blocks` | Start–end with duration |
| `[UPCOMING DEADLINES]` | `snapshot.calendar.upcoming_deadlines` | Date and title (next 7 days) |
| `[EMAIL — ACTION REQUIRED]` | `snapshot.email.action_required` | Counterparty, subject, snippet (120 chars) |
| `[EMAIL — AWAITING REPLY]` | `snapshot.email.awaiting_reply` | Counterparty, waiting since date, subject |
| `[TASKS — OVERDUE]` | `snapshot.tasks.overdue` | Title and due date |
| `[TASKS — DUE TODAY]` | `snapshot.tasks.due_today` | Title |
| `[TASKS — IN PROGRESS]` | `snapshot.tasks.in_progress` | Title |

### Helper Functions

- **`fmtTime(iso)`** — extracts `HH:MM` from an ISO timestamp (characters 11–16)
- **`fmtDate(iso)`** — extracts `YYYY-MM-DD` from an ISO timestamp (characters 0–10)

---

## Usage Example

```typescript
import { ZeroCallAnthropic } from './src/client.js';
import { readLatestSnapshot } from './src/db/snapshot.js';

const client = new ZeroCallAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  snapshotGetter: readLatestSnapshot,
});

// No tools. No system prompt. The harness handles it.
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What should I focus on right now?' }],
});
```

The calling code is identical to a standard Anthropic SDK call — the injection is fully transparent.
