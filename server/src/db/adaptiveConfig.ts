import { getDb } from './client.js';

export interface SectionConfig {
  calendar: boolean;
  email: boolean;
  tasks: boolean;
}

const SECTIONS: Array<keyof SectionConfig> = ['calendar', 'email', 'tasks'];

/**
 * Reads the adaptive section config from SQLite.
 * Returns all-true defaults if the table has no rows yet.
 */
export function readAdaptiveConfig(): SectionConfig {
  const db = getDb();
  const rows = db.prepare(
    `SELECT section, enabled FROM adaptive_config`
  ).all() as { section: string; enabled: number }[];

  const config: SectionConfig = { calendar: true, email: true, tasks: true };
  for (const row of rows) {
    if (row.section === 'calendar' || row.section === 'email' || row.section === 'tasks') {
      config[row.section] = row.enabled === 1;
    }
  }
  return config;
}

/**
 * Enables or disables a single snapshot section in the adaptive config.
 * Upserts into adaptive_config table.
 *
 * @param section - Which section to update.
 * @param enabled - Whether the section should be injected into the system prompt.
 */
export function setAdaptiveSection(section: keyof SectionConfig, enabled: boolean): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO adaptive_config (section, enabled, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(section) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).run(section, enabled ? 1 : 0, new Date().toISOString());
}

/**
 * Resets all sections to enabled (clears adaptive overrides).
 */
export function resetAdaptiveConfig(): void {
  const db = getDb();
  const now = new Date().toISOString();
  for (const section of SECTIONS) {
    db.prepare(
      `INSERT INTO adaptive_config (section, enabled, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(section) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at`
    ).run(section, now);
  }
}
