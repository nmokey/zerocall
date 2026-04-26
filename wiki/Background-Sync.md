# Background Sync

The sync layer keeps the `WorkStateSnapshot` fresh by fetching from providers on demand and persisting results to SQLite.

---

## Lazy Caching (`server/src/sync/scheduler.ts`)

Instead of polling on a fixed interval, OneCall uses **lazy caching**: syncs only fire when a snapshot is actually requested and the cache is stale.

```typescript
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export async function ensureFreshSnapshot(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<WorkStateSnapshot | null> {
  const cached = readLatestSnapshot();

  if (cached && !isStale(cached, maxAgeMs)) {
    return cached;
  }

  console.log('[cache] snapshot is %s — syncing now', cached ? 'stale' : 'empty');
  await syncAll();
  return readLatestSnapshot();
}

function isStale(snapshot: WorkStateSnapshot, maxAgeMs: number): boolean {
  const age = Date.now() - new Date(snapshot.as_of).getTime();
  return age > maxAgeMs;
}
```

### Behavior

1. If a cached snapshot exists and is younger than `maxAgeMs` (default 15 min), returns it immediately
2. If the cache is stale or empty, triggers a full `syncAll()` before returning
3. This replaces the previous `node-cron` background poller — syncs only happen when needed

### Why Lazy Over Polling

- No wasted API calls when nobody is querying
- Snapshot is always fresh when actually used (guaranteed ≤15 min old)
- Simpler code — no cron dependency, no background timer management

---

## syncAll (`server/src/sync/syncAll.ts`)

Orchestrates a full sync across all enabled providers:

```typescript
export async function syncAll(): Promise<void> {
  const logId = logSyncStart();
  const start = Date.now();
  const errors: string[] = [];

  const snapshot: WorkStateSnapshot = { ... };

  // Check integration preferences
  const enableGmail = process.env.ENABLE_GMAIL !== 'false';
  const enableCalendar = process.env.ENABLE_CALENDAR !== 'false';
  const enableNotion = process.env.ENABLE_NOTION !== 'false';

  // Fetch enabled providers in parallel via Promise.allSettled
  // Gmail and Calendar share the Google OAuth client
  // ...

  writeSnapshot(snapshot);
  logSyncEnd(logId, true);
}
```

### Key Design Decisions

1. **`Promise.allSettled` over `Promise.all`** — a Gmail failure should not block calendar data from being saved. Each provider result is handled independently.

2. **Error isolation** — non-fatal provider errors are recorded in `snapshot.meta.errors` and the snapshot is still written. Only fatal errors (e.g., auth failure) prevent the snapshot from being saved.

3. **Sync logging** — every sync attempt is logged to the `sync_log` table with start time, end time, success flag, and error details.

4. **Integration toggles** — individual providers can be disabled via `ENABLE_GMAIL=false`, `ENABLE_CALENDAR=false`, or `ENABLE_NOTION=false` environment variables. All default to enabled.

5. **Shared auth** — Gmail and Calendar share the Google OAuth client, so only one auth call is needed for both.

### Console Output

```
[cache] snapshot is stale — syncing now
[sync] done in 22547ms — sources: gmail, gcal, notion
```

If a provider fails:

```
[sync] done in 18320ms — sources: gcal, notion — errors: gmail: Error: Token expired
```

---

## Webhooks (`server/src/sync/webhooks.ts`)

A placeholder for Gmail push notifications. Currently unimplemented:

```typescript
// TODO: implement (optional — Gmail push notification handler)
```

When implemented, this would allow Gmail to push updates to OneCall via Google Cloud Pub/Sub instead of relying on polling, reducing the latency between an email arriving and it appearing in the snapshot.
