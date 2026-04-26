# Providers

OneCall syncs data from three sources: Gmail, Google Calendar, and Notion. Each provider is implemented as a standalone module in `server/src/providers/`.

---

## Gmail (`server/src/providers/gmail.ts`)

### What It Fetches

- Threads modified in the last 48 hours (`q: "newer_than:2d"`, up to 50 threads)
- For each thread, fetches metadata headers: From, To, Subject, Date

### Classification Logic

Each thread is classified based on the last message:

| Category | Condition |
|----------|-----------|
| **action_required** | Last message is from someone else AND thread is unread |
| **awaiting_reply** | Last message is from the user AND was sent >4 hours ago |

Threads that don't match either condition (read inbound messages, recent outbound) are excluded from the snapshot.

### Key Function

```typescript
async function fetchEmailState(auth: OAuth2Client): Promise<{
  action_required: EmailThread[];
  awaiting_reply: EmailThread[];
  unread_count: number;
}>
```

### Implementation Details

- **User email detection:** `getUserEmail()` calls `gmail.users.getProfile()` to determine the authenticated user's email address.
- **From-me check:** `isFromMe()` does a case-insensitive substring match of the user's email against the `From` header.
- **Counterparty extraction:** `getCounterparty()` returns the `To` header if the message is from the user, otherwise the `From` header.
- **Unread count:** A separate `messages.list` call with `q: 'is:unread'` uses `resultSizeEstimate` for the total count.
- **Parallel thread fetching:** All thread detail fetches run concurrently via `Promise.all`.

### Auth Scope

`https://www.googleapis.com/auth/gmail.readonly`

---

## Google Calendar (`server/src/providers/calendar.ts`)

### What It Fetches

Two parallel API calls:

1. **Today's events** — all events from start of today to end of today, ordered by start time
2. **Upcoming deadlines** — events in the next 7 days matching the query `"deadline due"` (events with "deadline" or "due" in the title)

### Free Block Calculation

`computeFreeBlocks()` identifies gaps ≥30 minutes within configurable working hours:

1. Clips all event start/end times to the working hours window
2. Sorts busy windows by start time
3. Walks a cursor from `workStart` to `workEnd`, emitting free blocks between busy windows
4. Emits a trailing free block if the last event ends before `workEnd`

**Working hours default:** 9:00–18:00, configurable via `WORK_DAY_START` and `WORK_DAY_END` environment variables.

### Key Function

```typescript
async function fetchCalendarState(auth: OAuth2Client): Promise<{
  today: CalendarEvent[];
  free_blocks: TimeBlock[];
  upcoming_deadlines: CalendarEvent[];
}>
```

### Implementation Details

- **Event conversion:** `toCalendarEvent()` maps raw Google Calendar API responses to the `CalendarEvent` type. Events missing an ID or summary are filtered out.
- **Meeting links:** Extracted from `conferenceData.entryPoints` where `entryPointType === 'video'`.
- **All-day events:** Handled via the `e.start?.date` fallback (Google uses `date` instead of `dateTime` for all-day events).

### Auth Scope

`https://www.googleapis.com/auth/calendar.readonly`

---

## Notion (`server/src/providers/notion.ts`)

### What It Fetches

Uses `client.search()` with a page filter to find all pages, sorted by last edited time (up to 100 results). This approach is schema-agnostic — it works with any Notion database structure.

### Task Classification

Tasks are binned by comparing the extracted due date against today's date string (`YYYY-MM-DD`):

| Category | Condition |
|----------|-----------|
| **overdue** | `due < todayStr` |
| **due_today** | `due === todayStr` |
| **in_progress** | Everything else (no due date or future date) |

### Property Extraction

Property extraction is schema-agnostic — it iterates all properties on each page and matches by `type` rather than by property name:

| Function | Matches Type | Extracts |
|----------|-------------|----------|
| `extractTitle()` | `type === 'title'` | Concatenated plain text from the title rich text array |
| `extractDate()` | `type === 'date'` | `date.start` string |
| `extractStatus()` | `type === 'status'` or `type === 'select'` | `status.name` or `select.name` |

Pages without a title are skipped.

### Key Class

```typescript
class NotionProvider implements TaskProvider {
  name = 'notion' as const;
  async getTasks(): Promise<{ overdue: Task[]; due_today: Task[]; in_progress: Task[] }>;
}
```

### Setup Requirements

1. Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Copy the integration token to `.env` as `NOTION_TOKEN`
3. Get the database ID from the database URL and set it as `NOTION_DATABASE_ID`
4. **Connect the integration** to the database via Notion's Connections menu (this step is easy to miss)

### Auth

Notion internal integration token (not OAuth). Set via `NOTION_TOKEN` environment variable.

---

## Provider Resilience

Providers are called in parallel via `Promise.allSettled` in `syncAll()`. If one provider fails:

- Its error is recorded in `meta.errors`
- The other providers' data is still saved to the snapshot
- The snapshot is still written to SQLite

This means a Gmail outage won't prevent calendar and task data from being available to the model.
