import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';
import { runAgentLoop } from '../../shared/agentLoop.js';
import { getAuthenticatedClient } from '../../server/src/auth/google.js';
import { fetchEmailState } from '../../server/src/providers/gmail.js';
import { fetchCalendarState } from '../../server/src/providers/calendar.js';
import { NotionProvider } from '../../server/src/providers/notion.js';

export type { AgentRun, ToolCallRecord } from '../../shared/types.js';

const RAW_TOOLS: Tool[] = [
  {
    name: 'gmail_search_threads',
    description: 'Search Gmail threads matching a query. Returns matching email threads with subject, sender, and snippet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "newer_than:2d is:unread")' },
        max_results: { type: 'number', description: 'Maximum number of threads to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_get_thread',
    description: 'Fetch a specific Gmail thread by ID, including all messages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        thread_id: { type: 'string', description: 'The Gmail thread ID' },
      },
      required: ['thread_id'],
    },
  },
  {
    name: 'calendar_list_events',
    description: `List Google Calendar events in a time range. Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        time_min: { type: 'string', description: 'Start of time range (ISO 8601)' },
        time_max: { type: 'string', description: 'End of time range (ISO 8601)' },
        query: { type: 'string', description: 'Optional text search within event titles' },
      },
      required: ['time_min', 'time_max'],
    },
  },
  {
    name: 'notion_query_database',
    description: `Query the user's Notion task database (ID: ${process.env.NOTION_DATABASE_ID}).`,
    input_schema: {
      type: 'object' as const,
      properties: {
        database_id: { type: 'string', description: 'The Notion database ID to query' },
        filter: { type: 'object', description: 'Optional Notion filter object' },
      },
      required: ['database_id'],
    },
  },
];

/**
 * Runs a single productivity prompt through the raw-tool agent using real API calls.
 *
 * Authenticates once with Google OAuth, fetches Gmail state once and caches it
 * for the duration of this call. Each tool invocation hits the live API.
 * Errors from auth or provider calls propagate to the caller.
 *
 * @param client - Anthropic client to use for LLM calls.
 * @param prompt - The user's productivity question.
 * @returns AgentRun with real tool call records and final response.
 */
export async function runWithoutOneCall(
  client: Anthropic,
  prompt: string,
) {
  const auth = await getAuthenticatedClient();

  let emailState: Awaited<ReturnType<typeof fetchEmailState>> | null = null;
  async function getEmailState() {
    if (!emailState) emailState = await fetchEmailState(auth);
    return emailState;
  }

  let notionTasks: Awaited<ReturnType<InstanceType<typeof NotionProvider>['getTasks']>> | null = null;
  async function getNotionTasks() {
    if (!notionTasks) notionTasks = await new NotionProvider().getTasks();
    return notionTasks;
  }

  async function handleToolCall(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'gmail_search_threads': {
        const state = await getEmailState();
        const threads = [...state.action_required, ...state.awaiting_reply];
        return {
          threads: threads.map(t => ({
            thread_id: t.thread_id,
            subject: t.subject,
            from: t.counterparty,
            snippet: t.snippet,
            last_message_at: t.last_message_at,
          })),
        };
      }

      case 'gmail_get_thread': {
        const state = await getEmailState();
        const threads = [...state.action_required, ...state.awaiting_reply];
        const thread = threads.find(t => t.thread_id === input.thread_id);
        return thread ?? { error: 'Thread not found' };
      }

      case 'calendar_list_events': {
        const state = await fetchCalendarState(auth);
        return { events: [...state.today, ...state.upcoming_deadlines] };
      }

      case 'notion_query_database': {
        const tasks = await getNotionTasks();
        return { results: [...tasks.overdue, ...tasks.due_today, ...tasks.in_progress] };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  return runAgentLoop(client, prompt, RAW_TOOLS, handleToolCall);
}
