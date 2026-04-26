# OneCall Live Scripts

Same scripts as [`demo/`](../demo/README.md), but running against your real Gmail, Google Calendar, and Notion data instead of mocked fixtures.

## Prerequisites

```bash
npm install
```

Add credentials to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...

# Google OAuth2
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback

# Notion
NOTION_TOKEN=...
NOTION_DATABASE_ID=...
```

**Google auth:** On first run, the terminal will print an OAuth URL. Open it in your browser, grant access, and the token is saved to `tokens.json`. Subsequent runs refresh automatically.

**Notion:** Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations), copy the token, and connect the integration to your database via the database's **Connections** menu.

**Snapshot (required for the `with` agent):** Run the sync server at least once before using `live:trace` or `live:benchmark`:

```bash
npm start
```

This populates the local SQLite database. The `with` agent reads directly from that snapshot — it makes no live API calls at query time. The `without` agent always fetches from live APIs on every run.

---

## trace.ts — Live side-by-side trace

Runs one prompt through both agents in parallel and prints a color-coded tool call trace with latency and token counts.

```bash
# Default prompt: "What are my action items from Arvind's lab?"
npm run live:trace

# Specific prompt by ID
npm run live:trace -- p04

# Specific prompt by number (1–20)
npm run live:trace -- 7

# Custom prompt
npm run live:trace -- --prompt "Can I squeeze in a workout today?"
```

**Sample output:**

```
WITHOUT OneCall  (raw tool calls)
────────────────────────────────────────────────────────────
  1. gmail_search_threads {"query":"newer_than:2d"}  1842ms
  2. gmail_get_thread {"thread_id":"..."}  923ms
  3. calendar_list_events {"time_min":"...","time_max":"..."}  640ms
  4. notion_query_database {"database_id":"..."}  1205ms

  Total latency: 8340ms   Tokens: 3820   Tool calls: 4

WITH OneCall  (harness injection)
────────────────────────────────────────────────────────────
  ✦ Work context auto-injected into system prompt
  (0 tool calls — harness injected the snapshot before first token)

  Total latency: 1120ms   Tokens: 2240   Tool calls: 0

─── Result ───────────────────────────────────────────────
  Tool calls:  4 → 0  (100% fewer)
  LLM turns:   3 → 1  (67% fewer)
  Latency:     8340ms → 1120ms  (87% faster)
  Tokens:      3820 → 2240  (41% fewer)
```

The `without` agent's latency is dominated by real network round-trips to Google and Notion. The `with` agent's snapshot read is sub-millisecond (local SQLite).

---

## benchmark.ts — Quantitative metrics across 20 prompts

Runs all 20 prompts from `shared/prompts.ts` through both agents sequentially and prints a full comparison table plus aggregate summary. A 15-second pause between prompts avoids Anthropic API rate limits.

```bash
npm run live:benchmark

# Or benchmark a single custom prompt
npm run live:benchmark -- --prompt "Should I reschedule my 1:1?"
```

Output is a table plus a summary block:

```
SUMMARY (20 prompts)
  Tool call reduction:  100.0%  (87 → 0 total calls)
  LLM turn reduction:   67.0%  (avg 3.0 → 1.0 turns/query)
  Avg latency reduction: 84.3%  (7920ms → 1240ms)
  Avg token reduction:   38.1%  (3640 → 2250 tokens/query)
```

---

## Prompts

Shared with the demo — the 20 benchmark prompts live in [`shared/prompts.ts`](../shared/prompts.ts). They cover the full range of productivity queries:
- Priority / focus queries ("What should I focus on?")
- Calendar queries ("Am I free at 3pm?")
- Email queries ("Did Sarah reply?")
- Task queries ("What's overdue?")
- Synthesis queries ("Give me a standup summary")

---

## Error behavior

Unlike the demo, errors propagate directly. If Google auth is missing, an API call fails, or no snapshot exists in the database, you will see the raw error. Check:

- `tokens.json` exists and is not expired (re-run `npm start` to re-auth)
- `NOTION_TOKEN` and `NOTION_DATABASE_ID` are set in `.env`
- The Notion integration is connected to your database in Notion's UI
- `npm start` has run at least once (for the `with` agent)
