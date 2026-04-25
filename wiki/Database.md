# Database

OneCall uses SQLite (via `better-sqlite3`) for snapshot persistence and sync logging. The database is local, requires no external service, and reads complete in sub-millisecond time.

---

## Connection (`src/db/client.ts`)

A singleton `better-sqlite3` instance with WAL (Write-Ahead Logging) mode enabled for concurrent read/write performance:

```typescript
const DB_PATH = path.resolve(__dirname, '../../onecall.db');

export function getDb(): Database.Database {
  if (!instance) {
    instance = new Database(DB_PATH);
    instance.pragma('journal_mode = WAL');
  }
  return instance;
}
```

The database file is created at `onecall.db` in the project root.

---

## Schema (`src/db/schema.ts`)

Two tables, created on startup by `initSchema()`:

### `snapshots`

Stores serialized `WorkStateSnapshot` objects.

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  snapshot    TEXT NOT NULL  -- full WorkStateSnapshot as JSON
);
```

### `sync_log`

Records sync operations for debugging and observability.

```sql
CREATE TABLE IF NOT EXISTS sync_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  success     INTEGER,
  error       TEXT
);
```

---

## Snapshot Operations (`src/db/snapshot.ts`)

### `writeSnapshot(snapshot)`

Inserts a new snapshot and prunes old entries to keep only the last 10:

```typescript
function writeSnapshot(snapshot: WorkStateSnapshot): void {
  db.prepare('INSERT INTO snapshots (created_at, snapshot) VALUES (?, ?)')
    .run(new Date().toISOString(), JSON.stringify(snapshot));

  db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 10)')
    .run();
}
```

### `readLatestSnapshot()`

Returns the most recent snapshot, or `null` if none exists:

```typescript
function readLatestSnapshot(): WorkStateSnapshot | null {
  const row = db.prepare('SELECT snapshot FROM snapshots ORDER BY id DESC LIMIT 1')
    .get() as { snapshot: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.snapshot) as WorkStateSnapshot;
}
```

This is the function used by `snapshotGetter` in production.

---

## Sync Logging

### `logSyncStart()`

Inserts a new sync log entry with `started_at` and returns the row ID.

### `logSyncEnd(id, success, error?)`

Updates the sync log entry with `finished_at`, `success` flag, and optional error message.

These are called by `syncAll()` to track sync history. The sync log is write-only — it is not pruned automatically.

---

## Data Flow

```
syncAll()
  │
  ├── logSyncStart()        → sync_log row created
  ├── fetch providers       → WorkStateSnapshot assembled
  ├── writeSnapshot()       → snapshot row inserted, old rows pruned
  └── logSyncEnd()          → sync_log row updated

readLatestSnapshot()        → returns most recent snapshot row
```
