# OneCall

**Your AI assistant reads the room before you ask.**

Zero tool calls. One LLM turn. Context already there.

---

## The Problem

Productivity agents are stateless by default. Every query — *"what should I focus on," "am I free at 3pm," "did Sarah reply"* — triggers a full re-fetch across your calendar, inbox, and task manager. The agent isn't slow because it's dumb. It's slow because it has amnesia.

## The Fix

OneCall is an **agent harness** that intercepts every outgoing LLM request and injects a pre-synced `WorkStateSnapshot` directly into the system prompt — before Claude's first token. No tool calls. No model-driven retrieval. The context is already there.

**Before OneCall:** 5+ tool calls, 3+ LLM turns, ~20 seconds per productivity query
**After OneCall:** 0 tool calls, 1 LLM turn, ~6 seconds — and 88% fewer tokens

---

## How It Works

### Layer 1: Background sync

Polls Gmail, Google Calendar, and Notion via REST APIs (no LLM involved), distills results into a `WorkStateSnapshot`, and persists to SQLite. Uses lazy caching: syncs only fire when the snapshot is requested and the cache is stale (>15 min).

### Layer 2: Harness injection

`OneCallAnthropic` subclasses the Anthropic SDK and overrides `prepareOptions()`. On every `messages.create()` call, it reads the latest snapshot (sub-millisecond), filters it by the adaptive section config, and splices it into the system prompt. The calling code passes no tools and no system prompt; injection is invisible.

```typescript
import { OneCallAnthropic } from '@onecall/harness';

const client = new OneCallAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  snapshotGetter: readLatestSnapshot,
});

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What should I focus on right now?' }],
});
```

### Layer 3: Adaptive System Prompt Manager

OneCall observes your query patterns and learns which snapshot sections you actually need. After enough queries, it surfaces suggestions like "you almost never ask about email — disable that section and save ~180 tokens per query." One click applies the optimization; the next request gets a leaner system prompt with no behavior change for the sections that matter.

Classification is purely lexical — no extra LLM call. The suggestion engine computes per-section relevance from your query history and flags sections below 15% relevance.

### Layer 4: React dashboard

The server serves a Vite + React frontend at `http://localhost:3000`. It handles first-run credential setup (Google OAuth, Notion token), shows the current snapshot and sync status, and hosts the Adaptive Optimization panel with one-click apply.

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

Open `http://localhost:3000` in your browser. Enter credentials section by section — each saves independently.

| Credential | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (Web application). Set redirect URI to `http://localhost:3000/oauth2callback`. Enable Gmail API and Google Calendar API. Add your email as a test user under OAuth consent screen. |
| `NOTION_TOKEN` | [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration → Internal Integration Secret. Share your task database with the integration via the database's Connections menu. |
| `NOTION_DATABASE_ID` | 32-char hex ID from your Notion task database URL (between the last `/` and `?`) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys. Only needed for demo/live benchmark scripts. |

### 4. Connect Google

On the setup page, click **Connect Google Account**. After approving the OAuth consent screen, tokens are saved to `server/tokens.json`.

If the browser OAuth flow doesn't work, use the CLI alternative:

```bash
npm run auth:google
```

---

## Development

```bash
npm run dev        # server in watch/reload mode
npm run dev:web    # Vite dev server with HMR (proxies /api/* to port 3000)
```

---

## Integrations

- **Gmail** — classifies threads into `action_required` (inbound + unread) and `awaiting_reply` (outbound, sent >4h ago, no reply). Fetches threads modified in the last 48 hours.
- **Google Calendar** — today's events, free blocks ≥30 min within working hours (default 9am–6pm, configurable), upcoming deadlines in the next 7 days.
- **Notion** — queries your task database, bins tasks into overdue / due today / in progress by due date and status.

The `TaskProvider` interface makes Linear and Todoist drop-in additions.

---

## Demo & Evaluation

The `demo/` directory uses **mocked data** — no credentials needed, just `ANTHROPIC_API_KEY`.

```bash
npm run demo:trace                                       # default prompt
npm run demo:trace -- p04                                # by prompt ID
npm run demo:trace -- --prompt "Am I free at 3pm?"       # custom prompt
npm run demo:benchmark                                   # all 20 prompts
npm run demo:adaptive                                    # adaptive optimization demo
```

Sample benchmark output:

```
WITHOUT OneCall  (raw tool calls)
  1. gmail_search_threads  1ms
  2. calendar_list_events  0ms
  3. gmail_get_thread       0ms
  4. notion_query_database  0ms

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

### Adaptive demo (`demo:adaptive`)

Runs 15 prompts (calendar/task-heavy) through OneCall twice:

1. **Phase 1** — all sections enabled; queries are classified and logged in memory
2. **Analysis** — computes per-section relevance from specific-category queries only; suggests disabling email (8% relevance, below the 15% threshold)
3. **Phase 2** — same prompts with email section disabled; tokens drop

```
ADAPTIVE OPTIMIZATION RESULTS
  Disabled sections:     email (relevance < 15%)
  Avg tokens — Phase 1:  ~900 tokens/query  (all sections)
  Avg tokens — Phase 2:  ~720 tokens/query  (optimized)
  Token reduction:        ~20%
  The system learned your workflow. Same answers, 20% leaner.
```

---

## Live Evaluation

The `live/` directory runs the same trace and benchmark against your **real** Gmail, Google Calendar, and Notion data.

**Prerequisites:** credentials configured, `npm start` run at least once so the SQLite snapshot is populated.

```bash
npm run live:trace -- --prompt "What should I focus on today?"
npm run live:benchmark
```

The `without` agent makes live API calls on each run. The `with` agent reads from the local snapshot (sub-millisecond). Live queries are also logged to the `query_log` table, which feeds the Adaptive Optimization panel in the dashboard.

---

## Built at LA Hacks 2026

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.
