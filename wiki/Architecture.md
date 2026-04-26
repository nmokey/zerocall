# Architecture

OneCall has three layers that work together to eliminate tool-call overhead from productivity agents.

---

## Overview

```
                       ┌─────────────────────────────────────────┐
                       │           Layer 1: Background Sync      │
                       │                                         │
                       │   ensureFreshSnapshot()                 │
                       │       │                                 │
                       │   cache stale?  ──no──→  return cached  │
                       │       │ yes                              │
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

                       ┌─────────────────────────────────────────┐
                       │        Layer 3: HTTP API + Setup        │
                       │                                         │
                       │  Express server on port 3000            │
                       │    /setup      → credential entry UI    │
                       │    /api/*      → REST endpoints         │
                       │    /oauth2callback → Google OAuth       │
                       └─────────────────────────────────────────┘
```

---

## Layer 1: Background Sync

Uses **lazy caching** via `ensureFreshSnapshot()`: syncs only fire when a snapshot is requested and the cache is stale (>15 min default). Each provider is called in parallel using `Promise.allSettled`, so a failure in one provider does not block the others.

Results are merged into a single [`WorkStateSnapshot`](Data-Types.md) and persisted to a local SQLite database. Only the last 10 snapshots are retained.

Individual integrations can be toggled via `ENABLE_GMAIL`, `ENABLE_CALENDAR`, and `ENABLE_NOTION` environment variables.

**Key files:**
- `server/src/sync/scheduler.ts` — lazy cache: `ensureFreshSnapshot()`
- `server/src/sync/syncAll.ts` — orchestrates parallel provider fetches
- `server/src/providers/` — individual provider implementations

See [Background Sync](Background-Sync.md) for details.

---

## Layer 2: Harness Injection

`OneCallAnthropic` subclasses the Anthropic SDK's `Anthropic` client and overrides the `prepareOptions()` lifecycle hook. This hook fires before every outgoing request while `options.body` is still a plain JS object (not yet JSON-encoded).

On every `POST /v1/messages` request, the override:
1. Reads the latest snapshot (sub-millisecond from SQLite)
2. Formats it as compact plain text
3. Splices it into `options.body.system`

The calling code passes no tools and no system prompt — injection is invisible to the application layer.

**Key file:** `harness/src/client.ts`

See [Harness Injection](Harness-Injection.md) for details.

---

## Layer 3: HTTP API + Setup Page

An Express server on port 3000 exposes REST endpoints for status, config, snapshot, sync, and auth. It also serves a server-rendered HTML setup page at `/setup` for credential management and Google OAuth.

**Key files:**
- `server/src/api/server.ts` — Express routes
- `server/src/api/setup.ts` — server-rendered HTML setup page
- `server/src/api/config.ts` — credential validation + `.env` writing

---

## Why Not Just a Better Tool?

Traditional approaches expose work context through tools that the model must decide to call. This still relies on the model's intelligence to make the retrieval decision — it's just a better tool, not a paradigm shift.

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
