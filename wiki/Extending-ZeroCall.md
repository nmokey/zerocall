# Extending ZeroCall

ZeroCall is designed to be extensible. The `TaskProvider` interface makes adding new task management sources straightforward, and the snapshot structure accommodates additional data without breaking existing functionality.

---

## Adding a New Task Provider

The `TaskProvider` interface (in `src/providers/types.ts`) defines the contract:

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

### Step 1: Add the Provider Name to the Union Type

Update `src/providers/types.ts` to include the new source name:

```typescript
// Before
name: 'notion' | 'linear' | 'todoist';

// After
name: 'notion' | 'linear' | 'todoist' | 'your_source';
```

Also update the `Task.source` union in `src/types/snapshot.ts`:

```typescript
// Before
source: 'notion' | 'linear' | 'todoist';

// After
source: 'notion' | 'linear' | 'todoist' | 'your_source';
```

### Step 2: Implement the Provider

Create `src/providers/your_source.ts`:

```typescript
import type { TaskProvider } from './types.js';
import type { Task } from '../types/snapshot.js';

export class YourSourceProvider implements TaskProvider {
  name = 'your_source' as const;

  async getTasks(): Promise<{ overdue: Task[]; due_today: Task[]; in_progress: Task[] }> {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Fetch tasks from your source's API
    const rawTasks = await fetchFromYourAPI();

    const overdue: Task[] = [];
    const due_today: Task[] = [];
    const in_progress: Task[] = [];

    for (const raw of rawTasks) {
      const task: Task = {
        id: raw.id,
        title: raw.title,
        due: raw.dueDate ?? undefined,
        status: raw.status,
        url: raw.url ?? undefined,
        source: 'your_source',
      };

      if (task.due && task.due < todayStr) {
        overdue.push(task);
      } else if (task.due === todayStr) {
        due_today.push(task);
      } else {
        in_progress.push(task);
      }
    }

    return { overdue, due_today, in_progress };
  }
}
```

### Step 3: Wire It Into syncAll

Update `src/sync/syncAll.ts` to include the new provider in the parallel fetch:

```typescript
import { YourSourceProvider } from '../providers/your_source.js';

// In syncAll():
const yourSource = new YourSourceProvider();

const [emailResult, calendarResult, tasksResult, yourSourceResult] = await Promise.allSettled([
  fetchEmailState(auth),
  fetchCalendarState(auth),
  notion.getTasks(),
  yourSource.getTasks(),
]);

// Merge yourSource results into snapshot.tasks
if (yourSourceResult.status === 'fulfilled') {
  snapshot.tasks.overdue.push(...yourSourceResult.value.overdue);
  snapshot.tasks.due_today.push(...yourSourceResult.value.due_today);
  snapshot.tasks.in_progress.push(...yourSourceResult.value.in_progress);
  snapshot.meta.sources.push('your_source');
} else {
  errors.push(`your_source: ${yourSourceResult.reason}`);
}
```

### Step 4: Add Environment Variables

Add any required credentials to `.env.example`:

```bash
# Your Source
YOUR_SOURCE_API_KEY=
YOUR_SOURCE_WORKSPACE_ID=
```

---

## Adding a New Data Category

If you need to add a new data category beyond calendar, email, and tasks (e.g., Slack messages, GitHub PRs):

### 1. Extend WorkStateSnapshot

Add the new section to `src/types/snapshot.ts`:

```typescript
interface WorkStateSnapshot {
  // ... existing fields ...

  slack?: {
    unread_channels: SlackChannel[];
    mentions: SlackMention[];
  };
}
```

### 2. Add a Provider

Create the provider in `src/providers/`.

### 3. Update syncAll

Add the provider to the `Promise.allSettled` call.

### 4. Update formatSnapshot

Add a new section to `formatSnapshot()` in `src/client.ts` so the data appears in the injected context:

```typescript
if (s.slack) {
  lines.push('\n[SLACK — UNREAD]');
  for (const ch of s.slack.unread_channels) {
    lines.push(`  • #${ch.name}: ${ch.unread_count} unread`);
  }
}
```

### 5. Update Meta Sources

Add the new source name to the `meta.sources` union type:

```typescript
sources: Array<'gmail' | 'gcal' | 'notion' | 'slack'>;
```

---

## Design Principles

When extending ZeroCall, keep these principles in mind:

1. **Read-only** — providers should only read data, never write. This keeps auth scopes minimal and demos safe.

2. **Resilient** — use `Promise.allSettled` so one provider's failure doesn't block others. Record errors in `meta.errors`.

3. **Schema-agnostic** — when possible, extract data by type rather than by property name (see the Notion provider's `extractTitle`/`extractDate`/`extractStatus` pattern).

4. **Token-efficient** — the snapshot is injected into every system prompt. Keep the formatted output compact and avoid including raw JSON or unnecessary detail.

5. **Swappable** — implement the `TaskProvider` interface so providers can be swapped without changing the sync or injection logic.
