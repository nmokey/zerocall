/** Typed fetch wrappers for all /api/* endpoints. */

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).error ?? ((body as any).errors as string[] | undefined)?.[0] ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── Status & Config ──────────────────────────────────────────────────────────

export interface ApiStatus {
  configured: boolean;
  authenticated: boolean;
  lastSync: string | null;
  lastSyncSuccess: boolean | null;
}

export interface ApiConfig {
  present: string[];
  missing: string[];
  values: Record<string, string>;
  integrations: {
    gmail: boolean;
    calendar: boolean;
    notion: boolean;
  };
}

export function getStatus(): Promise<ApiStatus> {
  return apiFetch('/api/status');
}

export function getConfig(): Promise<ApiConfig> {
  return apiFetch('/api/config');
}

export function postConfig(values: Record<string, unknown>): Promise<{ ok: true }> {
  return apiFetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}

export function triggerSync(): Promise<{ started: true }> {
  return apiFetch('/api/sync', { method: 'POST' });
}

export function getGoogleAuthUrl(): Promise<{ url: string }> {
  return apiFetch('/api/auth/google');
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

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
  source: 'notion' | 'linear' | 'todoist';
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
    sources: Array<'gmail' | 'gcal' | 'notion'>;
    errors: string[];
  };
}

export function getSnapshot(): Promise<WorkStateSnapshot | null> {
  return apiFetch('/api/snapshot');
}

// ─── Trace ────────────────────────────────────────────────────────────────────

export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  latencyMs: number;
}

export interface AgentRun {
  toolCalls: ToolCallRecord[];
  finalResponse: string;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  llmTurns: number;
  snapshotInjected: boolean;
}

export interface TraceResult {
  prompt: string;
  without: AgentRun;
  with: AgentRun;
  deltas: {
    toolCallsPct: number;
    llmTurnsPct: number;
    latencyPct: number;
    tokensPct: number;
  };
}

export function runTrace(prompt: string): Promise<TraceResult> {
  return apiFetch('/api/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
}

// ─── Adaptive ─────────────────────────────────────────────────────────────────

export interface AdaptiveSuggestion {
  section: 'calendar' | 'email' | 'tasks';
  action: 'disable';
  relevanceScore: number;
  projectedTokenSavings: number;
}

export interface AdaptiveStats {
  queryCount: number;
  categoryDistribution: Record<string, number>;
  sectionRelevance: Record<string, number>;
  currentConfig: Record<'calendar' | 'email' | 'tasks', boolean>;
  suggestions: AdaptiveSuggestion[];
}

export function getAdaptiveStats(): Promise<AdaptiveStats> {
  return apiFetch('/api/adaptive/stats');
}

export function applyAdaptiveSection(section: string, enabled: boolean): Promise<{ ok: true }> {
  return apiFetch('/api/adaptive/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, enabled }),
  });
}
