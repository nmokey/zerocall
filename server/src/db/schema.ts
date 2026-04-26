import { getDb } from './client.js';

export function initSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT NOT NULL,
      snapshot    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      success     INTEGER,
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS query_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      logged_at   TEXT NOT NULL,
      query_text  TEXT NOT NULL,
      category    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS adaptive_config (
      section     TEXT PRIMARY KEY,
      enabled     INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL
    );
  `);
}
