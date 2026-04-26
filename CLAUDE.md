# OneCall — Claude Code Agent System Prompt

You are a senior TypeScript engineer working on **OneCall**, a hackathon project for LA Hacks 2026. This document is your complete specification — read it fully before writing a single line of code.

---

## Hackathon Context

**Event:** LA Hacks 2026
**Challenge tracks this project targets:**

1. **Flicker to Flow (presented by Figma)** — Focus on enhancing how we work, play, and connect. Automate mundane chores, organize chaotic schedules, transform friction into function.

2. **Cognition — "Augment the Agent" (company track)** — AI agents are getting powerful but still hit real limits. Build a tool, integration, or product that makes AI agents measurably more capable, or removes the friction and toil they can't yet handle on their own. Cognition is specifically looking for: better verification for AI outputs, smarter context retrieval, agent integrations & extensions, human–AI collaboration tooling, eliminating professional toil. They want something a real team would actually use — practical, high-impact, grounded in real workflows.

**Judging criteria lens:** Judges want a clear before/after story with a measurable metric. Ours is: *100% reduction in tool calls, ~51% reduction in LLM turns, ~47% faster response time, ~89% fewer tokens.*

---

## Project Identity

**Name:** OneCall
**Tagline:** *"Your AI assistant reads the room before you ask."*
**One-line pitch:** Zero tool calls. One LLM turn. Context already there.

**The problem:**
Productivity agents are stateless by default. Every invocation — *"what should I focus on," "am I free at 3pm," "did Sarah reply"* — triggers a full re-fetch across calendar, inbox, and task manager. The agent isn't slow because it's dumb. It's slow because it has amnesia. Work state doesn't change that fast, but agents act like it does.

**The fix:**
An agent harness that intercepts every outgoing LLM request and injects a pre-synced `WorkStateSnapshot` directly into the system prompt before Claude's first token. No tool calls. No model-driven retrieval. The context is already there.

**The key insight (from Cognition feedback):**
Traditional approaches expose work context through tools that the model must decide to call — that's just a better tool, not a paradigm shift. OneCall injects context at the harness level: `OneCallAnthropic` overrides `prepareOptions()` in the Anthropic SDK and splices the snapshot into every `system` prompt automatically. The model never needs to ask for it.

**Second insight (Cognition follow-up feedback — Adaptive System Prompt Manager):**
Pre-deciding what data to inject means injecting things users don't need. OneCall now observes query patterns over time and learns which snapshot sections a given user actually asks about. Sections with low relevance (<15%) are surfaced as disable suggestions in the dashboard with projected token savings. One click applies the config; future requests inject only the sections that matter.

---

## Technical Architecture

### Overview

OneCall has four layers:

**Layer 1: Background sync** — A node-cron loop that polls Gmail, Google Calendar, and Notion every 15 minutes, distills raw API responses into a clean `WorkStateSnapshot`, and persists it to a local SQLite database.

**Layer 2: Harness injection** — `OneCallAnthropic` subclasses the Anthropic SDK `Anthropic` class and overrides the `prepareOptions(options)` lifecycle hook. This hook fires before every request is sent, while `options.body` is still a plain JS object (not yet JSON-encoded). The override reads the latest snapshot from SQLite (sub-millisecond), filters it by the adaptive section config, and injects it into `options.body.system` as a structured plain-text block.

**Layer 3: Adaptive System Prompt Manager** — Every query through `OneCallAnthropic` is optionally logged (via `queryLogger` callback) and classified into `calendar | email | tasks | general` using keyword heuristics. The `computeAdaptiveStats()` function computes per-section relevance from specific-category queries only (`general` is excluded from the denominator so it doesn't inflate scores). Sections below 15% relevance are surfaced as suggestions. `setAdaptiveSection()` writes the config to SQLite; `readAdaptiveConfig()` is called on every request to filter the snapshot before formatting.

**Layer 4: HTTP API + React dashboard** — An Express server runs on port 3000 and serves the Vite + React frontend from `web/dist/`. The dashboard handles first-run setup (credential entry + Google OAuth), shows snapshot and sync status, a live Trace panel (POST /api/trace), and the Adaptive Optimization card.

State delivery is exclusively through harness injection — never tool calls.

---

### Repository Structure

```
onecall/
├── harness/                   # @onecall/harness — SDK subclass + shared types
│   ├── src/
│   │   ├── index.ts           # Package entry point (re-exports)
│   │   ├── client.ts          # OneCallAnthropic — prepareOptions, filterSnapshot, formatSnapshot
│   │   └── types.ts           # WorkStateSnapshot and all sub-interfaces
│   ├── package.json
│   └── tsconfig.json
├── server/                    # Background sync server + Express API
│   ├── src/
│   │   ├── main.ts            # Entrypoint: initSchema + startScheduler + HTTP server
│   │   ├── env.ts             # Loads .env relative to server root
│   │   ├── api/
│   │   │   ├── server.ts      # Express HTTP server — all /api/* routes + SPA fallback
│   │   │   ├── config.ts      # Credential validation + .env writing
│   │   │   └── setup.ts       # (legacy) server-rendered HTML setup page
│   │   ├── sync/
│   │   │   ├── scheduler.ts   # node-cron polling loop + ensureFreshSnapshot()
│   │   │   └── syncAll.ts     # Orchestrates a full sync across all providers
│   │   ├── providers/
│   │   │   ├── types.ts       # TaskProvider interface
│   │   │   ├── gmail.ts       # Gmail API integration
│   │   │   ├── calendar.ts    # Google Calendar API integration
│   │   │   └── notion.ts      # Notion API integration
│   │   ├── db/
│   │   │   ├── client.ts      # better-sqlite3 singleton
│   │   │   ├── schema.ts      # Table definitions + migrations
│   │   │   ├── snapshot.ts    # Read/write WorkStateSnapshot + sync log
│   │   │   ├── queryLog.ts    # logQuery(), classifyQuery(), readRecentQueries()
│   │   │   └── adaptiveConfig.ts  # readAdaptiveConfig(), setAdaptiveSection()
│   │   ├── analytics/
│   │   │   └── suggestions.ts # computeAdaptiveStats() — relevance scoring + suggestions
│   │   ├── trace/
│   │   │   ├── agents.ts      # runWithoutOneCall + runWithOneCall (live API calls)
│   │   │   └── runner.ts      # runTraceComparison() → TraceResult for /api/trace
│   │   └── auth/
│   │       └── google.ts      # OAuth2: getOAuthUrl, exchangeCodeForTokens, getAuthenticatedClient
│   ├── package.json
│   └── tsconfig.json
├── web/                       # Vite + React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx            # Checks /api/status → routes to Setup or Trace page
│   │   ├── api.ts             # Typed fetch wrappers for all /api/* endpoints
│   │   └── pages/
│   │       ├── Setup.tsx      # Credential entry + Google OAuth connect
│   │       └── Trace.tsx      # Side-by-side live trace runner
│   ├── vite.config.ts         # Dev proxy: /api/* and /oauth2callback → localhost:3000
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
├── demo/
│   ├── data/mock.ts           # Static WorkStateSnapshot + raw provider slices
│   ├── agents/
│   │   ├── without.ts         # Multi-turn agent with raw Gmail/Calendar/Notion tools (mock)
│   │   └── with.ts            # Single-turn agent using OneCallAnthropic (mock snapshot)
│   ├── adaptive-benchmark.ts  # Two-phase adaptive demo: log → analyze → optimize
│   ├── trace.ts               # Single-prompt color-coded side-by-side trace
│   └── benchmark.ts           # Sequential 20-prompt run → metrics table + summary
├── live/                      # Live-data evaluation scripts
│   ├── agents/
│   │   └── with.ts            # Re-exports runWithOneCall from server/src/trace/agents
│   ├── trace.ts               # Thin wrapper → shared/trace.ts
│   └── benchmark.ts           # Thin wrapper → shared/benchmark.ts
├── shared/                    # Logic shared between demo/ and live/
│   ├── trace.ts               # Color-coded terminal trace runner
│   ├── benchmark.ts           # 20-prompt metrics table runner
│   ├── agentLoop.ts           # Generic agentic tool-use loop
│   ├── runWith.ts             # createRunWithOneCall() — accepts queryLogger + configGetter
│   ├── prompts.ts             # 20 representative productivity prompts
│   └── types.ts               # AgentRun + ToolCallRecord types
├── scripts/
│   └── google-auth.ts         # CLI OAuth flow for terminal-only environments
├── .env                       # Credentials (gitignored)
├── .env.example
├── package.json               # Workspace root — orchestration scripts only
└── CLAUDE.md                  # this file
```

---

### The Harness: `harness/src/client.ts`

The centrepiece of the project. `OneCallAnthropic` extends the Anthropic SDK client:

```typescript
export class OneCallAnthropic extends Anthropic {
  constructor(opts: ConstructorParameters<typeof Anthropic>[0] & {
    snapshotGetter: () => WorkStateSnapshot | null | Promise<WorkStateSnapshot | null>;
    configGetter?: () => SectionConfig | null;   // adaptive section enable flags
    queryLogger?: (queryText: string) => void;   // optional query logging callback
  }) { ... }

  protected override async prepareOptions(options: any): Promise<void> {
    // Fires before every POST /v1/messages request.
    // 1. Extracts the last user message text and calls queryLogger (if provided).
    // 2. Reads the snapshot via snapshotGetter.
    // 3. Filters snapshot by configGetter (defaults all sections enabled).
    // 4. Formats and injects into options.body.system.
  }
}
```

Key internal functions in `client.ts`:
- `filterSnapshot(snapshot, config)` — zeroes out disabled sections while keeping the type stable
- `formatSnapshot(snapshot, config)` — renders enabled sections as plain text; omits headers for disabled sections entirely

The `snapshotGetter` parameter:
- **Demo/test:** `snapshotGetter: () => MOCK_SNAPSHOT`
- **Live/production:** `snapshotGetter: () => ensureFreshSnapshot()` (lazy cache in `scheduler.ts`)

The `configGetter` parameter:
- **Demo/test:** omitted (defaults all sections to `true`)
- **Live/production:** `configGetter: readAdaptiveConfig` (reads from SQLite `adaptive_config` table)

The `queryLogger` parameter:
- **Demo/test:** omitted (no logging)
- **Live/production:** `queryLogger: logQuery` (writes to SQLite `query_log` table with classification)

---

### Adaptive System Prompt Manager

#### Query Classification (`server/src/db/queryLog.ts`)

`classifyQuery(text)` uses keyword heuristics to classify each query into one of four categories. Important design decisions:

- Keywords are **strong-signal only** — temporal words like "today", "morning", "standup" are excluded because they appear in queries about any section and would inflate calendar scores
- **Ties resolve to `general`** — if two categories score equally, the query is ambiguous and should not influence section relevance
- **Zero score → `general`** — if no keywords match, the query is not domain-specific

```typescript
const CALENDAR_KEYWORDS = ['meeting', 'schedule', 'calendar', 'am i free', 'free at', 'free block', ...];
const EMAIL_KEYWORDS    = ['email', 'reply', 'replied', 'inbox', 'unread', 'hear back', ...];
const TASKS_KEYWORDS    = ['task', 'todo', 'overdue', 'due today', 'in progress', 'blocking', ...];
// 'general' has no keywords — it's the default for ambiguous queries
```

#### Section Relevance Scoring (`server/src/analytics/suggestions.ts`)

`computeAdaptiveStats()` computes relevance from the last 100 logged queries:

- **Only specific queries (calendar/email/tasks) contribute to relevance scores.** `general` queries are excluded from both the numerator and denominator. This is critical: without this, "What should I focus on?" and "Give me a standup summary" would inflate every section's score, preventing any suggestion from ever firing.
- Relevance = (specific queries needing this section) / (total specific queries)
- Suggestion fires when: `relevance < 0.15` AND `specificTotal >= 5` AND `total >= 5`

#### Database Tables

```sql
CREATE TABLE IF NOT EXISTS query_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  logged_at   TEXT NOT NULL,
  query_text  TEXT NOT NULL,
  category    TEXT NOT NULL  -- 'calendar' | 'email' | 'tasks' | 'general'
);
-- Pruned to last 100 rows on each insert.

CREATE TABLE IF NOT EXISTS adaptive_config (
  section     TEXT PRIMARY KEY,  -- 'calendar' | 'email' | 'tasks'
  enabled     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);
-- Defaults all sections to true when no rows exist (readAdaptiveConfig() handles this).
```

---

### Core Data Type

```typescript
interface WorkStateSnapshot {
  as_of: string; // ISO 8601 timestamp of last sync

  calendar: {
    today: CalendarEvent[];
    free_blocks: TimeBlock[];
    upcoming_deadlines: CalendarEvent[]; // next 7 days with "deadline" or "due" in title
  };

  email: {
    action_required: EmailThread[];   // threads where last message is from someone else, unread
    awaiting_reply: EmailThread[];    // threads where last message is from the user, no reply yet
    unread_count: number;
  };

  tasks: {
    overdue: Task[];
    due_today: Task[];
    in_progress: Task[];
  };

  meta: {
    sync_duration_ms: number;
    sources: Array<'gmail' | 'gcal' | 'notion'>;
    errors: string[]; // non-fatal sync errors per source
  };
}
```

---

### Provider Interface

All task integrations implement this interface, making sources swappable:

```typescript
interface TaskProvider {
  name: 'notion' | 'linear' | 'todoist';
  getTasks(): Promise<{
    overdue: Task[];
    due_today: Task[];
    in_progress: Task[];
  }>;
}
```

For the hackathon, Notion is implemented. The interface ensures Linear and Todoist are drop-in additions.

---

### HTTP API (`server/src/api/server.ts`)

The Express server runs on port 3000 and serves `web/dist/` as the SPA. During development, Vite proxies `/api/*` and `/oauth2callback` to port 3000.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/status` | `{ configured, authenticated, lastSync, lastSyncSuccess }` |
| `GET` | `/api/config` | `{ present, missing }` — which required keys are set (no values exposed) |
| `POST` | `/api/config` | Validate + write credentials to `.env`, apply to `process.env` |
| `GET` | `/api/snapshot` | Latest `WorkStateSnapshot` \| `null` |
| `POST` | `/api/sync` | Trigger immediate sync (fire-and-forget) |
| `GET` | `/api/auth/google` | `{ url }` — Google OAuth initiation URL |
| `POST` | `/api/trace` | `{ prompt }` → `TraceResult` — runs both agents in parallel |
| `GET` | `/api/adaptive/stats` | `AdaptiveStats` — query distribution, relevance scores, suggestions |
| `POST` | `/api/adaptive/apply` | `{ section, enabled }` — writes to `adaptive_config` table |
| `GET` | `/oauth2callback` | Handles Google OAuth redirect, exchanges code for tokens |
| `GET` | `/*` | Serves `web/dist/index.html` (SPA fallback) |

---

### Integrations

#### Gmail (via Google Gmail API)

- Threads modified in the last 48 hours (`q: "newer_than:2d"`)
- `action_required`: last message is inbound (from someone else), thread is unread
- `awaiting_reply`: last message is outbound (from the user), no reply received, sent >4 hours ago
- Auth: OAuth2 with scope `https://www.googleapis.com/auth/gmail.readonly`

#### Google Calendar (via Google Calendar API)

- `calendarId: 'primary'`, events from today and next 7 days
- `upcoming_deadlines[]`: events with "deadline" or "due" in the title
- Free block calculation: working hours (9am–6pm default) minus busy windows, gaps ≥30 min
- Auth: OAuth2 with scope `https://www.googleapis.com/auth/calendar.readonly`

#### Notion (via Notion API)

- Use `client.search({ filter: { value: 'page', property: 'object' } })` — `databases.query` was removed in the current `@notionhq/client` version
- Property extraction is schema-agnostic: iterate all properties and match by `type` (`title`, `date`, `status`, `select`) rather than by name
- Auth: Notion integration token (set in `.env`). The integration must be explicitly connected to the target database via Notion's Connections menu.

---

### Database Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  snapshot    TEXT NOT NULL  -- full WorkStateSnapshot as JSON
);
-- Keep only the last 10 snapshots.

CREATE TABLE IF NOT EXISTS sync_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  success     INTEGER,
  error       TEXT
);

CREATE TABLE IF NOT EXISTS query_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  logged_at   TEXT NOT NULL,
  query_text  TEXT NOT NULL,
  category    TEXT NOT NULL  -- 'calendar' | 'email' | 'tasks' | 'general'
);
-- Keep only the last 100 rows.

CREATE TABLE IF NOT EXISTS adaptive_config (
  section     TEXT PRIMARY KEY,  -- 'calendar' | 'email' | 'tasks'
  enabled     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);
```

---

### Background Sync

`syncAll()` calls each provider in parallel (`Promise.allSettled`), merges results into a `WorkStateSnapshot`, and writes to SQLite. Errors from individual providers are caught and written to `meta.errors` — a Gmail failure should not block calendar data from being saved.

```typescript
// scheduler.ts
cron.schedule('*/15 * * * *', async () => { await syncAll(); });
syncAll(); // run once immediately on startup
```

`ensureFreshSnapshot()` implements lazy caching: returns the in-memory snapshot if it's under 15 minutes old, otherwise triggers a fresh sync. This is used by live agents so they don't wait for a sync that hasn't run yet.

---

### Auth Setup

Google OAuth2 flow:
1. Frontend calls `GET /api/auth/google` to get the OAuth consent URL
2. Frontend redirects the browser to that URL
3. User grants access; Google redirects to `GET /oauth2callback` on the backend
4. Backend exchanges the auth code for tokens, persists to `tokens.json`, redirects browser to `/`
5. On subsequent runs, `getAuthenticatedClient()` loads the token and refreshes automatically if expired

Scopes: `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/calendar.readonly`

---

### Environment Variables

```bash
# .env.example

# Anthropic (required for demo scripts and /api/trace)
ANTHROPIC_API_KEY=

# Google OAuth2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback

# Notion
NOTION_TOKEN=
NOTION_DATABASE_ID=

# Sync config
SYNC_INTERVAL_MINUTES=15
WORK_DAY_START=09:00
WORK_DAY_END=18:00

# Server
PORT=3000
```

---

### package.json Layout

The project uses **npm workspaces** with three packages (`harness`, `server`, `web`). The root `package.json` is the workspace root and provides orchestration scripts:

```json
{
  "workspaces": ["harness", "server", "web"],
  "scripts": {
    "build": "npm run build -w harness && npm run build -w server && npm run build -w web",
    "start": "npm start -w server",
    "dev": "npm run dev -w server",
    "dev:web": "npm run dev -w web",
    "demo:trace": "npm run build:harness && tsx demo/trace.ts",
    "demo:benchmark": "npm run build:harness && tsx demo/benchmark.ts",
    "demo:adaptive": "npm run build:harness && npm run build:server && tsx demo/adaptive-benchmark.ts",
    "live:trace": "npm run build:harness && tsx live/trace.ts",
    "live:benchmark": "npm run build:harness && tsx live/benchmark.ts"
  }
}
```

---

## Demo Directory

`demo/` contains evaluation scripts that call the Claude API directly using `@anthropic-ai/sdk`:

```
demo/
├── data/mock.ts              # Static WorkStateSnapshot + raw provider slices
├── agents/
│   ├── without.ts            # Multi-turn agent with 4 raw tools (mock responses)
│   └── with.ts               # Single-turn agent using OneCallAnthropic (mock snapshot)
├── adaptive-benchmark.ts     # Two-phase adaptive demo (see below)
├── trace.ts                  # Single-prompt color-coded side-by-side trace
└── benchmark.ts              # Sequential 20-prompt run → metrics table + summary
```

**Running the demo:**
```bash
npm run demo:trace              # default prompt, real-time color trace
npm run demo:trace -- p04       # specific prompt by ID
npm run demo:benchmark          # all 20 prompts, sequential to avoid rate limits
npm run demo:adaptive           # adaptive optimization two-phase demo
```

### Adaptive benchmark (`demo/adaptive-benchmark.ts`)

Self-contained two-phase demo — no server or SQLite needed, runs entirely in memory with mock data:

1. Runs 15 prompts (calendar/task-heavy, 1 email query) with all sections enabled. Classifies each query in memory.
2. Computes section relevance from specific-category queries only. Email scores ~8% → below 15% threshold → suggestion fires.
3. Runs same 15 prompts with email section disabled. Token count drops.
4. Prints side-by-side table and final reduction %.

---

## Demo Script (for judges)

**Story 1 — Zero tool calls:**
- Without OneCall: ask Claude *"What should I focus on right now?"* → show 5 tool calls, 3 LLM turns, ~20s
- With OneCall: same question → 0 tool calls, 1 LLM turn, ~6s, context already in system prompt
- Punchline: "We didn't give Claude a better tool. We changed what Claude knows before it starts thinking."

**Story 2 — Adaptive optimization:**
- Run `demo:adaptive` → Phase 1 shows all-sections baseline tokens
- Analysis panel: "email section only relevant for 8% of queries"
- Phase 2 shows ~20% fewer tokens
- Punchline: "The system learned your workflow. Same answers, leaner prompt."

---

## What NOT to Build

- Do not implement write operations (creating tasks, sending emails) — read-only scope keeps auth simple and demo safe
- Do not try to support every task manager — Notion is sufficient; the `TaskProvider` interface signals extensibility
- Do not implement semantic search or vector embeddings — the snapshot is intentionally structured, not a RAG system
- Do not add a tool-call flow back to the "with" agent — the entire point is zero tool calls
- Do not add autonomous config mutation — the adaptive system is always suggest + confirm
- Do not add tool-based context retrieval — state delivery is through harness injection only

---

## Coding

It is critical that your changes will not pile up over time and make the codebase "slop" and completely unreadable and unmanageable. So before you make any changes, first take a step back and think. Is your current approach the cleanest, minimally invasive way to implement the change? Does it elegantly fit into the existing code structure and style? If not, can you refactor the codebase to accommodate your change in a clean way, but first tell me about your proposed refactor and get my approval before you start refactoring.

When writing code, ensure to follow existing code style and conventions used in the codebase. This includes:
- Using clear and descriptive variable and function names
- Writing modular code with functions/classes that have a single responsibility
- Adding docstrings to all functions and classes that explain their purpose, arguments, return values, and any important notes
- Adding comments to explain non-obvious implementation details or decisions
- Specifying tensor sizes in comments where relevant for clarity
