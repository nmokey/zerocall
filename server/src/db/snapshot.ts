import { getDb } from './client.js';
import type { WorkStateSnapshot } from '@zerocall/harness';

export function writeSnapshot(snapshot: WorkStateSnapshot): void {
  const db = getDb();

  db.prepare(
    `INSERT INTO snapshots (created_at, snapshot) VALUES (?, ?)`
  ).run(new Date().toISOString(), JSON.stringify(snapshot));

  // Keep only the last 10 snapshots
  db.prepare(
    `DELETE FROM snapshots WHERE id NOT IN (
      SELECT id FROM snapshots ORDER BY id DESC LIMIT 10
    )`
  ).run();
}

export function readLatestSnapshot(): WorkStateSnapshot | null {
  const db = getDb();

  const row = db.prepare(
    `SELECT snapshot FROM snapshots ORDER BY id DESC LIMIT 1`
  ).get() as { snapshot: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.snapshot) as WorkStateSnapshot;
}

export function logSyncStart(): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO sync_log (started_at) VALUES (?)`
  ).run(new Date().toISOString());
  return result.lastInsertRowid as number;
}

export function logSyncEnd(id: number, success: boolean, error?: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE sync_log SET finished_at = ?, success = ?, error = ? WHERE id = ?`
  ).run(new Date().toISOString(), success ? 1 : 0, error ?? null, id);
}

export function readLastSyncLog(): { started_at: string; finished_at: string | null; success: number | null } | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT started_at, finished_at, success FROM sync_log ORDER BY id DESC LIMIT 1`
  ).get() as { started_at: string; finished_at: string | null; success: number | null } | undefined;
  return row ?? null;
}
