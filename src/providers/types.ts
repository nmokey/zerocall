import type { Task } from '../types/snapshot.js';

export interface TaskProvider {
  name: 'notion' | 'linear' | 'todoist';
  getTasks(): Promise<{
    overdue: Task[];
    due_today: Task[];
    in_progress: Task[];
  }>;
}
