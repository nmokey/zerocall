/**
 * Runs both agents against a prompt and returns a structured TraceResult for
 * the /api/trace endpoint. Both agents run in parallel.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentRun } from './agents.js';
import { runWithoutZeroCall, runWithZeroCall } from './agents.js';

export type { AgentRun };

export interface TraceResult {
  prompt: string;
  without: AgentRun;
  with: AgentRun;
  deltas: {
    toolCallsPct: number;
    llmTurnsPct: number;
    latencyPct: number;
    tokensPct: number;
  };
}

/** Computes the percentage reduction from `from` to `to`, clamped to 0 when from=0. */
function pctReduction(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round((from - to) / from * 100);
}

/**
 * Runs both agents in parallel and returns a TraceResult.
 *
 * @param prompt - The user's productivity question.
 * @returns TraceResult with both AgentRun records and computed deltas.
 * @throws If ANTHROPIC_API_KEY is not set or either agent fails.
 */
export async function runTraceComparison(prompt: string): Promise<TraceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey });
  const [without, with_] = await Promise.all([
    runWithoutZeroCall(client, prompt),
    runWithZeroCall(client, prompt),
  ]);

  const withoutTokens = without.inputTokens + without.outputTokens;
  const withTokens = with_.inputTokens + with_.outputTokens;

  return {
    prompt,
    without,
    with: with_,
    deltas: {
      toolCallsPct: pctReduction(without.toolCalls.length, with_.toolCalls.length),
      llmTurnsPct: pctReduction(without.llmTurns, with_.llmTurns),
      latencyPct: pctReduction(without.totalLatencyMs, with_.totalLatencyMs),
      tokensPct: pctReduction(withoutTokens, withTokens),
    },
  };
}
