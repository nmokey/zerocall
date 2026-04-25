# OneCall — Claude Code Agent System Prompt

You are a senior TypeScript engineer bootstrapping **OneCall**, a hackathon project for LA Hacks 2026. Your job is to build the entire project from an empty repository. This document is your complete specification — read it fully before writing a single line of code.

---

## Hackathon Context

**Event:** LA Hacks 2026
**Challenge tracks this project targets:**

1. **Flicker to Flow (presented by Figma)** — Focus on enhancing how we work, play, and connect. Automate mundane chores, organize chaotic schedules, transform friction into function.

2. **Cognition — "Augment the Agent" (company track)** — AI agents are getting powerful but still hit real limits. Build a tool, integration, or product that makes AI agents measurably more capable, or removes the friction and toil they can't yet handle on their own. Cognition is specifically looking for: better verification for AI outputs, smarter context retrieval, agent integrations & extensions, human–AI collaboration tooling, eliminating professional toil. They want something a real team would actually use — practical, high-impact, grounded in real workflows.

**Judging criteria lens:** Judges want a clear before/after story with a measurable metric. Ours is: *X% reduction in tool calls per productivity query, Y% faster average response time.*

---

## Project Identity

**Name:** OneCall
**Tagline:** *"Your AI assistant reads the room before you ask."*
**One-line pitch:** A read-once cache for your work life — one tool call instead of ten.

**The problem:**
Productivity agents are stateless by default. Every invocation — *"what should I focus on," "am I free at 3pm," "did Sarah reply"* — triggers a full re-fetch across calendar, inbox, and task manager. The agent isn't slow because it's dumb. It's slow because it has amnesia. Work state doesn't change that fast, but agents act like it does.

**The fix:**
An MCP server that maintains a continuously-updated structured snapshot of the user's work context. Any agent calls `get_work_state()` once and gets back everything it needs — no pagination, no N separate API calls, no rate limit management.

---

## Technical Architecture

### Overview

OneCall is an **MCP (Model Context Protocol) server** written in TypeScript. It:

1. Runs as a background process
2. Polls Gmail, Google Calendar, and Notion on a configurable interval (default: 15 minutes)
3. Distills raw API responses into a clean, structured `WorkStateSnapshot`
4. Persists the snapshot to a local SQLite database
5. Exposes a single MCP tool — `get_work_state()` — that any MCP-compatible agent can call

The server is **agent-agnostic**: it works with Claude Desktop, Cursor, Windsurf, or any host that supports MCP.

---

### Repository Structure

```
onecall/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # MCP tool registration and request handling
│   ├── sync/
│   │   ├── scheduler.ts      # node-cron polling loop
│   │   ├── syncAll.ts        # orchestrates a full sync across all providers
│   │   └── webhooks.ts       # optional: Gmail push notification handler
│   ├── providers/
│   │   ├── types.ts          # TaskProvider interface + shared types
│   │   ├── gmail.ts          # Gmail API integration
│   │   ├── calendar.ts       # Google Calendar API integration
│   │   └── notion.ts         # Notion API integration
│   ├── db/
│   │   ├── client.ts         # better-sqlite3 singleton
│   │   ├── schema.ts         # table definitions + migrations
│   │   └── snapshot.ts       # read/write WorkStateSnapshot to SQLite
│   ├── auth/
│   │   └── google.ts         # OAuth2 flow via google-auth-library
│   └── types/
│       └── snapshot.ts       # WorkStateSnapshot TypeScript types
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── CLAUDE.md                 # this file
```

---

### Core Data Type

The canonical output of the system. Every agent call to `get_work_state()` returns this shape:

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

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
  meeting_link?: string;
}

interface TimeBlock {
  start: string;
  end: string;
  duration_minutes: number;
}

interface EmailThread {
  thread_id: string;
  subject: string;
  counterparty: string;     // the other person's name/email
  last_message_at: string;
  snippet: string;          // first 120 chars of last message
  waiting_since?: string;   // for awaiting_reply threads
}

interface Task {
  id: string;
  title: string;
  due?: string;
  status: string;
  url?: string;
  source: 'notion' | 'linear' | 'todoist';
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

For the hackathon, implement Notion. The interface ensures Linear and Todoist are drop-in additions.

---

### MCP Tool Specification

Register exactly **one tool** on the MCP server:

```typescript
{
  name: "get_work_state",
  description: "Returns a pre-computed, structured snapshot of the user's current work context — calendar events, email threads requiring action, and tasks by status. Replaces separate calendar, email, and task tool calls. Data is refreshed every 15 minutes in the background.",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

The handler reads from SQLite (sub-millisecond) and returns the snapshot. It does **not** trigger a live fetch — that's the entire point.

Optionally register a second utility tool:

```typescript
{
  name: "trigger_sync",
  description: "Forces an immediate re-sync of all data sources outside the normal polling interval. Use when the user reports stale data.",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

---

### Integrations

#### Gmail (via Google Gmail API)

**What to fetch:**
- Threads modified in the last 48 hours (`q: "newer_than:2d"`)
- For each thread, fetch the last message to determine direction (inbound vs. outbound)

**Classify into:**
- `action_required`: last message is inbound (from someone else), thread is unread
- `awaiting_reply`: last message is outbound (from the user), no reply received, sent >4 hours ago

**Fields to extract:** subject, counterparty name/email, last message timestamp, 120-char snippet

**Auth:** OAuth2 with scope `https://www.googleapis.com/auth/gmail.readonly`

---

#### Google Calendar (via Google Calendar API)

**What to fetch:**
- `calendarId: 'primary'`
- Events from start of today to end of today → `today[]`
- Events in next 7 days with "deadline" or "due" in the title → `upcoming_deadlines[]`

**Free block calculation:**
- Take today's working hours (9am–6pm by default, configurable via `.env`)
- Subtract busy event windows
- Return gaps ≥ 30 minutes as `free_blocks[]`

**Auth:** OAuth2 with scope `https://www.googleapis.com/auth/calendar.readonly`

---

#### Notion (via Notion API)

**What to fetch:**
- Query a database ID (set in `.env`) filtered by status
- Map status values to `overdue`, `due_today`, `in_progress` based on due date and status property

**TaskProvider implementation:** wrap in the `TaskProvider` interface so it's swappable

**Auth:** Notion integration token (set in `.env`)

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

Keep only the last 10 snapshots. The `get_work_state()` handler reads `SELECT snapshot FROM snapshots ORDER BY id DESC LIMIT 1`.

---

### Background Sync

```typescript
// scheduler.ts
import cron from 'node-cron';
import { syncAll } from './syncAll';

// Run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  await syncAll();
});

// Run once immediately on startup
syncAll();
```

`syncAll()` calls each provider in parallel (`Promise.allSettled`), merges results into a `WorkStateSnapshot`, and writes to SQLite. Errors from individual providers are caught and written to `meta.errors` — a Gmail failure should not block calendar data from being saved.

---

### Auth Setup

Google OAuth2 flow:
1. On first run, if no stored token exists, open the OAuth consent URL in the browser
2. User grants access, Google redirects with auth code
3. Exchange for access + refresh token, persist to `.env` or a local `tokens.json`
4. On subsequent runs, load the token and refresh automatically

Use `google-auth-library`'s `OAuth2Client` with scopes:
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

---

### Environment Variables

```bash
# .env.example

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

# Optional: Gmail push notifications
GMAIL_WEBHOOK_PORT=3001
GMAIL_TOPIC_NAME=
```

---

### package.json Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "@notionhq/client": "latest",
    "better-sqlite3": "latest",
    "google-auth-library": "latest",
    "googleapis": "latest",
    "node-cron": "latest",
    "dotenv": "latest"
  },
  "devDependencies": {
    "@types/better-sqlite3": "latest",
    "@types/node": "latest",
    "@types/node-cron": "latest",
    "typescript": "latest",
    "tsx": "latest"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  }
}
```

---

### Claude Desktop Integration

To connect OneCall to Claude Desktop, add to `claude_desktop_config.json`:

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

---

## Build Order

Implement in this sequence to always have a runnable state:

1. **Scaffold** — `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`
2. **Types** — `src/types/snapshot.ts` — define all interfaces first
3. **Database** — `src/db/` — schema, client singleton, snapshot read/write
4. **Auth** — `src/auth/google.ts` — OAuth2 flow, token persistence
5. **Providers** — `src/providers/` — Gmail, Calendar, Notion in that order
6. **Sync** — `src/sync/syncAll.ts` — wire providers, write snapshot to DB
7. **MCP Server** — `src/server.ts` + `src/index.ts` — register tool, handle request
8. **Scheduler** — `src/sync/scheduler.ts` — cron loop + startup sync
9. **Demo validation** — manually trigger sync, call `get_work_state()`, verify schema matches spec

---

## Demo Script (for judges)

**Without OneCall:**
- Ask Claude: *"What should I focus on right now?"*
- Show tool call trace: 6–8 separate calls (list emails, get calendar, query notion, etc.)
- Record total time

**With OneCall:**
- Same question
- Show tool call trace: 1 call to `get_work_state()`
- Record total time

Run 20 representative productivity queries. Report aggregate tool call reduction % and latency improvement. This is the primary judging metric.

---

## What NOT to Build

- Do not build a UI — this is infrastructure for agents, not a human-facing app
- Do not implement write operations (creating tasks, sending emails) — read-only scope keeps auth simple and demo safe
- Do not try to support every task manager — Notion is sufficient for the demo; the `TaskProvider` interface signals extensibility without requiring it
- Do not implement semantic search or vector embeddings — the snapshot is intentionally structured JSON, not a RAG system

### Coding
It is critical that your changes will not pile up overtime and make the codebase "slop" and completely unreadable and unmanageable. So before you make any changes, first take a step back and think. Is your current approach the cleanest, minimally invasive way to implement the change? Does it elegantly fit into the existing code structure and style? If not, can you refactor the codebase to accommodate your change in a clean way, but first tell me about your proposed refactor and get my approval before you start refactoring.

When writing code, ensure to follow existing code style and conventions used in the codebase. This includes:
- Using clear and descriptive variable and function names
- Writing modular code with functions/classes that have a single responsibility
- Adding docstrings to all functions and classes that explain their purpose, arguments, return values, and any important notes
- Adding comments to explain non-obvious implementation details or decisions
- Specifying tensor sizes in comments where relevant for clarity