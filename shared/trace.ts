import Anthropic from '@anthropic-ai/sdk';
import type { AgentRun } from './types.js';
import { PROMPTS } from './prompts.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

function printHeader(title: string, color: string) {
  const width = 60;
  const line = '─'.repeat(width);
  console.log(`\n${color}${BOLD}┌${line}┐${RESET}`);
  const padding = Math.max(0, width - title.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  console.log(`${color}${BOLD}│${' '.repeat(left)}${title}${' '.repeat(right)}│${RESET}`);
  console.log(`${color}${BOLD}└${line}┘${RESET}`);
}

function printRun(label: string, color: string, run: AgentRun) {
  console.log(`\n${color}${BOLD}${label}${RESET}`);
  console.log(`${DIM}${'─'.repeat(60)}${RESET}`);

  if (run.snapshotInjected) {
    console.log(`  ${GREEN}${BOLD}✦ Work context auto-injected into system prompt${RESET}`);
    console.log(`  ${DIM}(0 tool calls — harness injected the snapshot before first token)${RESET}`);
  } else if (run.toolCalls.length === 0) {
    console.log(`  ${DIM}(no tool calls)${RESET}`);
  } else {
    run.toolCalls.forEach((tc, i) => {
      const args = Object.keys(tc.input).length > 0
        ? ' ' + JSON.stringify(tc.input).slice(0, 60)
        : '';
      console.log(
        `  ${color}${i + 1}.${RESET} ${BOLD}${tc.tool}${RESET}${DIM}${args}${RESET}  ${YELLOW}${tc.latencyMs}ms${RESET}`
      );
    });
  }

  console.log(`\n  ${DIM}Response:${RESET}`);
  const lines = run.finalResponse.split('\n');
  lines.slice(0, 6).forEach(l => console.log(`  ${WHITE}${l}${RESET}`));
  if (lines.length > 6) console.log(`  ${DIM}...${RESET}`);

  const llmTurnsStr = run.llmTurns !== undefined ? `  ${DIM}LLM turns: ${CYAN}${run.llmTurns}${RESET}` : '';
  console.log(`\n  ${DIM}Total latency: ${YELLOW}${run.totalLatencyMs}ms${RESET}  ${DIM}Tokens: ${CYAN}${run.inputTokens + run.outputTokens}${RESET}  ${DIM}Tool calls: ${color}${run.toolCalls.length}${RESET}${llmTurnsStr}`);
}

/** Agent function signatures that demo/ and live/ each provide. */
export interface TraceAgents {
  runWithoutOneCall: (client: Anthropic, prompt: string) => Promise<AgentRun>;
  runWithOneCall: (client: Anthropic, prompt: string) => Promise<AgentRun>;
}

/**
 * Runs one prompt through both agents and prints a color-coded side-by-side
 * trace with a delta summary.
 *
 * @param title - Header text (e.g. "OneCall Trace Demo" or "OneCall Live Trace").
 * @param agents - The agent functions to compare.
 */
export async function runTrace(title: string, agents: TraceAgents): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const arg = process.argv[2];
  const prompt = arg
    ? (PROMPTS.find(p => p.id === arg) ?? PROMPTS[parseInt(arg, 10) - 1] ?? PROMPTS[0])
    : PROMPTS[0];

  const client = new Anthropic({ apiKey });

  printHeader(title, CYAN);
  console.log(`\n${BOLD}Prompt:${RESET} "${prompt.text}"\n`);
  console.log(`Running both agents in parallel...`);

  const [without, with_] = await Promise.all([
    agents.runWithoutOneCall(client, prompt.text),
    agents.runWithOneCall(client, prompt.text),
  ]);

  printRun('WITHOUT OneCall  (raw tool calls)', RED, without);
  printRun('WITH OneCall  (harness injection)', GREEN, with_);

  const toolDelta = without.toolCalls.length - with_.toolCalls.length;
  const turnDelta = (without.llmTurns ?? 1) - (with_.llmTurns ?? 1);
  const latDelta = without.totalLatencyMs - with_.totalLatencyMs;
  const tokDelta = (without.inputTokens + without.outputTokens) - (with_.inputTokens + with_.outputTokens);
  const toolPct = without.toolCalls.length > 0
    ? (toolDelta / without.toolCalls.length * 100).toFixed(0)
    : '0';
  const turnPct = (without.llmTurns ?? 1) > 0
    ? (turnDelta / (without.llmTurns ?? 1) * 100).toFixed(0)
    : '0';
  const latPct = (latDelta / without.totalLatencyMs * 100).toFixed(0);
  const tokPct = (tokDelta / (without.inputTokens + without.outputTokens) * 100).toFixed(0);

  console.log(`\n${BOLD}${GREEN}─── Result ──────────────────────────────────────────${RESET}`);
  console.log(`  Tool calls:  ${RED}${without.toolCalls.length}${RESET} → ${GREEN}${with_.toolCalls.length}${RESET}  ${BOLD}(${toolPct}% fewer)${RESET}`);
  console.log(`  LLM turns:   ${RED}${without.llmTurns ?? 1}${RESET} → ${GREEN}${with_.llmTurns ?? 1}${RESET}  ${BOLD}(${turnPct}% fewer)${RESET}`);
  console.log(`  Latency:     ${RED}${without.totalLatencyMs}ms${RESET} → ${GREEN}${with_.totalLatencyMs}ms${RESET}  ${BOLD}(${latPct}% faster)${RESET}`);
  console.log(`  Tokens:      ${RED}${without.inputTokens + without.outputTokens}${RESET} → ${GREEN}${with_.inputTokens + with_.outputTokens}${RESET}  ${BOLD}(${tokPct}% fewer)${RESET}`);
  console.log();
}
