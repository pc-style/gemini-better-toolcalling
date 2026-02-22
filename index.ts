import { defaultGenerationSettings, type ReasoningEffort } from "./src/generation-settings";
import { getModelOptions } from "./src/model-catalog";
import { PROMPT_PRESETS } from "./src/prompt-presets";
import type { PromptPreset } from "./src/prompt-presets";
import {
  STRATEGIES,
  getDefaultModel,
  runStrategy,
  type Strategy,
} from "./src/strategy-runner";
import { runBenchmark } from "./src/benchmark";
import { resolveEnvSettings } from "./src/env";

interface CommonCliSettings {
  model: string;
  repairModel?: string;
  routerMaxTurns?: number;
  hybridMaxTurns?: number;
  thinking: boolean;
  includeThoughts: boolean;
  reasoningEffort: ReasoningEffort;
  maxRetries: number;
  logs: boolean;
  verbose: boolean;
}

interface SingleRunOptions extends CommonCliSettings {
  mode: "single";
  strategy: Strategy;
  prompt: string;
}

interface BenchmarkOptions extends CommonCliSettings {
  mode: "benchmark";
  models: string[];
  strategies: Strategy[];
  presets: PromptPreset[];
  iterations: number;
}

type CliOptions = SingleRunOptions | BenchmarkOptions;

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usageMessage());
    return;
  }

  if (args.includes("--list-presets")) {
    for (const preset of PROMPT_PRESETS) {
      console.log(`${preset.id}: ${preset.title}`);
    }
    return;
  }

  if (args.includes("--list-models")) {
    const models = await getModelOptions();
    for (const model of models) {
      console.log(model);
    }
    return;
  }

  const env = await resolveEnvSettings();
  const options = parseArgs(args, env.model ?? getDefaultModel());
  if (options.logs) {
    console.error(`[env] source=${env.source}`);
  }

  const logger = options.logs ? (line: string) => console.error(line) : undefined;

  if (options.mode === "single") {
    const result = await runStrategy({
      strategy: options.strategy,
      prompt: options.prompt,
      model: options.model,
      repairModel: options.repairModel,
      routerMaxTurns: options.routerMaxTurns,
      hybridMaxTurns: options.hybridMaxTurns,
      generationSettings: {
        thinking: options.thinking,
        includeThoughts: options.includeThoughts,
        reasoningEffort: options.reasoningEffort,
      },
      maxRetries: options.maxRetries,
      logs: options.logs,
      verbose: options.verbose,
      logger,
    });

    if (options.verbose) {
      console.error(
        `[summary] strategy=${result.usedStrategy} model=${result.usedModel} attempts=${result.attempts} durationMs=${result.durationMs} toolCalls=${result.toolCalls.length}`,
      );
    }

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const benchmarkResult = await runBenchmark({
    models: options.models,
    strategies: options.strategies,
    presets: options.presets,
    iterations: options.iterations,
    maxRetries: options.maxRetries,
    logs: options.logs,
    verbose: options.verbose,
    generationSettings: {
      thinking: options.thinking,
      includeThoughts: options.includeThoughts,
      reasoningEffort: options.reasoningEffort,
    },
    routerMaxTurns: options.routerMaxTurns,
    hybridMaxTurns: options.hybridMaxTurns,
    logger,
  });

  if (options.verbose) {
    console.error(
      "strategy\tmodel\tsuccessRate\tavgMs\tp95Ms\tavgToolCalls\tavgRepaired\trepairRate\ttoolUseRate\tavgAttempts",
    );
    for (const row of benchmarkResult.aggregates) {
      console.error(
        `${row.strategy}\t${row.model}\t${(row.successRate * 100).toFixed(1)}%\t${row.avgDurationMs}\t${row.p95DurationMs}\t${row.avgToolCalls}\t${row.avgRepairedCalls}\t${(row.repairRate * 100).toFixed(1)}%\t${(row.toolUseRate * 100).toFixed(1)}%\t${row.avgAttempts}`,
      );
    }
    console.error("model\tstrategy\tdeltaSuccessPct\tdeltaMs\tdeltaToolCalls");
    for (const row of benchmarkResult.comparisons) {
      console.error(
        `${row.model}\t${row.strategy}\t-${row.deltaSuccessRate}\t+${row.deltaDurationMs}\t${row.deltaToolCalls >= 0 ? "+" : ""}${row.deltaToolCalls}`,
      );
    }
  }

  console.log(JSON.stringify(benchmarkResult, null, 2));
}

function parseArgs(args: string[], defaultModel: string): CliOptions {
  const shared = parseCommonSettings(args, defaultModel);
  const benchmarkMode = args.includes("--benchmark");

  if (benchmarkMode) {
    const models = parseModelListFlag(args, shared.model);
    const strategies = parseStrategyListFlag(args);
    const presets = parsePresetListFlag(args);
    const iterations = parseIntFlag(args, "--iterations=", 1);

    return {
      mode: "benchmark",
      ...shared,
      models,
      strategies,
      presets,
      iterations,
    };
  }

  const strategy = args[0] as Strategy | undefined;
  if (!strategy || !STRATEGIES.includes(strategy)) {
    const provided = strategy ? `'${strategy}'` : "none";
    throw new Error(
      `Invalid or missing strategy (${provided}). Expected one of: ${STRATEGIES.join(", ")}.\n\n${usageMessage()}`,
    );
  }

  const prompt = resolvePromptFromArgs(args.slice(1));
  if (prompt.length === 0) {
    throw new Error("Prompt is required. Provide a quoted prompt or use --preset=<preset-id>.\n\n" + usageMessage());
  }

  return {
    mode: "single",
    ...shared,
    strategy,
    prompt,
  };
}

function parseCommonSettings(args: string[], defaultModel: string): CommonCliSettings {
  const defaults = defaultGenerationSettings();
  const model = parseStringFlag(args, "--model=") ?? defaultModel;
  const repairModel = parseStringFlag(args, "--repair-model=");
  const routerMaxTurns = parseOptionalIntFlag(args, "--router-max-turns=");
  const hybridMaxTurns = parseOptionalIntFlag(args, "--hybrid-max-turns=");
  const maxRetries = parseIntFlag(args, "--max-retries=", 0);
  const logs = args.includes("--logs");
  const verbose = args.includes("--verbose");
  const includeThoughts = parseBoolFlag(args, "--include-thoughts=", defaults.includeThoughts);
  const thinking = parseBoolFlag(args, "--thinking=", defaults.thinking);
  const reasoningEffort = parseReasoningEffort(args) ?? defaults.reasoningEffort;

  return {
    model,
    repairModel,
    routerMaxTurns,
    hybridMaxTurns,
    maxRetries,
    logs,
    verbose,
    thinking,
    includeThoughts,
    reasoningEffort,
  };
}

function resolvePromptFromArgs(args: string[]): string {
  const promptParts: string[] = [];

  for (const token of args) {
    if (!token) {
      continue;
    }
    if (token.startsWith("--")) {
      if (token.startsWith("--preset=")) {
        const id = token.slice("--preset=".length);
        const preset = PROMPT_PRESETS.find((item) => item.id === id);
        if (!preset) {
          throw new Error(`Unknown preset '${id}'. Use --list-presets.`);
        }
        promptParts.length = 0;
        promptParts.push(preset.prompt);
      }
      continue;
    }
    promptParts.push(token);
  }

  return promptParts.join(" ").trim();
}

function parseModelListFlag(args: string[], fallback: string): string[] {
  const raw = parseStringFlag(args, "--models=");
  if (!raw) {
    return [fallback];
  }

  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return values.length > 0 ? values : [fallback];
}

function parseStrategyListFlag(args: string[]): Strategy[] {
  const raw = parseStringFlag(args, "--benchmark-strategies=");
  if (!raw || raw === "all") {
    return [...STRATEGIES];
  }

  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is Strategy => STRATEGIES.includes(item as Strategy));

  return values.length > 0 ? values : [...STRATEGIES];
}

function parsePresetListFlag(args: string[]): PromptPreset[] {
  const raw = parseStringFlag(args, "--benchmark-presets=");
  if (!raw || raw === "all") {
    return [...PROMPT_PRESETS];
  }

  const ids = new Set(raw.split(",").map((item) => item.trim()));
  const selected = PROMPT_PRESETS.filter((preset) => ids.has(preset.id));
  return selected.length > 0 ? selected : [...PROMPT_PRESETS];
}

function parseStringFlag(args: string[], prefix: string): string | undefined {
  const token = args.find((item) => item.startsWith(prefix));
  if (!token) {
    return undefined;
  }
  return token.slice(prefix.length);
}

function parseOptionalIntFlag(args: string[], prefix: string): number | undefined {
  const token = parseStringFlag(args, prefix);
  if (!token) {
    return undefined;
  }
  const value = Number(token);
  if (Number.isNaN(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function parseIntFlag(args: string[], prefix: string, defaultValue: number): number {
  const value = parseOptionalIntFlag(args, prefix);
  return value ?? defaultValue;
}

function parseBoolFlag(args: string[], prefix: string, defaultValue: boolean): boolean {
  const raw = parseStringFlag(args, prefix);
  if (!raw) {
    return defaultValue;
  }
  const normalized = raw.toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return defaultValue;
}

function parseReasoningEffort(args: string[]): ReasoningEffort | undefined {
  const raw = parseStringFlag(args, "--reasoning-effort=");
  if (!raw) {
    return undefined;
  }

  const normalized = raw.toLowerCase();
  if (
    normalized === "minimal" ||
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high"
  ) {
    return normalized;
  }

  return undefined;
}

function usageMessage(): string {
  return [
    "Gemini Tool-Call Reliability Playground CLI",
    "",
    "Usage (single run):",
    "bun run index.ts <structured-json|single-tool-router|hybrid-repair> \"<prompt>\" [flags]",
    "",
    "Usage (benchmark):",
    "bun run index.ts --benchmark [flags]",
    "",
    "Global flags:",
    "-h, --help",
    "--list-presets",
    "--list-models",
    "",
    "Core flags:",
    "--model=<id>                               Override resolved default model",
    "--repair-model=<id>                        Hybrid repair model override",
    "--preset=<preset-id>                       Use bundled prompt preset as prompt",
    "--thinking=<true|false>                    Generation thinking toggle",
    "--reasoning-effort=<minimal|low|medium|high>",
    "--include-thoughts=<true|false>            Include model thoughts when supported",
    "--max-retries=<n>                          Retry count for recoverable failures",
    "--logs",
    "--verbose",
    "--router-max-turns=<n>                     single-tool-router max loop turns",
    "--hybrid-max-turns=<n>                     hybrid-repair max loop turns",
    "",
    "Benchmark flags:",
    "--iterations=<n>                           Runs per preset/strategy/model",
    "--models=<id1,id2,...>                     Comma-separated model ids",
    "--benchmark-strategies=<all|comma list>",
    "--benchmark-presets=<all|comma list>",
    "",
    "Examples:",
    "bun run index.ts single-tool-router \"Add 4 and 7\"",
    "bun run index.ts hybrid-repair --preset=sum-and-uppercase --verbose",
    "bun run index.ts --benchmark --iterations=2 --benchmark-strategies=all --benchmark-presets=all",
    "",
    "Notes:",
    "- Env resolution priority: .env.local, then process env",
    "- Default model comes from env or strategy defaults; override with --model",
  ].join("\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
