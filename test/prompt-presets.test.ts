import { describe, expect, it } from "bun:test";

import { PROMPT_PRESETS } from "../src/prompt-presets";

describe("prompt presets", () => {
  it("has unique ids", () => {
    const ids = PROMPT_PRESETS.map((preset) => preset.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("contains meaningful defaults", () => {
    expect(PROMPT_PRESETS.length).toBeGreaterThan(4);
    for (const preset of PROMPT_PRESETS) {
      expect(preset.prompt.length).toBeGreaterThan(20);
      expect(preset.title.length).toBeGreaterThan(3);
    }
  });
});

