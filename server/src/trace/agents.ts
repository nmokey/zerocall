/**
 * Agent implementations for the side-by-side trace comparison.
 *
 * Contains both runWithoutZeroCall (raw tool-call loop) and runWithZeroCall
 * (harness injection). The agent loop logic is inlined here because the server
 * build is scoped to src/ and cannot import from the shared/ directory.
 *
 * AgentRun / ToolCallRecord mirror the interfaces in shared/types.ts — keep in sync.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import { ZeroCallAnthropic, todayLocalDate } from '@zerocall/harness';
import { getAuthenticatedClient } from '../auth/google.js';
import { fetchEmailState } from '../providers/gmail.js';
import { fetchCalendarState } from '../providers/calendar.js';
import { NotionProvider } from '../providers/notion.js';
import { ensureFreshSnapshot } from '../sync/scheduler.js';
import { logQuery } from '../db/queryLog.js';
import { readAdaptiveConfig } from '../db/adaptiveConfig.js';

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

/**
 * Runs a tool-use agentic loop until Claude returns end_turn.
 *
 * @param onToolCall - Optional callback fired immediately when a tool call
 *   completes, before the loop continues. Used by the SSE stream endpoint to
 *   push live tool-call updates to the browser.
 */
async function runAgentLoop(
  client: Anthropic,
  prompt: string,
  tools: Tool[],
  handleToolCall: (name: string, input: Record<string, unknown>) => Promise<unknown>,
  onToolCall?: (record: ToolCallRecord) => void,
): Promise<AgentRun> {
  const startTime = Date.now();
  const toolCalls: ToolCallRecord[] = [];
  const messages: MessageParam[] = [{ role: 'user', content: prompt }];
  let inputTokens = 0;
  let outputTokens = 0;
  let finalResponse = '';
  let llmTurns = 0;

  while (true) {
    llmTurns++;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools,
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
      let result: unknown;
      try {
        result = await handleToolCall(block.name, block.input as Record<string, unknown>);
      } catch (err: any) {
        console.error(`[agent] tool call failed: ${block.name}:`, err);
        result = { error: `Tool ${block.name} failed: ${err?.message ?? String(err)}` };
      }
      const record: ToolCallRecord = { tool: block.name, input: block.input as Record<string, unknown>, latencyMs: Date.now() - toolStart };
      toolCalls.push(record);
      onToolCall?.(record);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { toolCalls, finalResponse, totalLatencyMs: Date.now() - startTime, inputTokens, outputTokens, llmTurns, snapshotInjected: false };
}

const enableNotion = process.env.ENABLE_NOTION !== 'false';

/** Builds the raw tool definitions for the without-ZeroCall agent, with today's date computed fresh per call. */
function buildRawTools(): Tool[] {
  const today = todayLocalDate(); // YYYY-MM-DD in user's configured timezone
  return [
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
      description: `List Google Calendar events in a time range. Today's date is ${today}.`,
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
    ...(enableNotion ? [{
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
    }] : []),
  ];
}

/**
 * Runs a productivity prompt through the raw-tool agent using real API calls.
 *
 * Authenticates once with Google OAuth, caches email state for the duration of
 * the call. Each tool invocation hits the live API.
 *
 * @param client - Anthropic client to use for LLM calls.
 * @param prompt - The user's productivity question.
 * @returns AgentRun with real tool call records and final response.
 */
export async function runWithoutZeroCall(client: Anthropic, prompt: string, onToolCall?: (record: ToolCallRecord) => void): Promise<AgentRun> {
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
        return { threads: threads.map(t => ({ thread_id: t.thread_id, subject: t.subject, from: t.counterparty, snippet: t.snippet, last_message_at: t.last_message_at })) };
      }
      case 'gmail_get_thread': {
        const state = await getEmailState();
        const threads = [...state.action_required, ...state.awaiting_reply];
        return threads.find(t => t.thread_id === input.thread_id) ?? { error: 'Thread not found' };
      }
      case 'calendar_list_events': {
        const state = await fetchCalendarState(auth);
        return { events: [...state.today, ...state.upcoming_deadlines] };
      }
      case 'notion_query_database': {
        if (!enableNotion) return { error: 'Notion integration is disabled' };
        const tasks = await getNotionTasks();
        return { results: [...tasks.overdue, ...tasks.due_today, ...tasks.in_progress] };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  return runAgentLoop(client, prompt, buildRawTools(), handleToolCall, onToolCall);
}

/**
 * Runs a productivity prompt through the ZeroCall harness.
 *
 * Ensures a fresh snapshot is available (either existing or newly synced),
 * then injects it via ZeroCallAnthropic before the first token. Zero tool calls.
 *
 * @param _client - Unused; ZeroCallAnthropic creates its own client with the snapshot getter.
 * @param prompt - The user's productivity question.
 * @returns AgentRun with snapshotInjected=true and no tool calls.
 */
export async function runWithZeroCall(_client: Anthropic, prompt: string): Promise<AgentRun> {
  const zcClient = new ZeroCallAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    snapshotGetter: () => ensureFreshSnapshot(),
    configGetter: readAdaptiveConfig,
    queryLogger: logQuery,
  });

  const startTime = Date.now();
  const response = await zcClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return {
    toolCalls: [],
    finalResponse: textBlock?.type === 'text' ? textBlock.text : '',
    totalLatencyMs: Date.now() - startTime,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    llmTurns: 1,
    snapshotInjected: true,
  };
}
