# Data Types

All core types are defined in `src/types/snapshot.ts`. The `WorkStateSnapshot` is the central data structure that flows through every layer of the system.

---

## WorkStateSnapshot

The top-level snapshot that captures a user's complete work context at a point in time.

```typescript
interface WorkStateSnapshot {
  as_of: string;           // ISO 8601 timestamp of last sync

  calendar: {
    today: CalendarEvent[];
    free_blocks: TimeBlock[];
    upcoming_deadlines: CalendarEvent[];  // next 7 days
  };

  email: {
    action_required: EmailThread[];      // inbound, unread
    awaiting_reply: EmailThread[];       // outbound, no reply, sent >4h ago
    unread_count: number;
  };

  tasks: {
    overdue: Task[];
    due_today: Task[];
    in_progress: Task[];
  };

  meta: {
    sync_duration_ms: number;
    sources: Array<'gmail' | 'gcal' | 'notion'>;
    errors: string[];      // non-fatal sync errors per source
  };
}
```

### Field Details

| Field | Description |
|-------|-------------|
| `as_of` | ISO 8601 timestamp when the snapshot was created. Updated at the end of `syncAll()`. |
| `calendar.today` | All events on the current calendar day. |
| `calendar.free_blocks` | Gaps ≥30 minutes within working hours (default 9am–6pm) not occupied by events. |
| `calendar.upcoming_deadlines` | Events in the next 7 days with "deadline" or "due" in the title. |
| `email.action_required` | Threads where the last message is from someone else and the thread is unread. |
| `email.awaiting_reply` | Threads where the last message is from the user, sent >4 hours ago, with no reply. |
| `email.unread_count` | Total unread message count from Gmail. |
| `tasks.overdue` | Tasks with a due date before today. |
| `tasks.due_today` | Tasks with a due date matching today. |
| `tasks.in_progress` | All other tasks (no due date or future due date). |
| `meta.sync_duration_ms` | How long the sync took in milliseconds. |
| `meta.sources` | Which providers completed successfully. |
| `meta.errors` | Non-fatal error messages from failed providers. |

---

## CalendarEvent

Represents a single calendar event.

```typescript
interface CalendarEvent {
  id: string;
  title: string;
  start: string;          // ISO 8601
  end: string;            // ISO 8601
  attendees: string[];    // email addresses
  location?: string;
  meeting_link?: string;  // video call URL from conferenceData
}
```

---

## TimeBlock

Represents a free time block within working hours.

```typescript
interface TimeBlock {
  start: string;           // ISO 8601
  end: string;             // ISO 8601
  duration_minutes: number;
}
```

Only blocks ≥30 minutes are included. Computed by `computeFreeBlocks()` in `src/providers/calendar.ts`.

---

## EmailThread

Represents a classified email thread.

```typescript
interface EmailThread {
  thread_id: string;
  subject: string;
  counterparty: string;     // sender (for action_required) or recipient (for awaiting_reply)
  last_message_at: string;  // ISO 8601
  snippet: string;          // first 120 characters of the last message
  waiting_since?: string;   // ISO 8601 — only set for awaiting_reply threads
}
```

---

## Task

Represents a task from a task management provider.

```typescript
interface Task {
  id: string;
  title: string;
  due?: string;          // ISO 8601 date or datetime
  status: string;        // e.g. "In Progress", "Not Started", "Done"
  url?: string;          // link to the task in its source app
  source: 'notion' | 'linear' | 'todoist';
}
```

The `source` field uses a union type that anticipates future provider additions.

---

## TaskProvider Interface

Defined in `src/providers/types.ts`. All task integrations implement this interface:

```typescript
interface TaskProvider {
  name: 'notion' | 'linear' | 'todoist';
  getTasks(): Promise<{
    overdue: Task[];
    due_today: Task[];
    in_progress: Task[];
  }>;
}
```

This interface makes providers swappable and new sources drop-in additions. See [Extending OneCall](Extending-OneCall.md) for how to add a new provider.
