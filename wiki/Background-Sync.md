# Background Sync

The background sync layer keeps the `WorkStateSnapshot` fresh by polling providers on a regular interval and persisting results to SQLite.

---

## Scheduler (`src/sync/scheduler.ts`)

Uses `node-cron` to run `syncAll()` on a configurable interval:

```typescript
export function startScheduler(): void {
  const intervalMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '15', 10);
  const cronExpr = `*/${intervalMinutes} * * * *`;

  cron.schedule(cronExpr, () => {
    syncAll().catch(err => console.error('[scheduler] sync error:', err));
  });

  console.log(`[scheduler] polling every ${intervalMinutes} minutes`);

  // Run immediately on startup
  syncAll().catch(err => console.error('[scheduler] initial sync error:', err));
}
```

### Behavior

1. On startup, runs one sync immediately so the snapshot is available right away
2. Schedules recurring syncs at the configured interval (default: 15 minutes)
3. Sync errors are caught and logged — they do not crash the scheduler or the process

---

## syncAll (`src/sync/syncAll.ts`)

Orchestrates a full sync across all providers:

```typescript
export async function syncAll(): Promise<void> {
  const logId = logSyncStart();
  const start = Date.now();
  const errors: string[] = [];

  // Initialize empty snapshot
  const snapshot: WorkStateSnapshot = { ... };

  try {
    const auth = await getAuthenticatedClient();
    const notion = new NotionProvider();

    // Fetch all providers in parallel
    const [emailResult, calendarResult, tasksResult] = await Promise.allSettled([
      fetchEmailState(auth),
      fetchCalendarState(auth),
      notion.getTasks(),
    ]);

    // Merge results — failed providers log errors but don't block others
    if (emailResult.status === 'fulfilled') {
      snapshot.email = emailResult.value;
      snapshot.meta.sources.push('gmail');
    } else {
      errors.push(`gmail: ${emailResult.reason}`);
    }

    // ... same pattern for calendar and tasks ...

    writeSnapshot(snapshot);
    logSyncEnd(logId, true);
  } catch (err) {
    logSyncEnd(logId, false, String(err));
    console.error('[sync] fatal error:', err);
  }
}
```

### Key Design Decisions

1. **`Promise.allSettled` over `Promise.all`** — a Gmail failure should not block calendar data from being saved. Each provider result is handled independently.

2. **Error isolation** — non-fatal provider errors are recorded in `snapshot.meta.errors` and the snapshot is still written. Only fatal errors (e.g., auth failure) prevent the snapshot from being saved.

3. **Sync logging** — every sync attempt is logged to the `sync_log` table with start time, end time, success flag, and error details.

4. **Snapshot overwrite** — each sync writes a new snapshot row. Old snapshots are pruned to keep only the last 10.

### Console Output

```
[scheduler] polling every 15 minutes
[sync] done in 22547ms — sources: gmail, gcal, notion
```

If a provider fails:

```
[sync] done in 18320ms — sources: gcal, notion — errors: gmail: Error: Token expired
```

---

## Webhooks (`src/sync/webhooks.ts`)

A placeholder for Gmail push notifications. Currently unimplemented:

```typescript
// TODO: implement (optional — Gmail push notification handler)
```

When implemented, this would allow Gmail to push updates to OneCall via Google Cloud Pub/Sub instead of relying on polling, reducing the latency between an email arriving and it appearing in the snapshot.
