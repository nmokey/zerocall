import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { runWithoutOneCall } from './agents/without.js';
import { runWithOneCall } from './agents/with.js';
import { PROMPTS } from './prompts.js';

interface Result {
  id: string;
  prompt: string;
  withoutToolCalls: number;
  withToolCalls: number;
  withoutLlmTurns: number;
  withLlmTurns: number;
  withoutLatencyMs: number;
  withLatencyMs: number;
  withoutTokens: number;
  withTokens: number;
}

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
}

function rpad(s: string, n: number) {
  return s.padStart(n);
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const results: Result[] = [];

  console.log(`\nRunning benchmark across ${PROMPTS.length} prompts...\n`);

  for (const prompt of PROMPTS) {
    process.stdout.write(`  [${prompt.id}] ${prompt.text.slice(0, 50)}...`);

    const [without, with_] = await Promise.all([
      runWithoutOneCall(client, prompt.text),
      runWithOneCall(client, prompt.text),
    ]);

    results.push({
      id: prompt.id,
      prompt: prompt.text,
      withoutToolCalls: without.toolCalls.length,
      withToolCalls: with_.toolCalls.length,
      withoutLlmTurns: without.llmTurns ?? 1,
      withLlmTurns: with_.llmTurns ?? 1,
      withoutLatencyMs: without.totalLatencyMs,
      withLatencyMs: with_.totalLatencyMs,
      withoutTokens: without.inputTokens + without.outputTokens,
      withTokens: with_.inputTokens + with_.outputTokens,
    });

    process.stdout.write(` done\n`);

    if (prompt !== PROMPTS[PROMPTS.length - 1]) {
      await sleep(15000);
    }
  }

  // Aggregate
  const totalWithout = results.reduce((s, r) => s + r.withoutToolCalls, 0);
  const totalWith = results.reduce((s, r) => s + r.withToolCalls, 0);
  const totalTurnsWithout = results.reduce((s, r) => s + r.withoutLlmTurns, 0);
  const totalTurnsWith = results.reduce((s, r) => s + r.withLlmTurns, 0);
  const avgLatWithout = results.reduce((s, r) => s + r.withoutLatencyMs, 0) / results.length;
  const avgLatWith = results.reduce((s, r) => s + r.withLatencyMs, 0) / results.length;
  const avgTokWithout = results.reduce((s, r) => s + r.withoutTokens, 0) / results.length;
  const avgTokWith = results.reduce((s, r) => s + r.withTokens, 0) / results.length;
  const toolCallReduction = ((totalWithout - totalWith) / totalWithout * 100).toFixed(1);
  const turnReduction = ((totalTurnsWithout - totalTurnsWith) / totalTurnsWithout * 100).toFixed(1);
  const latencyReduction = ((avgLatWithout - avgLatWith) / avgLatWithout * 100).toFixed(1);
  const tokenReduction = ((avgTokWithout - avgTokWith) / avgTokWithout * 100).toFixed(1);
  const avgTurnsWithout = (totalTurnsWithout / results.length).toFixed(1);
  const avgTurnsWith = (totalTurnsWith / results.length).toFixed(1);

  // Print table
  const cols = {
    id: 4,
    prompt: 42,
    wo: 8,
    wi: 6,
    woTurns: 8,
    wiTurns: 6,
    woLat: 10,
    wiLat: 8,
    woTok: 10,
    wiTok: 8,
  };

  const header = [
    pad('ID', cols.id),
    pad('Prompt', cols.prompt),
    rpad('W/o calls', cols.wo),
    rpad('W/ calls', cols.wi),
    rpad('W/o turns', cols.woTurns),
    rpad('W/ turns', cols.wiTurns),
    rpad('W/o ms', cols.woLat),
    rpad('W/ ms', cols.wiLat),
    rpad('W/o tokens', cols.woTok),
    rpad('W/ tokens', cols.wiTok),
  ].join('  ');

  const sep = '-'.repeat(header.length);

  console.log(`\n${sep}`);
  console.log(header);
  console.log(sep);

  for (const r of results) {
    console.log([
      pad(r.id, cols.id),
      pad(r.prompt, cols.prompt),
      rpad(String(r.withoutToolCalls), cols.wo),
      rpad(String(r.withToolCalls), cols.wi),
      rpad(String(r.withoutLlmTurns), cols.woTurns),
      rpad(String(r.withLlmTurns), cols.wiTurns),
      rpad(String(r.withoutLatencyMs), cols.woLat),
      rpad(String(r.withLatencyMs), cols.wiLat),
      rpad(String(r.withoutTokens), cols.woTok),
      rpad(String(r.withTokens), cols.wiTok),
    ].join('  '));
  }

  console.log(sep);
  console.log(`
SUMMARY (${results.length} prompts)
  Tool call reduction:  ${toolCallReduction}%  (${totalWithout} → ${totalWith} total calls)
  LLM turn reduction:   ${turnReduction}%  (avg ${avgTurnsWithout} → ${avgTurnsWith} turns/query)
  Avg latency reduction: ${latencyReduction}%  (${avgLatWithout.toFixed(0)}ms → ${avgLatWith.toFixed(0)}ms)
  Avg token reduction:  ${tokenReduction}%  (${avgTokWithout.toFixed(0)} → ${avgTokWith.toFixed(0)} tokens/query)
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
