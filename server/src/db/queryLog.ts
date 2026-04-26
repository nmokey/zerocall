import { getDb } from './client.js';

export type QueryCategory = 'calendar' | 'email' | 'tasks' | 'general';

export interface QueryLogRow {
  id: number;
  logged_at: string;
  query_text: string;
  category: QueryCategory;
}

const CALENDAR_KEYWORDS = ['free', 'meeting', 'schedule', 'calendar', 'available', 'busy', 'block', 'event', 'am i', 'when', 'today', 'tomorrow', 'afternoon', 'morning', 'time', '3pm', '2pm', '1pm', 'noon', 'standup', 'sync'];
const EMAIL_KEYWORDS = ['email', 'reply', 'message', 'inbox', 'waiting', 'sent', 'thread', 'responded', 'hear back', 'follow up', 'unread', 'inbox'];
const TASKS_KEYWORDS = ['task', 'todo', 'overdue', 'deadline', 'due', 'blocked', 'in progress', 'notion', 'work on', 'finish', 'complete', 'priority', 'urgent', 'submission', 'deliverable'];

/**
 * Classifies a query into a section category using keyword heuristics.
 * No LLM call — purely lexical matching on lowercased prompt text.
 * Scores each category by keyword hits; ties go to 'general'.
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
    general: 0,
  };

  const best = (Object.entries(scores) as [QueryCategory, number][])
    .filter(([k]) => k !== 'general')
    .reduce((a, b) => (b[1] > a[1] ? b : a), ['general', -1] as [QueryCategory, number]);

  return best[1] > 0 ? best[0] : 'general';
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
