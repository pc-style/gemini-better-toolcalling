import { describe, expect, it } from "bun:test";
import { ThinkingLevel, type GenerateContentConfig } from "@google/genai";

import { applyGenerationSettings } from "../src/generation-settings";

describe("generation settings", () => {
  it("maps unsupported medium thinking level for gemini-3-pro-preview to low", () => {
    const config = applyGenerationSettings(
      {} satisfies GenerateContentConfig,
      {
        thinking: true,
        reasoningEffort: "medium",
        includeThoughts: true,
      },
      "gemini-3-pro-preview",
    );

    expect(config?.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.LOW);
  });

  it("uses thinkingBudget=0 when thinking is disabled", () => {
    const config = applyGenerationSettings(
      {} satisfies GenerateContentConfig,
      {
        thinking: false,
        reasoningEffort: "high",
        includeThoughts: false,
      },
      "gemini-3.1-pro-preview",
    );

    expect(config?.thinkingConfig?.thinkingBudget).toBe(0);
  });
});
