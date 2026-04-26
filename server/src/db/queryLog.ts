import { getDb } from './client.js';

export type QueryCategory = 'calendar' | 'email' | 'tasks' | 'slack' | 'general';

export interface QueryLogRow {
  id: number;
  logged_at: string;
  query_text: string;
  category: QueryCategory;
}

// Strong-signal keywords only — each list should only fire for queries that
// unambiguously belong to that section. Avoid temporal words ('today',
// 'tomorrow', 'morning') that appear in queries about any section.
const CALENDAR_KEYWORDS = ['meeting', 'schedule', 'calendar', 'available', 'busy', 'free block', 'am i free', 'on my calendar', 'event', '3pm', '2pm', '1pm', 'noon', 'rest of the day', 'this afternoon', 'free at'];
const EMAIL_KEYWORDS = ['email', 'reply', 'replied', 'message', 'inbox', 'waiting', 'sent', 'thread', 'responded', 'hear back', 'follow up', 'unread'];
const TASKS_KEYWORDS = ['task', 'todo', 'overdue', 'deadline', 'due today', 'in progress', 'blocking', 'notion', 'finish', 'deliverable', 'submission'];
// 'messaged me' / 'pinged me' / 'slacked me' are strong Slack signals with no
// cross-section ambiguity. Temporal words deliberately excluded (see above).
const SLACK_KEYWORDS = ['slack', 'dm', 'direct message', 'slacked', 'pinged me', 'messaged me'];

/**
 * Classifies a query into a section category using keyword heuristics.
 * No LLM call — purely lexical matching on lowercased prompt text.
 * Uses strong-signal keywords only; ties and no-match both return 'general'.
 *
 * @param text - The user's raw query string.
 * @returns The most likely category.
 */
export function classifyQuery(text: string): QueryCategory {
  const lower = text.toLowerCase();

  const score = (keywords: string[]) =>
    keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);

  const scores: Record<QueryCategory, number> = {
    calendar: score(CALENDAR_KEYWORDS),
    email: score(EMAIL_KEYWORDS),
    tasks: score(TASKS_KEYWORDS),
    slack: score(SLACK_KEYWORDS),
    general: 0,
  };

  const specific = (Object.entries(scores) as [QueryCategory, number][]).filter(([k]) => k !== 'general');
  const maxScore = Math.max(...specific.map(([, v]) => v));

  // Ties and zero scores both map to 'general' — ambiguous queries should not
  // inflate relevance for any specific section.
  if (maxScore === 0) return 'general';
  const winners = specific.filter(([, v]) => v === maxScore);
  return winners.length === 1 ? winners[0][0] : 'general';
}

/**
 * Logs a user query to the query_log table and prunes to the last 100 rows.
 *
 * @param queryText - The raw user query string.
 */
export function logQuery(queryText: string): void {
  const db = getDb();
  const category = classifyQuery(queryText);

  db.prepare(
    `INSERT INTO query_log (logged_at, query_text, category) VALUES (?, ?, ?)`
  ).run(new Date().toISOString(), queryText, category);

  db.prepare(
    `DELETE FROM query_log WHERE id NOT IN (
      SELECT id FROM query_log ORDER BY id DESC LIMIT 100
    )`
  ).run();
}

/**
 * Returns the most recent N rows from query_log, newest first.
 *
 * @param limit - Maximum number of rows to return.
 */
export function readRecentQueries(limit: number): QueryLogRow[] {
  const db = getDb();
  return db.prepare(
    `SELECT id, logged_at, query_text, category FROM query_log ORDER BY id DESC LIMIT ?`
  ).all(limit) as QueryLogRow[];
}
