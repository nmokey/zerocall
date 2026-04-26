import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { CalendarEvent, TimeBlock } from '@zerocall/harness';
import { startOfLocalDay, endOfLocalDay, localTimeOnDay } from '@zerocall/harness';

export interface CalendarFetchConfig {
  /** How many days ahead to search for deadline events. */
  deadlineDays: number;
}

const DEFAULT_CALENDAR_CONFIG: CalendarFetchConfig = { deadlineDays: 7 };

export async function fetchCalendarState(
  auth: OAuth2Client,
  config: CalendarFetchConfig = DEFAULT_CALENDAR_CONFIG,
): Promise<{
  today: CalendarEvent[];
  free_blocks: TimeBlock[];
  upcoming_deadlines: CalendarEvent[];
}> {
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const startOfToday = startOfLocalDay(now);
  const endOfToday = endOfLocalDay(now);
  const deadlineCutoff = new Date(now.getTime() + config.deadlineDays * 24 * 60 * 60 * 1000);

  const [todayRes, deadlineRes] = await Promise.all([
    calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfToday.toISOString(),
      timeMax: endOfToday.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    }),
    calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: deadlineCutoff.toISOString(),
      q: 'deadline due',
      singleEvents: true,
      orderBy: 'startTime',
    }),
  ]);

  const today = (todayRes.data.items ?? []).map(toCalendarEvent).filter(Boolean) as CalendarEvent[];
  const upcoming_deadlines = (deadlineRes.data.items ?? []).map(toCalendarEvent).filter(Boolean) as CalendarEvent[];

  const workStart = localTimeOnDay(process.env.WORK_DAY_START ?? '09:00', now);
  const workEnd = localTimeOnDay(process.env.WORK_DAY_END ?? '18:00', now);
  const free_blocks = computeFreeBlocks(today, workStart, workEnd);

  return { today, free_blocks, upcoming_deadlines };
}

function toCalendarEvent(e: {
  id?: string | null;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  attendees?: Array<{ email?: string | null }> | null;
  location?: string | null;
  conferenceData?: { entryPoints?: Array<{ uri?: string | null; entryPointType?: string | null }> | null } | null;
}): CalendarEvent | null {
  if (!e.id || !e.summary) return null;
  const start = e.start?.dateTime ?? e.start?.date;
  const end = e.end?.dateTime ?? e.end?.date;
  if (!start || !end) return null;

  const meeting_link = e.conferenceData?.entryPoints
    ?.find(ep => ep.entryPointType === 'video')?.uri ?? undefined;

  return {
    id: e.id,
    title: e.summary,
    start,
    end,
    attendees: (e.attendees ?? []).map(a => a.email ?? '').filter(Boolean),
    location: e.location ?? undefined,
    meeting_link,
  };
}

function computeFreeBlocks(events: CalendarEvent[], workStart: Date, workEnd: Date): TimeBlock[] {
  const MIN_BLOCK_MINUTES = 30;

  // Build sorted busy windows clipped to working hours
  const busy = events
    .map(e => ({
      start: Math.max(new Date(e.start).getTime(), workStart.getTime()),
      end: Math.min(new Date(e.end).getTime(), workEnd.getTime()),
    }))
    .filter(b => b.start < b.end)
    .sort((a, b) => a.start - b.start);

  const free: TimeBlock[] = [];
  let cursor = workStart.getTime();

  for (const b of busy) {
    if (b.start > cursor) {
      const duration = Math.floor((b.start - cursor) / 60000);
      if (duration >= MIN_BLOCK_MINUTES) {
        free.push({
          start: new Date(cursor).toISOString(),
          end: new Date(b.start).toISOString(),
          duration_minutes: duration,
        });
      }
    }
    cursor = Math.max(cursor, b.end);
  }

  // Trailing gap
  if (cursor < workEnd.getTime()) {
    const duration = Math.floor((workEnd.getTime() - cursor) / 60000);
    if (duration >= MIN_BLOCK_MINUTES) {
      free.push({
        start: new Date(cursor).toISOString(),
        end: workEnd.toISOString(),
        duration_minutes: duration,
      });
    }
  }

  return free;
}
