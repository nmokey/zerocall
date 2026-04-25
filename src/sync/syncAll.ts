import 'dotenv/config';
import { getAuthenticatedClient } from '../auth/google.js';
import { fetchEmailState } from '../providers/gmail.js';
import { fetchCalendarState } from '../providers/calendar.js';
import { NotionProvider } from '../providers/notion.js';
import { writeSnapshot, logSyncStart, logSyncEnd } from '../db/snapshot.js';
import type { WorkStateSnapshot } from '../types/snapshot.js';

export async function syncAll(): Promise<void> {
  const logId = logSyncStart();
  const start = Date.now();
  const errors: string[] = [];

  const snapshot: WorkStateSnapshot = {
    as_of: new Date().toISOString(),
    calendar: { today: [], free_blocks: [], upcoming_deadlines: [] },
    email: { action_required: [], awaiting_reply: [], unread_count: 0 },
    tasks: { overdue: [], due_today: [], in_progress: [] },
    meta: { sync_duration_ms: 0, sources: [], errors: [] },
  };

  try {
    const auth = await getAuthenticatedClient();
    const notion = new NotionProvider();

    const [emailResult, calendarResult, tasksResult] = await Promise.allSettled([
      fetchEmailState(auth),
      fetchCalendarState(auth),
      notion.getTasks(),
    ]);

    if (emailResult.status === 'fulfilled') {
      snapshot.email = emailResult.value;
      snapshot.meta.sources.push('gmail');
    } else {
      errors.push(`gmail: ${emailResult.reason}`);
    }

    if (calendarResult.status === 'fulfilled') {
      snapshot.calendar = calendarResult.value;
      snapshot.meta.sources.push('gcal');
    } else {
      errors.push(`gcal: ${calendarResult.reason}`);
    }

    if (tasksResult.status === 'fulfilled') {
      snapshot.tasks = tasksResult.value;
      snapshot.meta.sources.push('notion');
    } else {
      errors.push(`notion: ${tasksResult.reason}`);
    }

    snapshot.meta.sync_duration_ms = Date.now() - start;
    snapshot.meta.errors = errors;
    snapshot.as_of = new Date().toISOString();

    writeSnapshot(snapshot);
    logSyncEnd(logId, true);
    console.log(`[sync] done in ${snapshot.meta.sync_duration_ms}ms — sources: ${snapshot.meta.sources.join(', ')}${errors.length ? ` — errors: ${errors.join('; ')}` : ''}`);
  } catch (err) {
    logSyncEnd(logId, false, String(err));
    console.error('[sync] fatal error:', err);
  }
}
