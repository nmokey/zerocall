# Architecture

OneCall has two layers that work together to eliminate tool-call overhead from productivity agents.

---

## Overview

```
                       ┌─────────────────────────────────────────┐
                       │           Layer 1: Background Sync      │
                       │                                         │
                       │   node-cron (every 15 min)              │
                       │       │                                 │
                       │       ▼                                 │
                       │   syncAll()                             │
                       │       │                                 │
                       │   ┌───┼───────────┐                     │
                       │   ▼   ▼           ▼                     │
                       │ Gmail Calendar  Notion                  │
                       │   │   │           │                     │
                       │   └───┼───────────┘                     │
                       │       ▼                                 │
                       │  WorkStateSnapshot                      │
                       │       │                                 │
                       │       ▼                                 │
                       │   SQLite (better-sqlite3)               │
                       └─────────────────────────────────────────┘

                       ┌─────────────────────────────────────────┐
                       │        Layer 2: Harness Injection       │
                       │                                         │
                       │  User code:                             │
                       │    client.messages.create({ ... })      │
                       │       │                                 │
                       │       ▼                                 │
                       │  OneCallAnthropic.prepareOptions()      │
                       │       │                                 │
                       │    Reads latest snapshot from SQLite     │
                       │    Injects into options.body.system     │
                       │       │                                 │
                       │       ▼                                 │
                       │  Request sent to Anthropic API          │
                       │  (with work context already in prompt)  │
                       └─────────────────────────────────────────┘
```

---

## Layer 1: Background Sync

A `node-cron` loop polls Gmail, Google Calendar, and Notion every 15 minutes (configurable via `SYNC_INTERVAL_MINUTES`). Each provider is called in parallel using `Promise.allSettled`, so a failure in one provider does not block the others.

Results are merged into a single [`WorkStateSnapshot`](Data-Types.md) and persisted to a local SQLite database. Only the last 10 snapshots are retained.

**Key files:**
- `src/sync/scheduler.ts` — cron scheduling and startup sync
- `src/sync/syncAll.ts` — orchestrates parallel provider fetches
- `src/providers/` — individual provider implementations

See [Background Sync](Background-Sync.md) for details.

---

## Layer 2: Harness Injection

`OneCallAnthropic` subclasses the Anthropic SDK's `Anthropic` client and overrides the `prepareOptions()` lifecycle hook. This hook fires before every outgoing request while `options.body` is still a plain JS object (not yet JSON-encoded).

On every `POST /v1/messages` request, the override:
1. Reads the latest snapshot (sub-millisecond from SQLite)
2. Formats it as compact plain text
3. Splices it into `options.body.system`

The calling code passes no tools and no system prompt — injection is invisible to the application layer.

**Key file:** `src/client.ts`

See [Harness Injection](Harness-Injection.md) for details.

---

## MCP Server (Optional)

OneCall also exposes a `get_work_state()` MCP tool for compatibility with Claude Desktop, Cursor, and other MCP hosts. This is a secondary deployment mode — the demo and primary judge story use harness injection.

**Key files:**
- `src/index.ts` — entry point, initializes DB + scheduler + MCP transport
- `src/server.ts` — MCP tool registration

See [MCP Server](MCP-Server.md) for details.

---

## Why Not Just a Better Tool?

The original design was an MCP server exposing `get_work_state()`. Feedback from Cognition pointed out that this still relies on the model's intelligence to decide to call the tool — it's just a better tool, not a paradigm shift.

The harness injection approach removes model agency from the retrieval decision entirely. The context is injected at the SDK level before the model generates its first token. The model never needs to ask for it, and the calling code never needs to provide it.

---

## Request Flow Comparison

### Without OneCall (traditional agent)

```
User prompt → LLM turn 1 → tool_use: gmail_search_threads
                          → tool_use: calendar_list_events
           → LLM turn 2 → tool_use: gmail_get_thread
                          → tool_use: notion_query_database
           → LLM turn 3 → final text response

Result: 4–5 tool calls, 3 LLM turns, ~20s latency
```

### With OneCall (harness injection)

```
User prompt → prepareOptions() injects snapshot → LLM turn 1 → final text response

Result: 0 tool calls, 1 LLM turn, ~6s latency
```
