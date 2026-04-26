import type { Task } from '@zerocall/harness';

export interface TaskProvider {
  name: 'notion' | 'linear' | 'todoist';
  getTasks(): Promise<{
    overdue: Task[];
    due_today: Task[];
    in_progress: Task[];
  }>;
}
