import type { TaskProvider } from './types.js';
import type { Task } from '@zerocall/harness';
import { todayLocalDate } from '@zerocall/harness';

export class NotionProvider implements TaskProvider {
  name = 'notion' as const;
  private token: string;
  private databaseId: string;

  constructor() {
    this.token = process.env.NOTION_TOKEN!;
    this.databaseId = process.env.NOTION_DATABASE_ID!;
  }

  async getTasks(): Promise<{ overdue: Task[]; due_today: Task[]; in_progress: Task[] }> {
    // client.request() is broken in @notionhq/client v5 for database queries
    // (returns invalid_request_url). Use fetch directly against the REST endpoint.
    const res = await fetch(`https://api.notion.com/v1/databases/${this.databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        page_size: 100,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API error ${res.status}: ${text}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await res.json() as { results: Array<{ id: string; object: string; properties: Record<string, any>; url?: string }> };

    const overdue: Task[] = [];
    const due_today: Task[] = [];
    const in_progress: Task[] = [];

    const todayStr = todayLocalDate();

    for (const page of response.results) {
      if (page.object !== 'page') continue;
      const props = page.properties;

      const title = extractTitle(props);
      if (!title) continue;

      const due = extractDate(props);
      const status = extractStatus(props);
      const url = page.url;

      const task: Task = {
        id: page.id,
        title,
        due: due ?? undefined,
        status: status ?? 'Unknown',
        url: url ?? undefined,
        source: 'notion',
      };

      if (due && due < todayStr) {
        overdue.push(task);
      } else if (due === todayStr) {
        due_today.push(task);
      } else {
        in_progress.push(task);
      }
    }

    return { overdue, due_today, in_progress };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTitle(props: Record<string, any>): string | null {
  for (const val of Object.values(props)) {
    if (val?.type === 'title' && Array.isArray(val.title)) {
      return val.title.map((t: { plain_text?: string }) => t.plain_text ?? '').join('') || null;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDate(props: Record<string, any>): string | null {
  for (const val of Object.values(props)) {
    if (val?.type === 'date' && val.date?.start) {
      return val.date.start as string;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStatus(props: Record<string, any>): string | null {
  for (const val of Object.values(props)) {
    if (val?.type === 'status' && val.status?.name) return val.status.name as string;
    if (val?.type === 'select' && val.select?.name) return val.select.name as string;
  }
  return null;
}
