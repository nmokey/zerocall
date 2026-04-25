import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import { MOCK_SNAPSHOT } from '../data/mock.js';
import type { AgentRun, ToolCallRecord } from './without.js';

const ONECALL_TOOLS: Tool[] = [
  {
    name: 'get_work_state',
    description:
      "Returns a pre-computed, structured snapshot of the user's current work context — calendar events, email threads requiring action, and tasks by status. Replaces separate calendar, email, and task tool calls. Data is refreshed every 15 minutes in the background.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'trigger_sync',
    description:
      'Forces an immediate re-sync of all data sources outside the normal polling interval. Use when the user reports stale data.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// In mock mode, return the pre-built snapshot.
// In live mode, this would call the running OneCall MCP server.
function handleToolCall(name: string): unknown {
  if (name === 'get_work_state' || name === 'trigger_sync') {
    return MOCK_SNAPSHOT;
  }
  return { error: `Unknown tool: ${name}` };
}

export async function runWithOneCall(
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

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: ONECALL_TOOLS,
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
      const result = handleToolCall(block.name);
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
  };
}
