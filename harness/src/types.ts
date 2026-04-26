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

export interface SlackDM {
  channel_id: string;
  /** For MPIMs, the auto-generated channel name or a member-list summary. */
  channel_name: string;
  /** Resolved display name(s), prefixed with @. MPIMs: comma-joined, capped at 3 + "and N others". */
  counterparty: string;
  last_message_at: string;
  /** First 120 chars of the last message text. */
  snippet: string;
  /** ISO 8601 — set only for dm_awaiting_reply entries. */
  waiting_since?: string;
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

  /**
   * Slack DM state. Optional — only present when SLACK_USER_TOKEN is configured
   * and the sync succeeded. All existing callers that omit this field continue
   * to compile and run correctly.
   */
  slack?: {
    dm_action_required: SlackDM[];
    dm_awaiting_reply: SlackDM[];
    workspace_name: string;
  };

  meta: {
    sync_duration_ms: number;
    sources: Array<'gmail' | 'gcal' | 'notion' | 'slack'>;
    errors: string[];
  };
}
