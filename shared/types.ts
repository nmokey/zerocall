/** Captures the full result of running a single prompt through an agent. */
export interface AgentRun {
  toolCalls: ToolCallRecord[];
  finalResponse: string;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Number of LLM API calls made during this run (agentic loop turns). */
  llmTurns?: number;
  /** Whether the work context was auto-injected by the harness rather than fetched via tool calls. */
  snapshotInjected?: boolean;
}

/** Records a single tool invocation during an agent run. */
export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  latencyMs: number;
}
