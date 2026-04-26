/**
 * Timezone-aware formatting and day-boundary utilities.
 *
 * All timestamps are stored throughout the codebase as UTC ISO strings — these
 * helpers form the single display/boundary layer that converts to the user's
 * configured timezone. Set USER_TIMEZONE in .env to an IANA name like
 * "America/Los_Angeles" or "America/New_York"; it falls back to the system
 * default if unset.
 *
 * All conversions go through Intl.DateTimeFormat so DST is handled correctly
 * for any specific instant.
 */

/**
 * Returns the IANA timezone name for all user-facing time operations.
 * Uses the system default timezone.
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Formats an ISO timestamp (or Date) as HH:MM (24-hour) in the user's timezone.
 * Used for calendar event start/end times in the injected snapshot.
 */
export function formatLocalTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: getUserTimezone(),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/**
 * Formats an ISO timestamp (or Date) as YYYY-MM-DD in the user's timezone.
 * Used for deadline and waiting-since dates in the injected snapshot.
 */
export function formatLocalDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getUserTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * Formats an ISO timestamp (or Date) as a human-readable date+time with
 * timezone abbreviation. Example: "April 25, 2026, 2:30 PM PDT". Used for
 * the snapshot `as_of` and "current local time" lines in the system prompt.
 */
export function formatLocalDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getUserTimezone(),
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

/**
 * Returns today's date as YYYY-MM-DD in the user's timezone. Used to bucket
 * task due-dates into "overdue" / "due today" / "in progress".
 */
export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

/**
 * Returns the offset (in minutes) of the given IANA timezone from UTC at the
 * given instant. Positive when the timezone is ahead of UTC (e.g. JST = +540).
 * Re-computed per call so DST transitions are handled correctly.
 */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Constructs a Date for the given local wall-clock time in the user's timezone.
 * Internally: builds a tentative UTC instant matching the desired wall clock,
 * then subtracts the timezone offset at that instant to obtain the real UTC.
 */
function dateFromLocalParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const tz = getUserTimezone();
  const tentativeUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMin = tzOffsetMinutes(new Date(tentativeUtc), tz);
  return new Date(tentativeUtc - offsetMin * 60000);
}

/** Extracts year/month/day in the user's timezone from a Date. */
function ymdInUserTz(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getUserTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Returns a Date at 00:00 of `at`'s calendar day, evaluated in the user's
 * timezone. Pass `.toISOString()` to use as a Calendar API `timeMin` boundary.
 */
export function startOfLocalDay(at: Date = new Date()): Date {
  const { year, month, day } = ymdInUserTz(at);
  return dateFromLocalParts(year, month, day, 0, 0);
}

/**
 * Returns a Date at 23:59:59.999 of `at`'s calendar day in the user's timezone.
 * Pass `.toISOString()` to use as a Calendar API `timeMax` boundary.
 */
export function endOfLocalDay(at: Date = new Date()): Date {
  const { year, month, day } = ymdInUserTz(at);
  return new Date(dateFromLocalParts(year, month, day, 23, 59).getTime() + 59_999);
}

/**
 * Returns a Date for HH:MM on `at`'s calendar day, evaluated in the user's
 * timezone. Used to anchor WORK_DAY_START / WORK_DAY_END into the right wall
 * clock for free-block calculation.
 *
 * @param hhmm - Time string in 24-hour format like "09:00" or "18:30".
 * @param at - Reference date. Returned date shares `at`'s local calendar day.
 */
export function localTimeOnDay(hhmm: string, at: Date = new Date()): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const { year, month, day } = ymdInUserTz(at);
  return dateFromLocalParts(year, month, day, hours, minutes);
}
