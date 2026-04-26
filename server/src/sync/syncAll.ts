import '../env.js';
import { getAuthenticatedClient } from '../auth/google.js';
import { fetchEmailState } from '../providers/gmail.js';
import { fetchCalendarState } from '../providers/calendar.js';
import { NotionProvider } from '../providers/notion.js';
import { SlackProvider } from '../providers/slack.js';
import { writeSnapshot, logSyncStart, logSyncEnd } from '../db/snapshot.js';
import { computeFetchProfile } from '../analytics/suggestions.js';
import type { WorkStateSnapshot } from '@zerocall/harness';

export async function syncAll(): Promise<void> {
  const logId = logSyncStart();
  const start = Date.now();
  const errors: string[] = [];
  const fetchProfile = computeFetchProfile();

  const snapshot: WorkStateSnapshot = {
    as_of: new Date().toISOString(),
    calendar: { today: [], free_blocks: [], upcoming_deadlines: [] },
    email: { action_required: [], awaiting_reply: [], unread_count: 0 },
    tasks: { overdue: [], due_today: [], in_progress: [] },
    meta: { sync_duration_ms: 0, sources: [], errors: [] },
  };

  // Check integration preferences
  const enableGmail = process.env.ENABLE_GMAIL !== 'false';
  const enableCalendar = process.env.ENABLE_CALENDAR !== 'false';
  const enableNotion = process.env.ENABLE_NOTION !== 'false';
  // Slack is opt-in: only enabled when SLACK_USER_TOKEN is present in the environment.
  const slackToken = process.env.SLACK_USER_TOKEN;

  try {
    const tasks: Promise<any>[] = [];

    // Add sync tasks only for enabled integrations
    if (enableGmail || enableCalendar) {
      const authPromise = getAuthenticatedClient().then(async auth => {
        const results: any[] = [];
        if (enableGmail) results.push(fetchEmailState(auth, fetchProfile.email).then(r => ({ type: 'gmail', data: r })));
        if (enableCalendar) results.push(fetchCalendarState(auth, fetchProfile.calendar).then(r => ({ type: 'gcal', data: r })));
        return Promise.allSettled(results);
      });
      tasks.push(authPromise);
    }

    if (enableNotion) {
      const notion = new NotionProvider(fetchProfile.tasks);
      tasks.push(notion.getTasks().then(r => ({ type: 'notion', data: r })));
    }

    if (slackToken) {
      const slack = new SlackProvider(slackToken);
      tasks.push(slack.getMessages().then(r => ({ type: 'slack', data: r })));
    }

    const results = await Promise.allSettled(tasks);

    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value;
        // Handle Google auth results (array of results)
        if (Array.isArray(value)) {
          for (const subResult of value) {
            if (subResult.status === 'fulfilled') {
              if (subResult.value.type === 'gmail') {
                snapshot.email = subResult.value.data;
                snapshot.meta.sources.push('gmail');
              } else if (subResult.value.type === 'gcal') {
                snapshot.calendar = subResult.value.data;
                snapshot.meta.sources.push('gcal');
              }
            } else {
              errors.push(`${subResult.value.type}: ${subResult.value.reason}`);
            }
          }
        } else if (value.type === 'notion') {
          snapshot.tasks = value.data;
          snapshot.meta.sources.push('notion');
        } else if (value.type === 'slack') {
          // Merge Slack DM data and any per-conversation non-fatal errors.
          snapshot.slack = value.data.dms;
          snapshot.meta.sources.push('slack');
          for (const e of value.data.errors) errors.push(e);
        }
      } else {
        errors.push(`sync error: ${result.reason}`);
      }
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
