import Anthropic from '@anthropic-ai/sdk';
import { OneCallAnthropic } from '@onecall/harness';
import type { WorkStateSnapshot } from '@onecall/harness';
import type { AgentRun } from './types.js';

/**
 * Creates a runWithOneCall function bound to a specific snapshotGetter.
 *
 * Demo passes `() => MOCK_SNAPSHOT`; live passes a function that reads from
 * SQLite via readLatestSnapshot().
 *
 * @param snapshotGetter - Returns the current WorkStateSnapshot (or null).
 * @returns An agent function with signature (client, prompt) => Promise<AgentRun>.
 */
export function createRunWithOneCall(
  snapshotGetter: () => WorkStateSnapshot | null | Promise<WorkStateSnapshot | null>,
): (_client: Anthropic, prompt: string) => Promise<AgentRun> {
  return async (_client: Anthropic, prompt: string): Promise<AgentRun> => {
    const client = new OneCallAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      snapshotGetter,
    });

    const startTime = Date.now();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const finalResponse = textBlock?.type === 'text' ? textBlock.text : '';

    return {
      toolCalls: [],
      finalResponse,
      totalLatencyMs: Date.now() - startTime,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      llmTurns: 1,
      snapshotInjected: true,
    };
  };
}
