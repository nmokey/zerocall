import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { OneCallAnthropic } from '../../src/client.js';
import { readLatestSnapshot } from '../../src/db/snapshot.js';
import type { AgentRun } from '../../demo/agents/without.js';

/**
 * Runs a single productivity prompt through the OneCall harness against the
 * live SQLite snapshot.
 *
 * Requires a populated database — run `npm start` first so the background sync
 * writes at least one snapshot. Throws if no snapshot is found.
 *
 * @param _client - Unused; kept for API compatibility with runWithoutOneCall.
 *   OneCallAnthropic is constructed internally so injection always fires.
 * @param prompt - The user's productivity question.
 * @returns AgentRun with toolCalls=[], llmTurns=1, snapshotInjected=true.
 */
export async function runWithOneCall(
  _client: Anthropic,
  prompt: string
): Promise<AgentRun> {
  const client = new OneCallAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    snapshotGetter: () => {
      const snapshot = readLatestSnapshot();
      if (!snapshot) throw new Error('No snapshot found. Run `npm start` first to populate the database.');
      return snapshot;
    },
  });

  const startTime = Date.now();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
    // No tools. No system prompt. The harness injects the snapshot.
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
}
