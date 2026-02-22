import { describe, expect, it } from "bun:test";

import { createDemoToolRegistry } from "../src/demo-tools";

describe("demo tool registry", () => {
  it("includes expanded tool set", () => {
    const names = createDemoToolRegistry().names();

    expect(names).toContain("sum_numbers");
    expect(names).toContain("multiply_numbers");
    expect(names).toContain("convert_temperature");
    expect(names).toContain("extract_emails");
    expect(names).toContain("slugify_text");
    expect(names).toContain("word_stats");
    expect(names).toContain("calculate_percentage");
    expect(names).toContain("extract_number_sequence");
    expect(names).toContain("trim_and_excerpt");
  });

  it("converts temperature deterministically", async () => {
    const registry = createDemoToolRegistry();
    const validation = registry.validateArgs("convert_temperature", {
      value: 100,
      fromUnit: "C",
      toUnit: "F",
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const output = await registry.execute("convert_temperature", validation.args, {
      now: new Date("2026-02-22T00:00:00Z"),
    });

    expect(output).toEqual({ value: 212, unit: "F" });
  });

  it("extracts unique emails", async () => {
    const registry = createDemoToolRegistry();
    const validation = registry.validateArgs("extract_emails", {
      text: "a@test.com b@test.com a@test.com",
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const output = await registry.execute("extract_emails", validation.args, {
      now: new Date("2026-02-22T00:00:00Z"),
    });

    expect(output).toEqual({ emails: ["a@test.com", "b@test.com"], count: 2 });
  });

  it("calculates percentage with precision", async () => {
    const registry = createDemoToolRegistry();
    const validation = registry.validateArgs("calculate_percentage", {
      numerator: 23,
      denominator: 40,
      precision: 1,
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const output = await registry.execute("calculate_percentage", validation.args, {
      now: new Date("2026-02-22T00:00:00Z"),
    });

    expect(output).toEqual({ percentage: 57.5, precision: 1 });
  });

  it("extracts number sequence with optional dedupe", async () => {
    const registry = createDemoToolRegistry();
    const validation = registry.validateArgs("extract_number_sequence", {
      text: "v1 had 2 failures, v2 had 0, v3 had 2",
      dedupe: true,
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const output = await registry.execute("extract_number_sequence", validation.args, {
      now: new Date("2026-02-22T00:00:00Z"),
    });

    expect(output).toEqual({ numbers: [1, 2, 0, 3], count: 4 });
  });

  it("trims and truncates excerpt deterministically", async () => {
    const registry = createDemoToolRegistry();
    const validation = registry.validateArgs("trim_and_excerpt", {
      text: "   benchmark outputs are easier to compare now   ",
      maxLength: 16,
      withEllipsis: true,
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      return;
    }

    const output = await registry.execute("trim_and_excerpt", validation.args, {
      now: new Date("2026-02-22T00:00:00Z"),
    });

    expect(output).toEqual({ excerpt: "benchmark out...", truncated: true });
  });
});
