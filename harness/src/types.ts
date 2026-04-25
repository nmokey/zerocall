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
