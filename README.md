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

### Layer 1: Background sync

OneCall runs a background sync every 15 minutes (configurable), polling Gmail, Google Calendar, and Notion in parallel using their REST APIs directly — no LLM involved. Results are distilled into a structured `WorkStateSnapshot` and persisted to a local SQLite database.

### Layer 2: Harness-level injection

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

### Layer 3: Setup page

The server serves a lightweight HTML setup page at `http://localhost:3000/setup`. It handles credential entry (Google OAuth, Notion token, optional Anthropic key) and shows sync status. No separate frontend build needed.

---

## Quickstart

### 1. Install and build

```bash
npm install
npm run build
```

### 2. Start the server

```bash
npm start
```

### 3. Configure credentials

Open `http://localhost:3000/setup` in your browser. Enter credentials section by section — each saves independently so you don't lose progress.

| Credential | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (Web application). Set redirect URI to `http://localhost:3000/oauth2callback`. Enable Gmail API and Google Calendar API. Add your email as a test user under OAuth consent screen → Test users. |
| `NOTION_TOKEN` | [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration → Internal Integration Secret. Share your task database with the integration via the database's Connections menu. |
| `NOTION_DATABASE_ID` | 32-char hex ID from your Notion task database URL (between the last `/` and `?`) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys. Only needed for the demo/live benchmark scripts. |

### 4. Connect Google

On the setup page, click **Connect Google Account** after saving your Google credentials. This opens the OAuth consent screen. After approving, you're redirected back and tokens are saved to `server/tokens.json`.

If the browser-based OAuth flow doesn't work, use the CLI alternative:

```bash
npm run auth:google
```

This prints a consent URL, you open it, paste the `code` from the redirect URL back into the terminal, and tokens are written directly.

Once connected, the first sync runs immediately:

```
[scheduler] polling every 15 minutes
[sync] done in 22547ms — sources: gmail, gcal, notion
```

---

## Development

Run the server in watch mode (auto-recompiles on save):

```bash
npm run dev
```

---

## Injected Context Format

The snapshot is rendered as a compact plain-text block (not raw JSON) before injection:

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

The `demo/` directory contains evaluation scripts that use **mocked provider data** — no credentials needed, just `ANTHROPIC_API_KEY`.

```bash
npm run demo:trace                                       # default prompt
npm run demo:trace -- p04                                # by prompt ID
npm run demo:trace -- 7                                  # by number (1–20)
npm run demo:trace -- --prompt "Am I free at 3pm?"       # custom prompt
npm run demo:benchmark                                   # all 20 prompts
```

Sample trace output:

```
WITHOUT OneCall  (raw tool calls)
  1. gmail_search_threads  1ms
  2. calendar_list_events  0ms
  3. gmail_get_thread       0ms
  4. gmail_get_thread       0ms
  5. notion_query_database  0ms

  Total: 19424ms   Tokens: 7152   Tool calls: 5   LLM turns: 3

WITH OneCall  (harness injection)
  ✦ Work context auto-injected into system prompt
  (0 tool calls — harness injected the snapshot before first token)

  Total: 6318ms   Tokens: 872   Tool calls: 0   LLM turns: 1

  Tool calls:  5 → 0  (100% fewer)
  LLM turns:   3 → 1  (67% fewer)
  Latency:     19424ms → 6318ms  (67% faster)
  Tokens:      7152 → 872  (88% fewer)
```

**On token reduction:** the background sync calls Google and Notion REST APIs directly — no LLM, no tokens. Token savings are real: each user query drops from ~7,000 tokens across multiple LLM turns to ~870 tokens in a single turn.

---

## Live Evaluation

The `live/` directory runs the same trace and benchmark against your **real** Gmail, Google Calendar, and Notion data.

**Prerequisites:** credentials configured, `npm start` run at least once so the SQLite snapshot is populated.

```bash
npm run live:trace -- --prompt "What should I focus on today?"
npm run live:benchmark
```

The `without` agent makes live API calls on each run. The `with` agent reads from the local snapshot (sub-millisecond).

---

## npm Scripts Reference

| Command | What it does |
|---|---|
| `npm install` | Install all deps + link workspace packages |
| `npm run build` | Compile harness + server |
| `npm run build:harness` | Compile harness only |
| `npm run build:server` | Compile server only |
| `npm start` | Run the server (`http://localhost:3000`) |
| `npm run dev` | Server in watch/reload mode |
| `npm run auth:google` | CLI OAuth flow — writes `server/tokens.json` |
| `npm run demo:trace` | Mock-data side-by-side trace |
| `npm run demo:benchmark` | Mock-data 20-prompt benchmark |
| `npm run live:trace` | Live-data side-by-side trace |
| `npm run live:benchmark` | Live-data 20-prompt benchmark |

**When to rebuild:**

| Situation | Command |
|---|---|
| First clone | `npm run build` |
| Changed `harness/src/` | `npm run build:harness` (demo/live scripts do this automatically) |
| Changed `server/src/` | `npm run build:server`, then `npm start` |
| Changed both | `npm run build` |

---

## Repository Structure

```
onecall/
├── harness/                   # @onecall/harness — npm workspace package
│   └── src/
│       ├── client.ts          # OneCallAnthropic — prepareOptions injection
│       ├── types.ts           # WorkStateSnapshot and all sub-interfaces
│       └── index.ts           # Package entry point (re-exports)
├── server/                    # Background sync + Express API — npm workspace package
│   ├── src/
│   │   ├── main.ts            # Entry point — DB init, scheduler, HTTP server
│   │   ├── env.ts             # Loads .env relative to server root
│   │   ├── api/
│   │   │   ├── server.ts      # Express routes (/setup, /api/*, /oauth2callback)
│   │   │   ├── config.ts      # Credential validation + .env writing
│   │   │   └── setup.ts       # Server-rendered HTML setup page + POST handler
│   │   ├── auth/
│   │   │   └── google.ts      # OAuth2 flow, token persistence, auto-refresh
│   │   ├── db/
│   │   │   ├── client.ts      # better-sqlite3 singleton
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
│   └── tokens.json            # Google OAuth tokens (gitignored, written by auth flow)
├── shared/                    # Shared logic used by demo/ and live/
│   ├── trace.ts               # Color-coded side-by-side trace runner
│   ├── benchmark.ts           # 20-prompt metrics table runner
│   ├── agentLoop.ts           # Generic agentic loop (without-agent)
│   ├── runWith.ts             # Generic with-agent runner (uses OneCallAnthropic)
│   ├── prompts.ts             # 20 representative productivity prompts
│   └── types.ts               # AgentRun + ToolCallRecord types
├── demo/                      # Mock-data evaluation (no credentials needed)
│   ├── data/mock.ts           # Realistic static WorkStateSnapshot + raw slices
│   ├── agents/
│   │   ├── without.ts         # Multi-turn agent with raw tools (mock responses)
│   │   └── with.ts            # Single-turn agent using OneCallAnthropic (mock snapshot)
│   ├── trace.ts               # Thin wrapper → shared/trace.ts
│   └── benchmark.ts           # Thin wrapper → shared/benchmark.ts
├── live/                      # Live-data evaluation (requires server + credentials)
│   ├── agents/
│   │   ├── without.ts         # Multi-turn agent with real API calls
│   │   └── with.ts            # Single-turn agent reading live SQLite snapshot
│   ├── trace.ts               # Thin wrapper → shared/trace.ts
│   └── benchmark.ts           # Thin wrapper → shared/benchmark.ts
├── scripts/
│   └── google-auth.ts         # CLI OAuth flow for terminal-only environments
├── .env                       # Credentials (gitignored)
├── .env.example
├── package.json               # Workspace root — orchestration scripts only
└── CLAUDE.md
```

---

## Built at LA Hacks 2026

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.
