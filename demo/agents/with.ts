import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { OneCallAnthropic } from '@onecall/harness';
import { MOCK_SNAPSHOT } from '../data/mock.js';
import type { AgentRun } from './without.js';

/**
 * Runs a single productivity prompt through the OneCall harness.
 *
 * Unlike the raw-tools agent, this function passes NO tools and NO system
 * prompt. The OneCallAnthropic client intercepts the outgoing request via
 * prepareOptions() and splices the current WorkStateSnapshot into the system
 * prompt automatically. Claude answers in a single generation pass.
 *
 * Result: 0 tool calls, 1 LLM turn.
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
  // Construct OneCallAnthropic internally so the harness injection always fires,
  // regardless of what client the caller passed.
  // In the demo, snapshotGetter returns MOCK_SNAPSHOT.
  // In production, pass readLatestSnapshot from src/db/snapshot.ts instead.
  const client = new OneCallAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    snapshotGetter: () => MOCK_SNAPSHOT,
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
