import Anthropic from '@anthropic-ai/sdk';
import { ZeroCallAnthropic } from '@zerocall/harness';
import type { WorkStateSnapshot, SectionConfig } from '@zerocall/harness';
import type { AgentRun } from './types.js';

interface RunWithZeroCallOptions {
  queryLogger?: (queryText: string) => void;
  configGetter?: () => SectionConfig | null;
}

/**
 * Creates a runWithZeroCall function bound to a specific snapshotGetter.
 *
 * Demo passes `() => MOCK_SNAPSHOT`; live passes a function that reads from
 * SQLite via ensureFreshSnapshot(). Optional queryLogger and configGetter
 * enable adaptive prompt management in live environments.
 *
 * @param snapshotGetter - Returns the current WorkStateSnapshot (or null).
 * @param options - Optional queryLogger and configGetter for adaptive features.
 * @returns An agent function with signature (client, prompt) => Promise<AgentRun>.
 */
export function createRunWithZeroCall(
  snapshotGetter: () => WorkStateSnapshot | null | Promise<WorkStateSnapshot | null>,
  options: RunWithZeroCallOptions = {},
): (_client: Anthropic, prompt: string) => Promise<AgentRun> {
  return async (_client: Anthropic, prompt: string): Promise<AgentRun> => {
    const client = new ZeroCallAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      snapshotGetter,
      queryLogger: options.queryLogger,
      configGetter: options.configGetter,
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
