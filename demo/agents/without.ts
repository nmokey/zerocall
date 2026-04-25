import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import {
  MOCK_GMAIL_THREADS,
  MOCK_CALENDAR_EVENTS,
  MOCK_NOTION_TASKS,
} from '../data/mock.js';

export interface AgentRun {
  toolCalls: ToolCallRecord[];
  finalResponse: string;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Number of LLM API calls made during this run (agentic loop turns). */
  llmTurns?: number;
  /** Whether the work context was auto-injected by the harness rather than fetched via tool calls. */
  snapshotInjected?: boolean;
}

export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  latencyMs: number;
}

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
    description: 'List Google Calendar events in a time range.',
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
    description: 'Query a Notion database with optional filters.',
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

function handleToolCall(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'gmail_search_threads':
      return {
        threads: MOCK_GMAIL_THREADS.map(t => ({
          thread_id: t.thread_id,
          subject: t.subject,
          from: t.counterparty,
          snippet: t.snippet,
          last_message_at: t.last_message_at,
        })),
      };

    case 'gmail_get_thread': {
      const thread = MOCK_GMAIL_THREADS.find(t => t.thread_id === input.thread_id);
      return thread ?? { error: 'Thread not found' };
    }

    case 'calendar_list_events':
      return { events: MOCK_CALENDAR_EVENTS };

    case 'notion_query_database':
      return {
        results: MOCK_NOTION_TASKS.map(t => ({
          id: t.id,
          properties: {
            Name: { title: [{ plain_text: t.title }] },
            Status: { select: { name: t.status } },
            Due: t.due ? { date: { start: t.due } } : null,
            URL: t.url ?? null,
          },
        })),
      };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function runWithoutOneCall(
  client: Anthropic,
  prompt: string
): Promise<AgentRun> {
  const startTime = Date.now();
  const toolCalls: ToolCallRecord[] = [];

  const messages: MessageParam[] = [
    { role: 'user', content: prompt },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let finalResponse = '';
  let llmTurns = 0;

  while (true) {
    llmTurns++;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: RAW_TOOLS,
      messages,
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      finalResponse = textBlock?.type === 'text' ? textBlock.text : '';
      break;
    }

    if (response.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const toolStart = Date.now();
      const result = handleToolCall(block.name, block.input as Record<string, unknown>);
      const latencyMs = Date.now() - toolStart;

      toolCalls.push({ tool: block.name, input: block.input as Record<string, unknown>, latencyMs });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    toolCalls,
    finalResponse,
    totalLatencyMs: Date.now() - startTime,
    inputTokens,
    outputTokens,
    llmTurns,
    snapshotInjected: false,
  };
}
