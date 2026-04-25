# OneCall — Claude Code Agent System Prompt

You are a senior TypeScript engineer working on **OneCall**, a hackathon project for LA Hacks 2026. This document is your complete specification — read it fully before writing a single line of code.

---

## Hackathon Context

**Event:** LA Hacks 2026
**Challenge tracks this project targets:**

1. **Flicker to Flow (presented by Figma)** — Focus on enhancing how we work, play, and connect. Automate mundane chores, organize chaotic schedules, transform friction into function.

2. **Cognition — "Augment the Agent" (company track)** — AI agents are getting powerful but still hit real limits. Build a tool, integration, or product that makes AI agents measurably more capable, or removes the friction and toil they can't yet handle on their own. Cognition is specifically looking for: better verification for AI outputs, smarter context retrieval, agent integrations & extensions, human–AI collaboration tooling, eliminating professional toil. They want something a real team would actually use — practical, high-impact, grounded in real workflows.

**Judging criteria lens:** Judges want a clear before/after story with a measurable metric. Ours is: *100% reduction in tool calls, ~67% reduction in LLM turns, ~67% faster response time.*

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

---

## Technical Architecture

### Overview

OneCall has three layers:

**Layer 1: Background sync** — A node-cron loop that polls Gmail, Google Calendar, and Notion every 15 minutes, distills raw API responses into a clean `WorkStateSnapshot`, and persists it to a local SQLite database.

**Layer 2: Harness injection** — `OneCallAnthropic` subclasses the Anthropic SDK `Anthropic` class and overrides the `prepareOptions(options)` lifecycle hook. This hook fires before every request is sent, while `options.body` is still a plain JS object (not yet JSON-encoded). The override reads the latest snapshot from SQLite (sub-millisecond) and injects it into `options.body.system` as a structured plain-text block.

**Layer 3: HTTP API + dashboard** — An Express server exposes a REST API on port 3000. A Vite + React frontend (in `web/`) connects to it. The dashboard handles first-run setup (credential entry + Google OAuth), shows the current snapshot, and lets users trigger a manual sync.

State delivery is exclusively through harness injection.

---

### Repository Structure

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
│   │   ├── main.ts            # Entrypoint: initSchema + startScheduler + HTTP server
│   │   ├── api/
│   │   │   ├── server.ts      # Express HTTP server — all /api/* routes + /oauth2callback
│   │   │   └── config.ts      # Credential validation + .env writing
│   │   ├── sync/
│   │   │   ├── scheduler.ts   # node-cron polling loop
│   │   │   ├── syncAll.ts     # Orchestrates a full sync across all providers
│   │   │   └── webhooks.ts    # Optional: Gmail push notification handler
│   │   ├── providers/
│   │   │   ├── types.ts       # TaskProvider interface
│   │   │   ├── gmail.ts       # Gmail API integration
│   │   │   ├── calendar.ts    # Google Calendar API integration
│   │   │   └── notion.ts      # Notion API integration
│   │   ├── db/
│   │   │   ├── client.ts      # better-sqlite3 singleton
│   │   │   ├── schema.ts      # Table definitions + migrations
│   │   │   └── snapshot.ts    # Read/write WorkStateSnapshot + sync log
│   │   └── auth/
│   │       └── google.ts      # OAuth2: getOAuthUrl, exchangeCodeForTokens, getAuthenticatedClient
│   ├── package.json
│   └── tsconfig.json
├── web/                       # Vite + React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx            # Checks /api/status → routes to Setup or Dashboard
│   │   ├── api.ts             # Typed fetch wrappers for all /api/* endpoints
│   │   └── pages/
│   │       ├── Setup.tsx      # Two-step: credential form → Google OAuth
│   │       └── Dashboard.tsx  # Snapshot view + sync status + Sync Now button
│   ├── vite.config.ts         # Dev proxy: /api/* and /oauth2callback → localhost:3000
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
├── demo/
│   ├── data/mock.ts           # Static WorkStateSnapshot + raw provider slices
│   ├── agents/
│   │   ├── without.ts         # Multi-turn agent with raw Gmail/Calendar/Notion tools
│   │   └── with.ts            # Single-turn agent using OneCallAnthropic (0 tools)
│   ├── prompts.ts             # 20 representative productivity prompts
│   ├── trace.ts               # Single-prompt color-coded side-by-side trace
│   └── benchmark.ts           # Sequential 20-prompt run → metrics table + summary
├── live/                      # Live-data evaluation scripts
├── wiki/                      # Project documentation
├── .env.example
├── .gitignore
├── package.json               # Workspace root
├── README.md
└── CLAUDE.md                  # this file
```

---

### The Harness: `harness/src/client.ts`

The centrepiece of the project. `OneCallAnthropic` extends the Anthropic SDK client:

```typescript
export class OneCallAnthropic extends Anthropic {
  constructor(opts: ConstructorParameters<typeof Anthropic>[0] & {
    snapshotGetter: () => WorkStateSnapshot | null;
  }) { ... }

  protected override async prepareOptions(options: any): Promise<void> {
    // Fires before every request, while options.body is still a plain JS object.
    // Scoped to POST /v1/messages only.
    // Injects the snapshot into options.body.system.
  }
}
```

The `snapshotGetter` parameter is injected at construction time:
- **Demo/test:** `snapshotGetter: () => MOCK_SNAPSHOT`
- **Production:** `snapshotGetter: readLatestSnapshot` (from `server/src/db/snapshot.ts`)

`formatSnapshot()` renders the `WorkStateSnapshot` as structured plain text — more token-efficient than JSON and readable in demo terminal output.

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

The Express server runs on port 3000. In production it also serves `web/dist/` as static files. During development, Vite proxies `/api/*` and `/oauth2callback` to port 3000.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/status` | `{ configured, authenticated, lastSync, lastSyncSuccess }` |
| `GET` | `/api/config` | `{ present, missing }` — which required keys are set (no values exposed) |
| `POST` | `/api/config` | Validate + write credentials to `.env`, apply to `process.env` |
| `GET` | `/api/snapshot` | Latest `WorkStateSnapshot` \| `null` |
| `POST` | `/api/sync` | Trigger immediate sync (fire-and-forget) |
| `GET` | `/api/auth/google` | `{ url }` — Google OAuth initiation URL |
| `GET` | `/oauth2callback` | Handles Google OAuth redirect, exchanges code for tokens, redirects to `/` |
| `GET` | `/*` | Serves `web/dist/index.html` (production only) |

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

CREATE TABLE IF NOT EXISTS sync_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  success     INTEGER,
  error       TEXT
);
```

Keep only the last 10 snapshots. `readLatestSnapshot()` reads `SELECT snapshot FROM snapshots ORDER BY id DESC LIMIT 1`. `readLastSyncLog()` reads the most recent sync_log row for the `/api/status` endpoint.

---

### Background Sync

`syncAll()` calls each provider in parallel (`Promise.allSettled`), merges results into a `WorkStateSnapshot`, and writes to SQLite. Errors from individual providers are caught and written to `meta.errors` — a Gmail failure should not block calendar data from being saved.

```typescript
// scheduler.ts
cron.schedule('*/15 * * * *', async () => { await syncAll(); });
syncAll(); // run once immediately on startup
```

---

### Auth Setup

Google OAuth2 flow (handled by the backend + frontend together):
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

# Anthropic (required for demo scripts)
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
    "demo:trace": "tsx demo/trace.ts",
    "demo:benchmark": "tsx demo/benchmark.ts",
    "live:trace": "tsx live/trace.ts",
    "live:benchmark": "tsx live/benchmark.ts"
  }
}
```

Server dependencies (`server/package.json`) include Express, SQLite, Google APIs, Notion, and `@onecall/harness`.

---

## Demo Directory

`demo/` contains two evaluation scripts that call the Claude API directly using `@anthropic-ai/sdk`:

```
demo/
├── data/mock.ts       # Static WorkStateSnapshot + raw provider slices (realistic UCLA research context)
├── agents/
│   ├── without.ts     # Multi-turn agent with 4 raw tools: gmail_search_threads, gmail_get_thread,
│   │                  #   calendar_list_events, notion_query_database
│   └── with.ts        # Single-turn agent using OneCallAnthropic — 0 tools, context pre-injected
├── prompts.ts         # 20 representative productivity prompts
├── trace.ts           # Single-prompt color-coded side-by-side trace
└── benchmark.ts       # Sequential 20-prompt run → metrics table + summary
```

**Running the demo:**
```bash
npm run demo:trace              # default prompt, real-time color trace
npm run demo:trace -- p04       # specific prompt by ID
npm run demo:benchmark          # all 20 prompts, sequential to avoid rate limits
```

**Current evaluation status:** Both scripts use mocked data from `demo/data/mock.ts`. The "without" agent's tool handlers return static mock responses; the "with" agent's `snapshotGetter` returns `MOCK_SNAPSHOT`. The evaluation measures tool call count, LLM turn count, latency, and token usage — not end-to-end correctness against live data.

**Observed results (single prompt):**
- Tool calls: 5 → 0 (100% fewer)
- LLM turns: 3 → 1 (67% fewer)
- Latency: ~67% faster
- Tokens: ~88% fewer

**Token note:** The "with" agent delivers all context in the system prompt up front. This results in dramatically fewer tokens than the "without" agent, which makes multiple round-trips accumulating context. Token reduction is a strong positive metric for this approach.

---

## Demo Script (for judges)

**Without OneCall:**
- Ask Claude: *"What should I focus on right now?"*
- Show tool call trace: 5+ calls across Gmail, Calendar, Notion; 3+ LLM turns
- Record total latency

**With OneCall:**
- Same question, using `OneCallAnthropic`
- Show: no tool calls, 1 LLM turn, work context already in system prompt
- Record total latency

**The punchline:** "We didn't give Claude a better tool. We changed what Claude knows before it starts thinking."

---

## What NOT to Build

- Do not implement write operations (creating tasks, sending emails) — read-only scope keeps auth simple and demo safe
- Do not try to support every task manager — Notion is sufficient for the demo; the `TaskProvider` interface signals extensibility
- Do not implement semantic search or vector embeddings — the snapshot is intentionally structured, not a RAG system
- Do not add a tool-call flow back to the "with" agent — the entire point is zero tool calls
- Do not add tool-based context retrieval — state delivery is through harness injection only

---

## Coding

It is critical that your changes will not pile up overtime and make the codebase "slop" and completely unreadable and unmanageable. So before you make any changes, first take a step back and think. Is your current approach the cleanest, minimally invasive way to implement the change? Does it elegantly fit into the existing code structure and style? If not, can you refactor the codebase to accommodate your change in a clean way, but first tell me about your proposed refactor and get my approval before you start refactoring.

When writing code, ensure to follow existing code style and conventions used in the codebase. This includes:
- Using clear and descriptive variable and function names
- Writing modular code with functions/classes that have a single responsibility
- Adding docstrings to all functions and classes that explain their purpose, arguments, return values, and any important notes
- Adding comments to explain non-obvious implementation details or decisions
- Specifying tensor sizes in comments where relevant for clarity
