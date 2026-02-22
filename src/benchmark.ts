import type { GenerationSettings } from "./generation-settings";
import { PROMPT_PRESETS, type PromptPreset } from "./prompt-presets";
import { STRATEGIES, runStrategy, type Strategy } from "./strategy-runner";

export interface BenchmarkConfig {
  models: string[];
  strategies: Strategy[];
  presets: PromptPreset[];
  iterations: number;
  maxRetries?: number;
  logs?: boolean;
  verbose?: boolean;
  generationSettings?: GenerationSettings;
  routerMaxTurns?: number;
  hybridMaxTurns?: number;
  logger?: (line: string) => void;
}

export interface BenchmarkRunRecord {
  model: string;
  strategy: Strategy;
  presetId: string;
  iteration: number;
  success: boolean;
  durationMs: number;
  attempts: number;
  toolCalls: number;
  repairedCalls: number;
  error?: string;
}

export interface BenchmarkAggregate {
  key: string;
  strategy: Strategy;
  model: string;
  totalRuns: number;
  successRuns: number;
  failureRuns: number;
  successRate: number;
  errorRate: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  avgToolCalls: number;
  avgRepairedCalls: number;
  repairRate: number;
  toolUseRate: number;
  avgAttempts: number;
}

export interface BenchmarkComparison {
  model: string;
  strategy: Strategy;
  successRate: number;
  avgDurationMs: number;
  avgToolCalls: number;
  avgRepairedCalls: number;
  deltaSuccessRate: number;
  deltaDurationMs: number;
  deltaToolCalls: number;
}

export interface BenchmarkResult {
  startedAt: string;
  finishedAt: string;
  totalRuns: number;
  records: BenchmarkRunRecord[];
  aggregates: BenchmarkAggregate[];
  comparisons: BenchmarkComparison[];
}

export function defaultBenchmarkConfig(model: string): BenchmarkConfig {
  return {
    models: [model],
    strategies: [...STRATEGIES],
    presets: [...PROMPT_PRESETS],
    iterations: 1,
    logs: false,
    verbose: false,
  };
}

export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
  const logger = config.logger ?? (() => {});
  const records: BenchmarkRunRecord[] = [];
  const started = new Date();

  for (const model of config.models) {
    for (const strategy of config.strategies) {
      for (const preset of config.presets) {
        for (let iteration = 1; iteration <= config.iterations; iteration += 1) {
          if (config.logs) {
            logger(
              `[bench] model=${model} strategy=${strategy} preset=${preset.id} iteration=${iteration}/${config.iterations}`,
            );
          }

          const runStarted = Date.now();
          try {
            const result = await runStrategy({
              strategy,
              model,
              prompt: preset.prompt,
              maxRetries: config.maxRetries,
              logs: config.logs,
              verbose: config.verbose,
              generationSettings: config.generationSettings,
              routerMaxTurns: config.routerMaxTurns,
              hybridMaxTurns: config.hybridMaxTurns,
              logger,
            });

            records.push({
              model,
              strategy,
              presetId: preset.id,
              iteration,
              success: true,
              durationMs: Date.now() - runStarted,
              attempts: result.attempts,
              toolCalls: result.toolCalls.length,
              repairedCalls: result.toolCalls.filter((item) => item.repaired).length,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            records.push({
              model,
              strategy,
              presetId: preset.id,
              iteration,
              success: false,
              durationMs: Date.now() - runStarted,
              attempts: Math.max(1, (config.maxRetries ?? 0) + 1),
              toolCalls: 0,
              repairedCalls: 0,
              error: message,
            });
          }
        }
      }
    }
  }

  const finished = new Date();
  const aggregates = buildAggregates(records);
  const comparisons = buildComparisons(aggregates);

  return {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    totalRuns: records.length,
    records,
    aggregates,
    comparisons,
  };
}

export function buildAggregates(records: BenchmarkRunRecord[]): BenchmarkAggregate[] {
  const groups = new Map<string, BenchmarkRunRecord[]>();

  for (const record of records) {
    const key = `${record.model}::${record.strategy}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const output: BenchmarkAggregate[] = [];
  for (const [key, group] of groups.entries()) {
    const model = group[0]?.model ?? "unknown-model";
    const strategy = group[0]?.strategy ?? "structured-json";
    const totalRuns = group.length;
    const successRuns = group.filter((item) => item.success).length;
    const failureRuns = totalRuns - successRuns;
    const sumDuration = group.reduce((acc, item) => acc + item.durationMs, 0);
    const durations = group.map((item) => item.durationMs).sort((a, b) => a - b);
    const sumToolCalls = group.reduce((acc, item) => acc + item.toolCalls, 0);
    const sumRepairedCalls = group.reduce((acc, item) => acc + item.repairedCalls, 0);
    const toolUsedRuns = group.filter((item) => item.toolCalls > 0).length;
    const sumAttempts = group.reduce((acc, item) => acc + item.attempts, 0);

    output.push({
      key,
      strategy,
      model,
      totalRuns,
      successRuns,
      failureRuns,
      successRate: totalRuns > 0 ? successRuns / totalRuns : 0,
      errorRate: totalRuns > 0 ? failureRuns / totalRuns : 0,
      avgDurationMs: totalRuns > 0 ? Math.round(sumDuration / totalRuns) : 0,
      medianDurationMs: percentile(durations, 0.5),
      p95DurationMs: percentile(durations, 0.95),
      avgToolCalls: totalRuns > 0 ? round2(sumToolCalls / totalRuns) : 0,
      avgRepairedCalls: totalRuns > 0 ? round2(sumRepairedCalls / totalRuns) : 0,
      repairRate: sumToolCalls > 0 ? round2(sumRepairedCalls / sumToolCalls) : 0,
      toolUseRate: totalRuns > 0 ? round2(toolUsedRuns / totalRuns) : 0,
      avgAttempts: totalRuns > 0 ? round2(sumAttempts / totalRuns) : 0,
    });
  }

  return output.sort((a, b) => {
    const strategySort = a.strategy.localeCompare(b.strategy);
    return strategySort !== 0 ? strategySort : a.model.localeCompare(b.model);
  });
}

export function buildComparisons(aggregates: BenchmarkAggregate[]): BenchmarkComparison[] {
  const groups = new Map<string, BenchmarkAggregate[]>();

  for (const aggregate of aggregates) {
    const group = groups.get(aggregate.model) ?? [];
    group.push(aggregate);
    groups.set(aggregate.model, group);
  }

  const output: BenchmarkComparison[] = [];
  for (const [model, rows] of groups.entries()) {
    const sorted = [...rows].sort(compareAggregateRows);
    const baseline = sorted[0];
    if (!baseline) {
      continue;
    }

    for (const row of sorted) {
      output.push({
        model,
        strategy: row.strategy,
        successRate: row.successRate,
        avgDurationMs: row.avgDurationMs,
        avgToolCalls: row.avgToolCalls,
        avgRepairedCalls: row.avgRepairedCalls,
        deltaSuccessRate: round2((baseline.successRate - row.successRate) * 100),
        deltaDurationMs: row.avgDurationMs - baseline.avgDurationMs,
        deltaToolCalls: round2(row.avgToolCalls - baseline.avgToolCalls),
      });
    }
  }

  return output.sort((a, b) => {
    const modelSort = a.model.localeCompare(b.model);
    return modelSort !== 0 ? modelSort : a.deltaSuccessRate - b.deltaSuccessRate;
  });
}

function compareAggregateRows(a: BenchmarkAggregate, b: BenchmarkAggregate): number {
  if (a.successRate !== b.successRate) {
    return b.successRate - a.successRate;
  }
  if (a.avgDurationMs !== b.avgDurationMs) {
    return a.avgDurationMs - b.avgDurationMs;
  }
  if (a.avgAttempts !== b.avgAttempts) {
    return a.avgAttempts - b.avgAttempts;
  }
  return a.strategy.localeCompare(b.strategy);
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.max(0, Math.min(values.length - 1, Math.ceil(values.length * q) - 1));
  return values[index] ?? 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
