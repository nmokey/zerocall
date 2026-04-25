import { Client } from '@notionhq/client';
import type { TaskProvider } from './types.js';
import type { Task } from '../types/snapshot.js';

export class NotionProvider implements TaskProvider {
  name = 'notion' as const;
  private client: Client;
  private databaseId: string;

  constructor() {
    this.client = new Client({ auth: process.env.NOTION_TOKEN! });
    this.databaseId = process.env.NOTION_DATABASE_ID!;
  }

  async getTasks(): Promise<{ overdue: Task[]; due_today: Task[]; in_progress: Task[] }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (this.client as any).search({
      filter: { value: 'page', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 100,
    });

    const overdue: Task[] = [];
    const due_today: Task[] = [];
    const in_progress: Task[] = [];

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const page of response.results) {
      if (page.object !== 'page') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = (page as any).properties as Record<string, any>;

      const title = extractTitle(props);
      if (!title) continue;

      const due = extractDate(props);
      const status = extractStatus(props);
      const url = (page as { url?: string }).url;

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
