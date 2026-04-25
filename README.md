# OneCall

**Your AI assistant reads the room before you ask.**

Zero tool calls. One LLM turn. Context already there.

---

## The Problem

Productivity agents are stateless by default. Every query — *"what should I focus on," "am I free at 3pm," "did Sarah reply"* — triggers a full re-fetch across your calendar, inbox, and task manager. The agent isn't slow because it's dumb. It's slow because it has amnesia.

Work state doesn't change that fast, but agents act like it does.

## The Fix

OneCall is an **agent harness** that intercepts every outgoing LLM request and injects a pre-synced `WorkStateSnapshot` directly into the system prompt — before Claude's first token. No tool calls. No model-driven retrieval. The context is already there.

**Before OneCall:** 5+ tool calls, 3+ LLM turns, ~20 seconds per productivity query
**After OneCall:** 0 tool calls, 1 LLM turn, ~6 seconds — and 88% fewer tokens

The key insight: we didn't give Claude a better tool. We changed what Claude knows before it starts thinking.

---

## How It Works

### Background sync loop

OneCall runs a background sync every 15 minutes (configurable), polling Gmail, Google Calendar, and Notion in parallel. Results are distilled into a structured `WorkStateSnapshot` and persisted to a local SQLite database.

### Harness-level injection

`OneCallAnthropic` subclasses the Anthropic SDK client and overrides `prepareOptions()` — a lifecycle hook that fires before every request is sent. On every `messages.create()` call, it reads the latest snapshot from SQLite (sub-millisecond) and splices it into the `system` prompt as a compact plain-text block. The calling code passes no tools and no system prompt; injection is invisible.

```typescript
import { OneCallAnthropic } from '@onecall/harness';

const client = new OneCallAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  snapshotGetter: readLatestSnapshot, // or () => MOCK_SNAPSHOT for demo
});

// No tools. No system prompt. The harness injects the full work context.
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What should I focus on right now?' }],
});
```

### MCP server (optional)

OneCall also exposes a `get_work_state()` MCP tool for compatibility with Claude Desktop, Cursor, and other MCP hosts. This is a deployment option — the demo and benchmark use the harness injection path.

---

## Quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Fill in `.env`:


| Variable                                    | Where to get it                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                         | [console.anthropic.com](https://console.anthropic.com) → API Keys                                                                                                                                                                                                                                   |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (Web application, redirect URI: `http://localhost:3000/oauth2callback`). Enable Gmail API and Google Calendar API. Add your email as a test user on the OAuth consent screen. |
| `NOTION_TOKEN`                              | [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration → Internal Integration Secret                                                                                                                                                                        |
| `NOTION_DATABASE_ID`                        | 32-char hex ID from your Notion task database URL                                                                                                                                                                                                                                                   |


### 3. Build

```bash
npm run build
```

### 4. Run (first time)

```bash
npm start
```

On first run, OneCall prints a Google OAuth URL. Open it in your browser, grant access to Gmail and Calendar (read-only), and tokens are saved to `tokens.json` automatically. Every subsequent run loads and refreshes them silently.

Once authenticated, the first sync runs immediately:

```
[scheduler] polling every 15 minutes
[sync] done in 22547ms — sources: gmail, gcal, notion
```

### 5. Connect to Claude Desktop (optional)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "onecall": {
      "command": "node",
      "args": ["/absolute/path/to/onecall/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The `get_work_state` and `trigger_sync` tools appear automatically.

---

## Injected Context Format

The snapshot is rendered as a compact plain-text block (not raw JSON) before injection, so it reads cleanly and uses fewer tokens:

```
--- ONECALL WORK CONTEXT (as of 2026-04-24T09:00:00Z) ---

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
  • Prof. Cho <cho@cs.ucla.edu>: "TA office hours coverage this week" — ...

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

--- END ONECALL CONTEXT ---
```

---

## Integrations

- **Gmail** — classifies threads into `action_required` (inbound + unread) and `awaiting_reply` (outbound, sent >4h ago, no reply). Fetches threads modified in the last 48 hours.
- **Google Calendar** — today's events, free blocks ≥30 min within working hours (default 9am–6pm, configurable), upcoming deadlines in the next 7 days.
- **Notion** — queries your task database, bins tasks into overdue / due today / in progress by due date and status.

The `TaskProvider` interface makes Linear and Todoist drop-in additions.

---

## Demo & Evaluation

The `demo/` directory contains two scripts for showing the before/after story.

### Setup

Make sure `ANTHROPIC_API_KEY` is set in `.env`. Both scripts call the Claude API directly using mocked provider data.

### `npm run demo:trace` — side-by-side trace

Runs one prompt through both agents in parallel and prints a color-coded trace.

```bash
npm run demo:trace              # default: "What are my action items from Arvind's lab?"
npm run demo:trace -- p04       # by prompt ID
npm run demo:trace -- 7         # by number (1–20)
```

Sample output:

```
WITHOUT OneCall  (raw tool calls)
  1. gmail_search_threads  {"query":"Arvind lab action items"}   1ms
  2. calendar_list_events  {"time_min":"...","time_max":"..."}   0ms
  3. gmail_search_threads  {"query":"Arvind lab meeting notes"}  0ms
  4. gmail_get_thread  {"thread_id":"th_001"}                    0ms
  5. gmail_get_thread  {"thread_id":"th_002"}                    0ms

  Total: 19424ms   Tokens: 7152   Tool calls: 5   LLM turns: 3

WITH OneCall  (harness injection)
  ✦ Work context auto-injected into system prompt
  (0 tool calls — harness injected the snapshot before first token)

  Total: 6318ms   Tokens: 872   Tool calls: 0   LLM turns: 1

─── Result ───────────────────────────────────────────
  Tool calls:  5 → 0  (100% fewer)
  LLM turns:   3 → 1  (67% fewer)
  Latency:     19424ms → 6318ms  (67% faster)
  Tokens:      7152 → 872  (88% fewer)
```

### `npm run demo:benchmark` — 20-prompt metrics table

Runs all 20 prompts and prints a comparison table plus aggregate summary including tool call reduction, LLM turn reduction, latency, and token counts.

```bash
npm run demo:benchmark
```

> **Note:** The benchmark runs prompts sequentially to avoid Anthropic API rate limits.

---

## Current Evaluation Limitations

Both demo scripts use **mocked provider data** (`demo/data/mock.ts`) for both agents. This measures *tool call structure and LLM turn count* given different agent configurations, not end-to-end correctness against live data.

**The ideal evaluation** (not yet implemented) would:

1. Have `syncAll()` run against real providers to populate SQLite
2. Have the "without" agent call the real Gmail/Calendar/Notion APIs live
3. Have the "with" agent read from `readLatestSnapshot()` — the same data the background sync produced
4. Compare both agents' answers for correctness, not just tool call count

To wire the "with" agent to your real snapshot today, update the `snapshotGetter` in `demo/agents/with.ts` to call `readLatestSnapshot` from `server/src/db/snapshot.ts` instead of returning `MOCK_SNAPSHOT`.

---

## Repository Structure

```
onecall/
├── harness/                   # @onecall/harness — SDK subclass + shared types
│   ├── src/
│   │   ├── index.ts           # Package entry point (re-exports)
│   │   ├── client.ts          # OneCallAnthropic — prepareOptions injection
│   │   └── types.ts           # WorkStateSnapshot and all sub-interfaces
│   ├── package.json
│   └── tsconfig.json
├── server/                    # Background sync server + Express API
│   ├── src/
│   │   ├── main.ts            # Entry point — DB init, scheduler, HTTP server
│   │   ├── api/
│   │   │   ├── server.ts      # Express routes (/api/*, /oauth2callback)
│   │   │   └── config.ts      # Credential validation + .env writing
│   │   ├── auth/
│   │   │   └── google.ts      # OAuth2 flow, token persistence, auto-refresh
│   │   ├── db/
│   │   │   ├── client.ts      # better-sqlite3 singleton (WAL mode)
│   │   │   ├── schema.ts      # Table creation on startup
│   │   │   └── snapshot.ts    # Read/write WorkStateSnapshot + sync logging
│   │   ├── providers/
│   │   │   ├── types.ts       # TaskProvider interface
│   │   │   ├── gmail.ts       # Gmail API — thread classification
│   │   │   ├── calendar.ts    # Google Calendar API — events + free blocks
│   │   │   └── notion.ts      # Notion API — task binning by due date/status
│   │   └── sync/
│   │       ├── syncAll.ts     # Parallel provider fetch → snapshot → SQLite
│   │       └── scheduler.ts   # node-cron loop + startup sync
│   ├── package.json
│   └── tsconfig.json
├── web/                       # Vite + React dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   └── pages/
│   ├── package.json
│   └── vite.config.ts
├── demo/                      # Mock-data evaluation scripts
│   ├── data/mock.ts
│   ├── agents/
│   │   ├── without.ts         # Multi-turn agent with raw tools
│   │   └── with.ts            # Single-turn agent using OneCallAnthropic
│   ├── prompts.ts
│   ├── trace.ts
│   └── benchmark.ts
├── live/                      # Live-data evaluation scripts
├── wiki/                      # Project documentation
├── .env.example
├── .gitignore
├── package.json               # Workspace root
├── CLAUDE.md
└── README.md
```

---

## Built at LA Hacks 2026

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.