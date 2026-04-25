import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { AgentRun, ToolCallRecord } from './types.js';

/** Tool call handler — may be sync (demo/mock) or async (live/real APIs). */
export type ToolCallHandler = (
  name: string,
  input: Record<string, unknown>,
) => unknown | Promise<unknown>;

/**
 * Runs an agentic tool-use loop: sends the prompt to Claude with tools,
 * dispatches tool calls via the provided handler, and loops until end_turn.
 *
 * @param client - Anthropic SDK client instance.
 * @param prompt - The user's question.
 * @param tools - Tool definitions to pass to the API.
 * @param handleToolCall - Dispatcher that executes tool calls (mock or live).
 * @returns AgentRun capturing all tool calls, tokens, latency, and final response.
 */
export async function runAgentLoop(
  client: Anthropic,
  prompt: string,
  tools: Tool[],
  handleToolCall: ToolCallHandler,
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
      const result = await handleToolCall(block.name, block.input as Record<string, unknown>);
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
