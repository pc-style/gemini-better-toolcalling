import { describe, expect, it } from "bun:test";

import type { BenchmarkRunRecord } from "../src/benchmark";
import { buildAggregates, buildComparisons } from "../src/benchmark";

function record(overrides: Partial<BenchmarkRunRecord>): BenchmarkRunRecord {
  return {
    model: "test-model",
    strategy: "structured-json",
    presetId: "preset-a",
    iteration: 1,
    success: true,
    durationMs: 100,
    attempts: 1,
    toolCalls: 1,
    repairedCalls: 0,
    ...overrides,
  };
}

describe("benchmark aggregates", () => {
  it("computes expanded aggregate metrics", () => {
    const records: BenchmarkRunRecord[] = [
      record({
        strategy: "structured-json",
        durationMs: 100,
        success: true,
        toolCalls: 2,
        repairedCalls: 1,
        attempts: 1,
      }),
      record({
        strategy: "structured-json",
        durationMs: 300,
        success: false,
        toolCalls: 0,
        repairedCalls: 0,
        attempts: 2,
      }),
      record({
        strategy: "structured-json",
        durationMs: 200,
        success: true,
        toolCalls: 1,
        repairedCalls: 0,
        attempts: 1,
      }),
    ];

    const aggregates = buildAggregates(records);
    expect(aggregates).toHaveLength(1);
    const row = aggregates[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }

    expect(row.totalRuns).toBe(3);
    expect(row.successRuns).toBe(2);
    expect(row.failureRuns).toBe(1);
    expect(row.successRate).toBeCloseTo(2 / 3, 5);
    expect(row.errorRate).toBeCloseTo(1 / 3, 5);
    expect(row.avgDurationMs).toBe(200);
    expect(row.medianDurationMs).toBe(200);
    expect(row.p95DurationMs).toBe(300);
    expect(row.avgToolCalls).toBe(1);
    expect(row.avgRepairedCalls).toBe(0.33);
    expect(row.repairRate).toBe(0.33);
    expect(row.toolUseRate).toBe(0.67);
    expect(row.avgAttempts).toBe(1.33);
  });

  it("builds per-model comparisons against best strategy", () => {
    const aggregates = buildAggregates([
      record({
        strategy: "structured-json",
        durationMs: 180,
        success: true,
        toolCalls: 1,
      }),
      record({
        strategy: "single-tool-router",
        durationMs: 160,
        success: true,
        toolCalls: 2,
      }),
      record({
        strategy: "single-tool-router",
        durationMs: 150,
        success: true,
        toolCalls: 2,
      }),
      record({
        strategy: "hybrid-repair",
        durationMs: 240,
        success: false,
        toolCalls: 1,
      }),
      record({
        strategy: "hybrid-repair",
        durationMs: 220,
        success: true,
        toolCalls: 1,
      }),
    ]);

    const comparisons = buildComparisons(aggregates);
    expect(comparisons).toHaveLength(3);
    expect(comparisons[0]?.strategy).toBe("single-tool-router");
    expect(comparisons[0]?.deltaSuccessRate).toBe(0);
    expect(comparisons[0]?.deltaDurationMs).toBe(0);

    const structured = comparisons.find((row) => row.strategy === "structured-json");
    expect(structured).toBeDefined();
    expect(structured?.deltaSuccessRate).toBe(0);
    expect(structured?.deltaDurationMs).toBeGreaterThan(0);

    const hybrid = comparisons.find((row) => row.strategy === "hybrid-repair");
    expect(hybrid).toBeDefined();
    expect(hybrid?.deltaSuccessRate).toBeGreaterThan(0);
  });
});
