# OneCall Wiki

**Your AI assistant reads the room before you ask.**

Zero tool calls. One LLM turn. Context already there.

---

## What is OneCall?

OneCall is an **agent harness** that eliminates the tool-call overhead of productivity agents. Instead of letting a model fetch calendar, email, and task data on every query, OneCall pre-syncs that data in the background and injects it into the system prompt before the model's first token.

**Before OneCall:** 5+ tool calls, 3+ LLM turns, ~20 seconds per productivity query
**After OneCall:** 0 tool calls, 1 LLM turn, ~6 seconds — and 88% fewer tokens

The key insight: we didn't give Claude a better tool. We changed what Claude knows before it starts thinking.

---

## Wiki Pages

| Page | Description |
|------|-------------|
| [Architecture](Architecture.md) | Three-layer design: background sync + harness injection + setup page |
| [Harness Injection](Harness-Injection.md) | Deep dive into `OneCallAnthropic` and `prepareOptions` |
| [Data Types](Data-Types.md) | `WorkStateSnapshot` and all sub-interfaces |
| [Providers](Providers.md) | Gmail, Google Calendar, and Notion integrations |
| [Database](Database.md) | SQLite schema, snapshot persistence, sync logging |
| [Background Sync](Background-Sync.md) | `syncAll` orchestration and `node-cron` scheduler |
| [Authentication](Authentication.md) | Google OAuth2 flow and token management |
| [Demo and Benchmarking](Demo-and-Benchmarking.md) | Running demo scripts, evaluation methodology, metrics |
| [Configuration](Configuration.md) | Environment variables and setup guide |
| [Extending OneCall](Extending-OneCall.md) | Adding new providers via the `TaskProvider` interface |

---

## Quick Links

- **Run the demo:** `npm run demo:trace`
- **Run benchmarks:** `npm run demo:benchmark`
- **Start the server:** `npm start`
- **Live evaluation (requires credentials):** `npm run live:trace`

---

## Built at LA Hacks 2026

Targeting the **Flicker to Flow** (Figma) and **Augment the Agent** (Cognition) tracks.
