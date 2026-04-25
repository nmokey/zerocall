# OneCall Demo Scripts

Two scripts for showing judges the before/after story.

## Prerequisites

```bash
npm install
```

Add your Anthropic API key to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

---

## trace.ts — Live side-by-side trace

Runs one prompt through both agents in parallel and prints a color-coded tool call trace with latency and token counts.

```bash
# Default prompt: "What are my action items from Arvind's lab?"
npm run demo:trace

# Specific prompt by ID
npm run demo:trace -- p04

# Specific prompt by number (1–20)
npm run demo:trace -- 7
```

**Uses mocked data** so it runs offline without provider credentials. To use real data, swap the `runWithoutOneCall` and `runWithOneCall` implementations in `agents/` to call live APIs.

**Sample output:**

```
WITHOUT OneCall  (raw tool calls)
────────────────────────────────────────────────────────────
  1. gmail_search_threads {"query":"newer_than:2d"}  12ms
  2. gmail_get_thread {"thread_id":"th_001"}  8ms
  3. gmail_get_thread {"thread_id":"th_002"}  7ms
  4. calendar_list_events {"time_min":"...","time_max":"..."}  9ms
  5. notion_query_database {"database_id":"..."}  11ms

  Total latency: 2340ms   Tokens: 3120   Tool calls: 5

WITH OneCall  (get_work_state)
────────────────────────────────────────────────────────────
  1. get_work_state   0ms

  Total latency: 890ms   Tokens: 2180   Tool calls: 1

─── Result ───────────────────────────────────────────────
  Tool calls:  5 → 1  (80% fewer)
  Latency:     2340ms → 890ms  (62% faster)
  Tokens:      3120 → 2180  (30% fewer)
```

---

## benchmark.ts — Quantitative metrics across 20 prompts

Runs all 20 prompts from `prompts.ts` through both agents and prints a full comparison table plus aggregate summary.

```bash
npm run demo:benchmark
```

Output is a markdown-friendly table plus a summary block:

```
SUMMARY (20 prompts)
  Tool call reduction:   78.5%  (112 → 24 total calls)
  Avg latency reduction: 61.2%  (2180ms → 845ms)
  Avg token reduction:   28.4%  (3050 → 2184 tokens/query)
```

---

## Prompts

The 20 benchmark prompts are in `prompts.ts`. They cover the full range of productivity queries:
- Priority / focus queries ("What should I focus on?")
- Calendar queries ("Am I free at 3pm?")
- Email queries ("Did Sarah reply?")
- Task queries ("What's overdue?")
- Synthesis queries ("Give me a standup summary")
