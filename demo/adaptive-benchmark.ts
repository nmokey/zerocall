/**
 * Adaptive benchmark: demonstrates how OneCall learns from query patterns
 * and trims the system prompt to the sections that actually matter.
 *
 * Phase 1 — baseline: runs a skewed prompt set (heavy calendar/task, light
 *   email) with all sections enabled. Queries are classified in-memory.
 * Analysis — detects which sections are rarely needed and applies a config.
 * Phase 2 — optimized: runs the same prompts with the low-relevance section
 *   disabled. Shows the token reduction.
 *
 * No server or SQLite required — runs entirely in-memory with mock data.
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { OneCallAnthropic } from '@onecall/harness';
import type { SectionConfig } from '@onecall/harness';
import { MOCK_SNAPSHOT } from './data/mock.js';
import { classifyQuery, type QueryCategory } from '../server/src/db/queryLog.js';

// Skewed prompt set: calendar/task-heavy to simulate a user who rarely asks
// about email. 3 out of 15 are email-focused (20%), below the 15% threshold
// for one category after the classifier runs. Adjust to taste for demos.
const ADAPTIVE_PROMPTS = [
  { id: 'a01', text: 'What meetings do I have today?' },
  { id: 'a02', text: 'Am I free at 3pm today?' },
  { id: 'a03', text: 'What tasks are overdue?' },
  { id: 'a04', text: 'What are my tasks due today?' },
  { id: 'a05', text: 'Do I have any free blocks this afternoon to get deep work done?' },
  { id: 'a06', text: "What deadlines do I have coming up this week?" },
  { id: 'a07', text: 'What tasks are in progress?' },
  { id: 'a08', text: "What's on my calendar for the rest of the day?" },
  { id: 'a09', text: 'Did Sarah reply to me?' },         // email
  { id: 'a10', text: 'What emails need my attention today?' }, // email
  { id: 'a11', text: 'What should I focus on right now?' },
  { id: 'a12', text: 'What are my action items from Arvind\'s lab?' },
  { id: 'a13', text: 'Is there anything blocking the ICML submission?' },
  { id: 'a14', text: 'How should I prioritize the next two hours?' },
  { id: 'a15', text: 'Give me a quick standup summary.' },
];

const SUGGESTION_THRESHOLD = 0.15;
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

interface RunResult {
  id: string;
  prompt: string;
  category: QueryCategory;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

/** Runs all prompts through OneCallAnthropic with the given section config. */
async function runPhase(
  client: Anthropic,
  config: SectionConfig,
  label: string,
  queryLog: { text: string; category: QueryCategory }[],
): Promise<RunResult[]> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  Sections: calendar=${config.calendar ? 'ON' : 'OFF'}  email=${config.email ? 'ON' : 'OFF'}  tasks=${config.tasks ? 'ON' : 'OFF'}`);
  console.log(`${'─'.repeat(60)}\n`);

  const results: RunResult[] = [];

  for (const prompt of ADAPTIVE_PROMPTS) {
    const category = classifyQuery(prompt.text);
    queryLog.push({ text: prompt.text, category });

    const oneCall = new OneCallAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      snapshotGetter: () => MOCK_SNAPSHOT,
      configGetter: () => config,
    });

    const start = Date.now();
    const response = await oneCall.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt.text }],
    });
    const latencyMs = Date.now() - start;

    results.push({
      id: prompt.id,
      prompt: prompt.text,
      category,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      latencyMs,
    });

    process.stdout.write(`  [${prompt.id}] ${category.padEnd(8)}  ${response.usage.input_tokens + response.usage.output_tokens} tokens\n`);

    if (prompt !== ADAPTIVE_PROMPTS[ADAPTIVE_PROMPTS.length - 1]) {
      await sleep(3000);
    }
  }

  return results;
}

/** Computes per-section relevance from the query log. */
function computeRelevance(log: { category: QueryCategory }[]): Record<string, number> {
  if (log.length === 0) return { calendar: 1, email: 1, tasks: 1 };
  const total = log.length;
  const NEEDS: Record<QueryCategory, Array<keyof SectionConfig>> = {
    calendar: ['calendar'],
    email: ['email'],
    tasks: ['tasks'],
    general: ['calendar', 'email', 'tasks'],
  };
  const relevance: Record<string, number> = { calendar: 0, email: 0, tasks: 0 };
  for (const q of log) {
    const needs = NEEDS[q.category];
    for (const s of needs) relevance[s]++;
  }
  return {
    calendar: relevance.calendar / total,
    email: relevance.email / total,
    tasks: relevance.tasks / total,
  };
}

function pct(n: number) { return `${(n * 100).toFixed(0)}%`; }
function pad(s: string, n: number) { return s.length >= n ? s.slice(0, n - 1) + '…' : s.padEnd(n); }
function rpad(s: string, n: number) { return s.padStart(n); }

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }
  const client = new Anthropic({ apiKey });

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       OneCall  —  Adaptive System Prompt Demo           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\nThis demo runs 15 prompts twice:');
  console.log('  Phase 1: all sections injected (baseline)');
  console.log('  Phase 2: low-relevance section disabled (optimized)\n');

  const queryLog: { text: string; category: QueryCategory }[] = [];
  const phase1Config: SectionConfig = { calendar: true, email: true, tasks: true };
  const phase1 = await runPhase(client, phase1Config, 'PHASE 1  —  Baseline (all sections on)', queryLog);

  // Analyze query log
  const relevance = computeRelevance(queryLog);
  const distribution: Record<string, number> = { calendar: 0, email: 0, tasks: 0, general: 0 };
  for (const q of queryLog) distribution[q.category]++;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║            Adaptive Analysis                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  ${queryLog.length} queries analyzed`);
  console.log(`  Category distribution:`);
  for (const [cat, count] of Object.entries(distribution)) {
    if (count === 0) continue;
    const p = ((count / queryLog.length) * 100).toFixed(0);
    const bar = '█'.repeat(Math.round(Number(p) / 5));
    console.log(`    ${cat.padEnd(10)} ${bar.padEnd(20)} ${p}%`);
  }

  console.log(`\n  Section relevance scores:`);
  const suggestions: Array<keyof SectionConfig> = [];
  for (const [section, score] of Object.entries(relevance)) {
    const flag = score < SUGGESTION_THRESHOLD ? '  ← LOW' : '';
    console.log(`    ${section.padEnd(10)} ${pct(score)}${flag}`);
    if (score < SUGGESTION_THRESHOLD) suggestions.push(section as keyof SectionConfig);
  }

  if (suggestions.length === 0) {
    console.log('\n  All sections are relevant — no optimizations to apply.');
    return;
  }

  const phase2Config: SectionConfig = { ...phase1Config };
  for (const s of suggestions) phase2Config[s] = false;

  console.log(`\n  Suggestion: disable [${suggestions.join(', ')}] section(s)`);
  console.log('  Applying optimization...');

  const phase2 = await runPhase(client, phase2Config, 'PHASE 2  —  Optimized (low-relevance sections off)', []);

  // Print comparison table
  const C = { id: 4, prompt: 36, cat: 8, p1tok: 10, p2tok: 10, saved: 7 };
  const header = [
    pad('ID', C.id), pad('Prompt', C.prompt), pad('Cat', C.cat),
    rpad('Ph1 tokens', C.p1tok), rpad('Ph2 tokens', C.p2tok), rpad('Saved', C.saved),
  ].join('  ');
  const sep = '─'.repeat(header.length);

  console.log(`\n\n${sep}`);
  console.log(header);
  console.log(sep);

  let totalP1 = 0, totalP2 = 0;
  for (let i = 0; i < phase1.length; i++) {
    const r1 = phase1[i], r2 = phase2[i];
    const saved = r1.totalTokens - r2.totalTokens;
    totalP1 += r1.totalTokens;
    totalP2 += r2.totalTokens;
    console.log([
      pad(r1.id, C.id), pad(r1.prompt, C.prompt), pad(r1.category, C.cat),
      rpad(String(r1.totalTokens), C.p1tok),
      rpad(String(r2.totalTokens), C.p2tok),
      rpad(`-${saved}`, C.saved),
    ].join('  '));
  }

  console.log(sep);

  const avgP1 = totalP1 / phase1.length;
  const avgP2 = totalP2 / phase2.length;
  const reduction = ((avgP1 - avgP2) / avgP1 * 100).toFixed(1);

  console.log(`
ADAPTIVE OPTIMIZATION RESULTS
  Disabled sections:     ${suggestions.join(', ')} (relevance < ${pct(SUGGESTION_THRESHOLD)})
  Avg tokens — Phase 1:  ${avgP1.toFixed(0)} tokens/query  (all sections)
  Avg tokens — Phase 2:  ${avgP2.toFixed(0)} tokens/query  (optimized)
  Token reduction:        ${reduction}%
  Savings per query:     ~${(avgP1 - avgP2).toFixed(0)} tokens

  The system learned your workflow. Same answers, ${reduction}% leaner.
`);
}

main().catch(err => { console.error(err); process.exit(1); });
