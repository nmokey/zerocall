# ZeroCall
![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-D97757?logo=anthropic)
![Railway](https://img.shields.io/badge/Railway-deployed-brightgreen?logo=railway)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)

**Your AI assistant reads the room before you ask.**

Zero tool calls. One LLM turn. Context already there.

Try it live: **[zerocall.nmokey.com](https://zerocall.nmokey.com)**

---

## The Problem

Productivity agents are stateless by default. Every query — *"what should I focus on," "am I free at 3pm," "did Sarah reply"* — triggers a full re-fetch across your calendar, inbox, and task manager. The agent isn't slow because it's dumb. It's slow because it has amnesia.

Work state doesn't change that fast, but agents act like it does.

## The Fix

ZeroCall is an **agent harness** that intercepts every outgoing LLM request and injects a pre-synced `WorkStateSnapshot` directly into the system prompt — before Claude's first token. No tool calls. No model-driven retrieval. The context is already there.

**Before ZeroCall:** 5+ tool calls, 3+ LLM turns, ~20 seconds per productivity query  
**After ZeroCall:** 0 tool calls, 1 LLM turn, ~6 seconds — and ~89% fewer tokens

The key insight: we didn't give Claude a better tool. We changed what Claude knows before it starts thinking.

---

## How It Works

### Layer 1: Lazy cache on demand

The system uses a lazy cache that is triggered by user prompts. It fetches data from Gmail, Google Calendar, Notion, and Slack, and distills raw API responses into a clean `WorkStateSnapshot`, caching it in a local SQLite database. The cache only repopulates when the stored info is deemed old.

### Layer 2: Harness-level injection

`ZeroCallAnthropic` subclasses the Anthropic SDK client and overrides `prepareOptions()` — a lifecycle hook that fires before every request is sent. On every `messages.create()` call, it reads the latest snapshot from SQLite (sub-millisecond) and splices it into the `system` prompt as a compact plain-text block. The calling code passes no tools and no system prompt; injection is invisible.

```typescript
import { ZeroCallAnthropic } from '@zerocall/harness';

const client = new ZeroCallAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  snapshotGetter: readLatestSnapshot,
});

// No tools. No system prompt. The harness injects the full work context.
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What should I focus on right now?' }],
});
```

### Layer 3: Adaptive System Prompt Manager

ZeroCall observes your query patterns and learns which snapshot sections you actually need. After enough queries, it surfaces suggestions like "you almost never ask about email — disable that section and save ~180 tokens per query." One click applies the optimization; the next request gets a leaner system prompt with no behavior change for the sections that matter.

Classification is purely lexical — no extra LLM call. The suggestion engine computes per-section relevance from your query history and flags sections below 15% relevance.

### Layer 4: React dashboard + live trace

The server serves a Vite + React frontend with light/dark mode (toggle in the bottom-left corner). It handles first-run credential setup (Google OAuth, Notion token), shows the current snapshot and sync status, and hosts a **live trace runner**: type any productivity prompt and watch both agents run in parallel — the ZeroCall agent's response pops in immediately while the raw-tool agent's tool calls stream in one by one in real time. Results are displayed as a side-by-side comparison with raw metric counts (tool calls, LLM turns saved) and percentage reductions for latency and tokens.

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

Open `http://localhost:3000` in your browser. Enter credentials in the Setup page.

| Credential | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID (Web application). Set redirect URI to `http://localhost:3000/oauth2callback`. Enable Gmail API and Google Calendar API. Add your email as a test user under OAuth consent screen → Test users. |
| `NOTION_TOKEN` | [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → New integration → Internal Integration Secret. Share your task database with the integration via the database's Connections menu. |
| `NOTION_DATABASE_ID` | 32-char hex ID from your Notion task database URL (between the last `/` and `?`). The Notion SDK's `client.request()` is broken in v5 — ZeroCall uses `fetch` directly against the REST API instead. |
| `SLACK_USER_TOKEN` | [api.slack.com/apps](https://api.slack.com/apps) → Create New App → OAuth & Permissions → User Token Scopes. Add `im:read`, `im:history`, `mpim:read`, `mpim:history`, `users:read`. Install App to Workspace and copy the User OAuth Token. |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |

### 4. Connect Google

On the setup page, click **Authorize →** next to Google. After approving the OAuth consent screen, tokens are saved automatically.

### 5. Sync and trace

Click **Sync now** on the Setup page, then navigate to **Trace** and run any productivity prompt.

---

## Development

```bash
npm run dev        # server in watch/reload mode (port 3000)
npm run dev:frontend-demo    # Vite dev server with HMR at localhost:5173 (proxies /api/* to port 3000)
```

Run both simultaneously and open `http://localhost:5173`.

---

## Integrations

- **Gmail** — classifies threads into `action_required` (inbound + unread) and `awaiting_reply` (outbound, sent >4h ago, no reply). Fetches threads modified in the last 48 hours.
- **Google Calendar** — today's events, free blocks ≥30 min within working hours (default 9am–6pm, configurable), upcoming deadlines in the next 7 days.
- **Notion** — queries your task database via direct REST API (`fetch`), bins tasks into overdue / due today / in progress by due date and status.
- **Slack** — queries direct messages, classifying high-signal conversations into `action_required` and `awaiting_reply`.

The `TaskProvider` interface makes Linear and Todoist drop-in additions.

---

## Deployment

Deployed on Railway with a custom domain. Environment variables are set in Railway's dashboard; no `.env` file is committed.

```toml
# railway.toml
[build]
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/status"
```

---

## Built at LA Hacks 2026

<a href="https://github.com/nmokey/zerocall/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nmokey/zerocall" />
</a>

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.
