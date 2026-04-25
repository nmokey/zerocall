# Demo and Benchmarking

OneCall includes two evaluation modes: a **demo** mode using mocked data (no credentials needed) and a **live** mode using real Gmail, Calendar, and Notion APIs.

---

## Demo Scripts (`demo/`)

### Prerequisites

```bash
npm install
```

Set `ANTHROPIC_API_KEY` in `.env` (required for Claude API calls). No Google or Notion credentials needed — demo scripts use mocked data.

### `demo:trace` — Side-by-Side Trace

Runs one prompt through both agents in parallel and prints a color-coded trace showing tool calls, latency, and token counts.

```bash
npm run demo:trace              # default: "What are my action items from Arvind's lab?"
npm run demo:trace -- p04       # by prompt ID (p01–p20)
npm run demo:trace -- 7         # by prompt number (1–20)
```

**What it shows:**

1. **WITHOUT OneCall** — the raw-tool agent makes multiple tool calls across Gmail, Calendar, and Notion mock endpoints, requiring 3+ LLM turns
2. **WITH OneCall** — the harness agent gets all context pre-injected, answering in 1 turn with 0 tool calls
3. **Result summary** — percentage reduction in tool calls, LLM turns, latency, and tokens

### `demo:benchmark` — 20-Prompt Metrics Table

Runs all 20 prompts sequentially through both agents and prints a comparison table plus aggregate summary.

```bash
npm run demo:benchmark
```

A 15-second pause between prompts avoids Anthropic API rate limits.

**Output includes:**
- Per-prompt comparison: tool calls, LLM turns, latency, token count for both agents
- Aggregate summary: percentage reductions across all metrics

---

## Live Scripts (`live/`)

Same evaluation scripts but running against real APIs instead of mocked data.

### Prerequisites

All credentials must be configured in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
NOTION_TOKEN=...
NOTION_DATABASE_ID=...
```

**The snapshot database must be populated first:**

```bash
npm start   # Runs the sync server, populates SQLite
```

### `live:trace` — Live Side-by-Side Trace

```bash
npm run live:trace              # default prompt
npm run live:trace -- p04       # specific prompt
```

The `without` agent makes real API calls to Gmail, Calendar, and Notion on every run. The `with` agent reads from the pre-synced SQLite snapshot (sub-millisecond).

### `live:benchmark` — Live 20-Prompt Metrics

```bash
npm run live:benchmark
```

---

## Agents

### Without OneCall (`agents/without.ts`)

A multi-turn agent loop with four raw tools:

| Tool | Description |
|------|-------------|
| `gmail_search_threads` | Search Gmail threads matching a query |
| `gmail_get_thread` | Fetch a specific thread by ID |
| `calendar_list_events` | List calendar events in a time range |
| `notion_query_database` | Query a Notion database |

The agent loop:
1. Sends the user prompt to Claude with all four tools available
2. If Claude responds with `tool_use`, executes the tool and feeds results back
3. Repeats until Claude responds with `end_turn`
4. Records all tool calls, latency, token usage, and LLM turn count

**Demo mode:** Tool handlers return static mock data from `demo/data/mock.ts`.
**Live mode:** Tool handlers call the real Gmail, Calendar, and Notion APIs.

### With OneCall (`agents/with.ts`)

A single-turn agent using the `OneCallAnthropic` harness:

1. Constructs a `OneCallAnthropic` client with the appropriate `snapshotGetter`
2. Sends the user prompt with no tools and no system prompt
3. The harness injects the snapshot into the system prompt automatically
4. Claude responds in one turn

**Demo mode:** `snapshotGetter: () => MOCK_SNAPSHOT`
**Live mode:** `snapshotGetter: () => readLatestSnapshot()` (with error on missing snapshot)

---

## Mock Data (`demo/data/mock.ts`)

A realistic `WorkStateSnapshot` modeling a UCLA research student's work context:

- **3 calendar events** — lab meeting, lecture, research sync
- **3 free blocks** — morning, midday, afternoon
- **2 upcoming deadlines** — project proposal, ICML submission
- **3 action-required emails** — lab action items, author list, office hours coverage
- **2 awaiting-reply emails** — GPU cluster access, coffee chat
- **1 overdue task** — write related work section
- **2 tasks due today** — eval pipeline, review draft
- **2 in-progress tasks** — attention visualization, reproduce baselines

The mock also exports flattened arrays (`MOCK_GMAIL_THREADS`, `MOCK_CALENDAR_EVENTS`, `MOCK_NOTION_TASKS`) for the raw-tool agent's handlers.

---

## Benchmark Prompts (`demo/prompts.ts`)

20 representative productivity prompts across five categories:

| Category | Example Prompts |
|----------|----------------|
| **Priority/focus** | "What should I focus on right now?", "How should I prioritize the next two hours?" |
| **Calendar** | "Am I free at 3pm today?", "What meetings do I have today?" |
| **Email** | "Did Sarah reply to me?", "What emails need my attention?" |
| **Tasks** | "What tasks are overdue?", "What tasks are in progress?" |
| **Synthesis** | "Give me a quick standup summary", "Summarize my work context for the day" |

---

## Observed Results

### Single Prompt (demo:trace)

| Metric | Without OneCall | With OneCall | Reduction |
|--------|----------------|-------------|-----------|
| Tool calls | 5 | 0 | 100% |
| LLM turns | 3 | 1 | 67% |
| Latency | ~19,424ms | ~6,318ms | ~67% |
| Tokens | ~7,152 | ~872 | ~88% |

### Evaluation Limitations

Both demo scripts use mocked data. This measures tool call structure and LLM turn count, not end-to-end correctness against live data. The live scripts (`live/`) address this by using real API calls.
