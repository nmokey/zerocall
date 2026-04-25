# OneCall

**Your AI assistant reads the room before you ask.**

A read-once cache for your work life — one tool call instead of ten.

---

## The Problem

Productivity agents are stateless by default. Every query — *"what should I focus on," "am I free at 3pm," "did Sarah reply"* — triggers a full re-fetch across your calendar, inbox, and task manager. The agent isn't slow because it's dumb. It's slow because it has amnesia.

Work state doesn't change that fast, but agents act like it does.

## The Fix

OneCall is an MCP server that maintains a continuously-updated snapshot of your work context. Any agent calls `get_work_state()` once and gets back everything it needs — current calendar, emails requiring action, and tasks by priority — in a single structured response.

**Before OneCall:** 6–8 tool calls, ~4–6 seconds per productivity query  
**After OneCall:** 1 tool call, sub-100ms response

---

## How It Works

1. OneCall runs as a background process alongside your AI agent
2. Every 15 minutes, it polls Gmail, Google Calendar, and Notion
3. It distills raw API responses into a clean `WorkStateSnapshot`
4. The snapshot is persisted to a local SQLite database
5. When your agent calls `get_work_state()`, it reads from SQLite — no network round-trips

The server is agent-agnostic: works with Claude Desktop, Cursor, Windsurf, or any MCP-compatible host.

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

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (Web application, redirect URI: `http://localhost:3000/oauth2callback`). Enable Gmail API and Google Calendar API in the library. Add your email as a test user on the OAuth consent screen. |
| `NOTION_TOKEN` | [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration → Internal Integration Secret |
| `NOTION_DATABASE_ID` | 32-char hex ID from your Notion task database URL (between the last `/` and `?`) |

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

### 5. Connect to Claude Desktop

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

## MCP Tools

### `get_work_state()`

Returns the latest cached snapshot. Sub-millisecond read from SQLite — no network calls.

```json
{
  "as_of": "2026-04-24T14:30:00Z",
  "calendar": {
    "today": [...],
    "free_blocks": [...],
    "upcoming_deadlines": [...]
  },
  "email": {
    "action_required": [...],
    "awaiting_reply": [...],
    "unread_count": 12
  },
  "tasks": {
    "overdue": [...],
    "due_today": [...],
    "in_progress": [...]
  },
  "meta": {
    "sync_duration_ms": 1840,
    "sources": ["gmail", "gcal", "notion"],
    "errors": []
  }
}
```

### `trigger_sync()`

Forces an immediate re-sync outside the normal 15-minute window. Use when data feels stale.

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

Make sure `ANTHROPIC_API_KEY` is set in `.env`. Both scripts call the Claude API directly.

### `npm run demo:trace` — side-by-side trace

Runs one prompt through both agents in parallel and prints a color-coded tool call trace with per-call latency and token counts.

```bash
npm run demo:trace              # default: "What are my action items from Arvind's lab?"
npm run demo:trace -- p04       # by prompt ID
npm run demo:trace -- 7         # by number (1–20)
```

Sample output:

```
WITHOUT OneCall  (raw tool calls)
  1. gmail_search_threads  {"query":"newer_than:2d"}   12ms
  2. gmail_get_thread  {"thread_id":"th_001"}           8ms
  3. calendar_list_events  {"time_min":"..."}           9ms
  4. notion_query_database  {}                         11ms

  Total: 2340ms   Tokens: 3120   Tool calls: 4

WITH OneCall
  1. get_work_state                                     0ms

  Total: 890ms   Tokens: 2180   Tool calls: 1

  Tool calls: 4 → 1  (75% fewer)
  Latency:    2340ms → 890ms  (62% faster)
  Tokens:     3120 → 2180  (30% fewer)
```

### `npm run demo:benchmark` — 20-prompt metrics table

Runs all 20 prompts and prints a comparison table plus aggregate summary.

```bash
npm run demo:benchmark
```

> **Note:** The benchmark runs prompts sequentially to avoid Anthropic API rate limits.

---

## Current Evaluation Limitations

Both demo scripts currently use **mocked provider data** (`demo/data/mock.ts`) for both agents. This means:

- The "without" agent's tool handlers return static mock responses, not live API calls
- The "with" agent returns a pre-built mock snapshot, not the real SQLite snapshot
- The evaluation measures *tool call structure* (how many calls Claude makes given different schemas), not end-to-end correctness

**The ideal evaluation** (not yet implemented) would:

1. Have `syncAll()` run against real providers to populate SQLite
2. Have the "without" agent call the real Gmail/Calendar/Notion APIs live
3. Have the "with" agent read the SQLite snapshot those same APIs produced
4. Compare both agents' answers for correctness, not just tool call count

To wire the "with" agent to your real snapshot today, update `demo/agents/with.ts` to call `readLatestSnapshot()` from `src/db/snapshot.ts` instead of returning `MOCK_SNAPSHOT`.

---

## Repository Structure

```
onecall/
├── src/
│   ├── index.ts              # Entry point — initializes DB, starts scheduler, connects MCP server
│   ├── server.ts             # MCP tool registration (get_work_state, trigger_sync)
│   ├── types/
│   │   └── snapshot.ts       # WorkStateSnapshot and all sub-interfaces
│   ├── providers/
│   │   ├── types.ts          # TaskProvider interface
│   │   ├── gmail.ts          # Gmail API — thread classification
│   │   ├── calendar.ts       # Google Calendar API — events + free block calculation
│   │   └── notion.ts         # Notion API — task binning by due date/status
│   ├── db/
│   │   ├── client.ts         # better-sqlite3 singleton (WAL mode)
│   │   ├── schema.ts         # Table creation on startup
│   │   └── snapshot.ts       # Read/write WorkStateSnapshot + sync logging
│   ├── auth/
│   │   └── google.ts         # OAuth2 flow, token persistence, auto-refresh
│   └── sync/
│       ├── syncAll.ts        # Parallel provider fetch → snapshot → SQLite
│       └── scheduler.ts      # node-cron loop + startup sync
├── demo/
│   ├── data/mock.ts          # Realistic mock work context for evaluation
│   ├── agents/
│   │   ├── without.ts        # Agent with raw Gmail/Calendar/Notion tools
│   │   └── with.ts           # Agent with only get_work_state()
│   ├── prompts.ts            # 20 representative productivity prompts
│   ├── trace.ts              # Single-prompt side-by-side trace
│   └── benchmark.ts          # 20-prompt metrics table
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Built at LA Hacks 2026

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.
