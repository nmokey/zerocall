# MCP Server

OneCall includes an MCP (Model Context Protocol) server as an optional deployment mode for integration with Claude Desktop, Cursor, and other MCP-compatible hosts.

---

## Overview

The MCP server is a secondary deployment path. While the primary OneCall story uses [harness injection](Harness-Injection.md) (zero tool calls), the MCP server provides the same data through a standard tool interface for environments that don't support SDK subclassing.

---

## Entry Point (`src/index.ts`)

```typescript
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initSchema } from './db/schema.js';
import { startScheduler } from './sync/scheduler.js';
import { createServer } from './server.js';

async function main() {
  initSchema();
  startScheduler();

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

On startup:
1. **`initSchema()`** — creates SQLite tables if they don't exist
2. **`startScheduler()`** — starts the background sync loop (immediate + every 15 min)
3. **`createServer()`** — registers MCP tools
4. **`StdioServerTransport`** — connects via stdin/stdout for Claude Desktop compatibility

---

## Tools (`src/server.ts`)

### `get_work_state`

Returns the latest pre-computed `WorkStateSnapshot` as formatted JSON.

```typescript
{
  name: "get_work_state",
  description: "Returns a pre-computed, structured snapshot of the user's current work context — calendar events, email threads requiring action, and tasks by status. Replaces separate calendar, email, and task tool calls. Data is refreshed every 15 minutes in the background.",
  inputSchema: { type: "object", properties: {}, required: [] }
}
```

- **No input required** — the snapshot is pre-computed by the background sync
- Returns formatted JSON of the latest snapshot from SQLite
- Returns a fallback message if no snapshot is available yet

### `trigger_sync`

Forces an immediate re-sync outside the normal polling interval.

```typescript
{
  name: "trigger_sync",
  description: "Forces an immediate re-sync of all data sources outside the normal polling interval. Use when the user reports stale data.",
  inputSchema: { type: "object", properties: {}, required: [] }
}
```

- Kicks off `syncAll()` in the background (non-blocking)
- Returns immediately with a confirmation message
- Useful when the user knows their data has changed and wants a fresh snapshot

---

## Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

After restarting Claude Desktop, the `get_work_state` and `trigger_sync` tools appear automatically.

---

## Build & Run

```bash
npm run build    # Compiles TypeScript to dist/
npm start        # Runs the MCP server
```

The first run will prompt for Google OAuth authentication (see [Authentication](Authentication.md)).

---

## MCP vs. Harness Injection

| Aspect | MCP Server | Harness Injection |
|--------|-----------|-------------------|
| Tool calls | 1 (`get_work_state`) | 0 |
| LLM turns | 2 (request + tool result + response) | 1 |
| Model must decide to call tool | Yes | No |
| Works with Claude Desktop | Yes | No (requires SDK) |
| Works with any MCP host | Yes | No (Anthropic SDK only) |

The MCP server is still a significant improvement over raw provider tools (1 call vs. 5+), but the harness injection path eliminates tool calls entirely.
