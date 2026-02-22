import { FunctionCallingConfigMode } from "@google/genai";

import type {
  ModelClient,
  RunnerResult,
  RunnerTraceStep,
  ToolCallRecord,
} from "./contracts";
import { createDemoToolRegistry } from "./demo-tools";
import { resolveEnvSettings } from "./env";
import {
  defaultGenerationSettings,
  type GenerationSettings,
} from "./generation-settings";
import { GoogleModelClient } from "./gemini-client";
import { runHybridRepairRunner } from "./runners/hybrid-repair-runner";
import { runSingleToolRouterRunner } from "./runners/single-tool-router-runner";
import { runStructuredJsonRunner } from "./runners/structured-json-runner";

export const STRATEGIES = [
  "structured-json",
  "single-tool-router",
  "hybrid-repair",
] as const;

export type Strategy = (typeof STRATEGIES)[number];

export interface StrategyRunConfig {
  strategy: Strategy;
  prompt: string;
  model: string;
  repairModel?: string;
  routerMaxTurns?: number;
  hybridMaxTurns?: number;
  maxRetries?: number;
  logs?: boolean;
  verbose?: boolean;
  generationSettings?: GenerationSettings;
  logger?: (line: string) => void;
  client?: ModelClient;
}

export interface PlaygroundResult extends RunnerResult {
  usedModel: string;
  usedStrategy: Strategy;
  attempts: number;
  durationMs: number;
  errors?: string[];
  verboseNotes?: string[];
}

export function getDefaultModel(): string {
  return process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
}

export async function resolveDefaultModel(): Promise<string> {
  const env = await resolveEnvSettings();
  return env.model ?? getDefaultModel();
}

export async function resolveApiKeyFromEnv(): Promise<string> {
  const resolved = await resolveEnvSettings();
  const apiKey = resolved.apiKey;
  if (!apiKey) {
    throw new Error(
      "Missing API key. Set GOOGLE_API_KEY or GEMINI_API_KEY before running.",
    );
  }
  normalizeProcessApiKeyEnv(apiKey);
  return apiKey;
}

export async function runStrategy(config: StrategyRunConfig): Promise<PlaygroundResult> {
  const logger = config.logger ?? (() => {});
  const maxRetries = Math.max(0, config.maxRetries ?? 0);
  const runLogs = Boolean(config.logs);
  const runVerbose = Boolean(config.verbose);
  const generationSettings = config.generationSettings ?? defaultGenerationSettings();

  let lastError: unknown;
  const errors: string[] = [];
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    if (runLogs) {
      logger(
        `[run] strategy=${config.strategy} model=${config.model} attempt=${attempt}/${maxRetries + 1}`,
      );
    }

    try {
      const result = await runStrategyOnce({
        ...config,
        generationSettings,
      });

      const durationMs = Date.now() - startedAt;
      const verboseNotes = runVerbose
        ? [
            `thinking=${generationSettings.thinking}`,
            `reasoningEffort=${generationSettings.reasoningEffort}`,
            `includeThoughts=${generationSettings.includeThoughts}`,
            `retriesUsed=${attempt - 1}`,
          ]
        : undefined;

      return {
        ...result,
        attempts: attempt,
        durationMs,
        errors: errors.length > 0 ? errors : undefined,
        verboseNotes,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (runLogs) {
        logger(`[error] attempt=${attempt} ${message}`);
      }
      if (attempt > maxRetries) {
        break;
      }
    }
  }

  const lastMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Run failed after ${maxRetries + 1} attempt(s): ${lastMessage}`,
  );
}

async function runStrategyOnce(
  config: StrategyRunConfig & { generationSettings: GenerationSettings },
): Promise<PlaygroundResult> {
  const client =
    config.client ?? new GoogleModelClient(await resolveApiKeyFromEnv());
  const registry = createDemoToolRegistry();

  if (config.strategy === "structured-json") {
    const result = await runStructuredJsonRunner(
      client,
      registry,
      config.prompt,
      { model: config.model, generationSettings: config.generationSettings },
    );
    return withMeta(result, config.strategy, config.model);
  }

  if (config.strategy === "single-tool-router") {
    const result = await runSingleToolRouterRunner(
      client,
      registry,
      config.prompt,
      {
        model: config.model,
        maxTurns: config.routerMaxTurns,
        generationSettings: config.generationSettings,
      },
    );
    return withMeta(result, config.strategy, config.model);
  }

  const result = await runHybridRepairRunner(client, registry, config.prompt, {
    model: config.model,
    repairModel: config.repairModel,
    maxTurns: config.hybridMaxTurns,
    functionCallingMode: FunctionCallingConfigMode.VALIDATED,
    generationSettings: config.generationSettings,
  });
  return withMeta(result, config.strategy, config.model);
}

function withMeta(
  result: {
    strategy: Strategy;
    finalText: string;
    toolCalls: ToolCallRecord[];
    trace: RunnerTraceStep[];
  },
  strategy: Strategy,
  model: string,
): PlaygroundResult {
  return {
    ...result,
    strategy,
    usedModel: model,
    usedStrategy: strategy,
    attempts: 1,
    durationMs: 0,
  };
}

let apiKeyEnvNormalized = false;

function normalizeProcessApiKeyEnv(apiKey: string): void {
  if (apiKeyEnvNormalized) {
    return;
  }

  // Keep one canonical key in-process to avoid SDK warnings when both are set.
  process.env.GOOGLE_API_KEY = apiKey;
  delete process.env.GEMINI_API_KEY;
  apiKeyEnvNormalized = true;
}
