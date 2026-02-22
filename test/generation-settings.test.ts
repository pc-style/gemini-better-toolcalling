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
      "gemini-2.5-flash",
    );

    expect(config?.thinkingConfig?.thinkingBudget).toBe(0);
  });

  it("uses ThinkingLevel.LOW when thinking is disabled on Gemini 3 Pro (MINIMAL not supported)", () => {
    const config = applyGenerationSettings(
      {} satisfies GenerateContentConfig,
      {
        thinking: false,
        reasoningEffort: "high",
        includeThoughts: false,
      },
      "gemini-3.1-pro-preview",
    );

    expect(config?.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.LOW);
  });

  it("uses ThinkingLevel.MINIMAL when thinking is disabled on Gemini 3 Flash", () => {
    const config = applyGenerationSettings(
      {} satisfies GenerateContentConfig,
      {
        thinking: false,
        reasoningEffort: "high",
        includeThoughts: false,
      },
      "gemini-3-flash-preview",
    );

    expect(config?.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.MINIMAL);
  });

  it("clamps minimal effort to LOW on Gemini 3 Pro models", () => {
    const config = applyGenerationSettings(
      {} satisfies GenerateContentConfig,
      {
        thinking: true,
        reasoningEffort: "minimal",
        includeThoughts: false,
      },
      "gemini-3-pro-preview",
    );

    expect(config?.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.LOW);
  });

  it("omits thinkingConfig entirely for flash-lite models", () => {
    const config = applyGenerationSettings(
      {} satisfies GenerateContentConfig,
      {
        thinking: true,
        reasoningEffort: "medium",
        includeThoughts: false,
      },
      "gemini-flash-lite-latest",
    );

    expect(config?.thinkingConfig).toBeUndefined();
  });

  it("omits thinkingConfig for gemini-2.5-flash-lite", () => {
    const config = applyGenerationSettings(
      {} satisfies GenerateContentConfig,
      {
        thinking: false,
        reasoningEffort: "low",
        includeThoughts: false,
      },
      "gemini-2.5-flash-lite",
    );

    expect(config?.thinkingConfig).toBeUndefined();
  });
});
