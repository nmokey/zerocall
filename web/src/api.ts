export interface Status {
  configured: boolean;
  authenticated: boolean;
  lastSync: string | null;
  lastSyncSuccess: boolean | null;
}

export interface ConfigStatus {
  present: string[];
  missing: string[];
  integrations: {
    gmail: boolean;
    calendar: boolean;
    notion: boolean;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
  meeting_link?: string;
}

export interface TimeBlock {
  start: string;
  end: string;
  duration_minutes: number;
}

export interface EmailThread {
  thread_id: string;
  subject: string;
  counterparty: string;
  last_message_at: string;
  snippet: string;
  waiting_since?: string;
}

export interface Task {
  id: string;
  title: string;
  due?: string;
  status: string;
  url?: string;
  source: string;
}

export interface WorkStateSnapshot {
  as_of: string;
  calendar: {
    today: CalendarEvent[];
    free_blocks: TimeBlock[];
    upcoming_deadlines: CalendarEvent[];
  };
  email: {
    action_required: EmailThread[];
    awaiting_reply: EmailThread[];
    unread_count: number;
  };
  tasks: {
    overdue: Task[];
    due_today: Task[];
    in_progress: Task[];
  };
  meta: {
    sync_duration_ms: number;
    sources: string[];
    errors: string[];
  };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const getStatus = () => apiFetch<Status>('/api/status');

export const getConfig = () => apiFetch<ConfigStatus>('/api/config');

export const postConfig = (values: Record<string, string> & { integrations?: { gmail: boolean; calendar: boolean; notion: boolean } }) =>
  apiFetch<{ ok?: boolean; errors?: string[] }>('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });

export const getSnapshot = () => apiFetch<WorkStateSnapshot | null>('/api/snapshot');

export const triggerSync = () =>
  apiFetch<{ started: boolean }>('/api/sync', { method: 'POST' });

export const getGoogleAuthUrl = () =>
  apiFetch<{ url: string }>('/api/auth/google').then(d => d.url);
