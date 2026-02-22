import type { GenerateContentParameters } from "@google/genai";
import type { z } from "zod";

export type JsonObject = Record<string, unknown>;

export interface ToolExecutionContext {
  now: Date;
}

export interface ToolDefinition<
  Args extends JsonObject = JsonObject,
  Result = unknown,
> {
  name: string;
  description: string;
  argsSchema: z.ZodType<Args>;
  execute: (args: Args, context: ToolExecutionContext) => Promise<Result> | Result;
}

export interface ToolCallRecord {
  toolName: string;
  args: JsonObject;
  result: unknown;
  repaired: boolean;
}

export interface RunnerTraceStep {
  kind: string;
  detail: string;
  data?: JsonObject;
}

export interface RunnerResult {
  strategy: "structured-json" | "single-tool-router" | "hybrid-repair";
  finalText: string;
  toolCalls: ToolCallRecord[];
  trace: RunnerTraceStep[];
}

export interface ModelFunctionCall {
  id?: string;
  name?: string;
  args?: unknown;
}

export interface ModelResult {
  text: string;
  functionCalls: ModelFunctionCall[];
  raw: unknown;
}

export interface ModelClient {
  generateContent(request: GenerateContentParameters): Promise<ModelResult>;
}

