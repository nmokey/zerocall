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
3. It distills the raw API responses into a clean `WorkStateSnapshot`
4. The snapshot is persisted to a local SQLite database
5. When your agent asks `get_work_state()`, it reads from SQLite — no network round-trips

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

Fill in your credentials:

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials |
| `NOTION_TOKEN` | Notion Settings → Integrations → New integration |
| `NOTION_DATABASE_ID` | The ID from your Notion task database URL |

### 3. Authenticate with Google

On first run, OneCall opens a browser window for the Google OAuth consent flow. Grant access to Gmail and Calendar (read-only). Your tokens are saved locally to `tokens.json` and refreshed automatically.

### 4. Build and run

```bash
npm run build
npm start
```

Or in dev mode (no build step):

```bash
npm run dev
```

### 5. Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

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

Restart Claude Desktop. The `get_work_state` tool will appear automatically.

---

## MCP Tools

### `get_work_state()`

Returns a pre-computed snapshot of your current work context. No arguments.

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

- **Gmail** — classifies threads into action-required vs. awaiting-reply
- **Google Calendar** — today's events, free blocks ≥30 min, upcoming deadlines
- **Notion** — tasks by status (overdue, due today, in progress)

The `TaskProvider` interface makes Linear and Todoist drop-in additions.

---

## Built at LA Hacks 2026

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.
