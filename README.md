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

1. **Background sync** — polls Gmail, Google Calendar, and Notion via REST APIs (no LLM involved), distills results into a `WorkStateSnapshot`, and persists to SQLite. Uses lazy caching: syncs only fire when the snapshot is requested and the cache is stale (>15 min).

2. **Harness injection** — `OneCallAnthropic` subclasses the Anthropic SDK and overrides `prepareOptions()`. On every `messages.create()` call, it reads the latest snapshot (sub-millisecond) and splices it into the system prompt. The calling code passes no tools and no system prompt; injection is invisible.

3. **Setup page** — a lightweight server-rendered HTML page at `http://localhost:3000/setup` handles credential entry (Google OAuth, Notion token) and shows sync status.

```typescript
import { OneCallAnthropic } from '@onecall/harness';

const client = new OneCallAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  snapshotGetter: readLatestSnapshot, // or () => MOCK_SNAPSHOT for demo
});

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What should I focus on right now?' }],
});
```

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

Open `http://localhost:3000/setup` in your browser. Enter credentials section by section — each saves independently.

| Credential | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (Web application). Set redirect URI to `http://localhost:3000/oauth2callback`. Enable Gmail API and Google Calendar API. Add your email as a test user under OAuth consent screen. |
| `NOTION_TOKEN` | [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration → Internal Integration Secret. Share your task database with the integration via the database's Connections menu. |
| `NOTION_DATABASE_ID` | 32-char hex ID from your Notion task database URL (between the last `/` and `?`) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys. Only needed for demo/live benchmark scripts. |

### 4. Connect Google

On the setup page, click **Connect Google Account** after saving your Google credentials. After approving the OAuth consent screen, tokens are saved automatically.

CLI alternative: `npm run auth:google`

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
```

The `live/` directory runs the same scripts against **real APIs** (requires credentials + `npm start` first).

```bash
npm run live:trace -- --prompt "What should I focus on today?"
npm run live:benchmark
```

---

## Development

```bash
npm run dev    # server in watch mode
```

---

## Built at LA Hacks 2026

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.
