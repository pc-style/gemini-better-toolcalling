import {
  ThinkingLevel,
  type GenerateContentConfig,
  type ThinkingConfig,
} from "@google/genai";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface GenerationSettings {
  thinking: boolean;
  reasoningEffort: ReasoningEffort;
  includeThoughts: boolean;
}

export function defaultGenerationSettings(): GenerationSettings {
  return {
    thinking: true,
    reasoningEffort: "medium",
    includeThoughts: false,
  };
}

export function applyGenerationSettings(
  config: GenerateContentConfig | undefined,
  settings: GenerationSettings | undefined,
  model?: string,
): GenerateContentConfig | undefined {
  if (!settings) {
    return config;
  }

  const existing = config ?? {};
  const thinkingConfig = toThinkingConfig(settings, model);

  return {
    ...existing,
    thinkingConfig: {
      ...(existing.thinkingConfig ?? {}),
      ...thinkingConfig,
    },
  };
}

function toThinkingConfig(
  settings: GenerationSettings,
  model?: string,
): ThinkingConfig {
  const useBudget = shouldUseBudgetMode(model);

  if (useBudget) {
    return {
      includeThoughts: settings.includeThoughts,
      thinkingBudget: settings.thinking ? budgetForEffort(settings.reasoningEffort) : 0,
    };
  }

  return {
    includeThoughts: settings.includeThoughts,
    thinkingLevel: settings.thinking
      ? toThinkingLevel(settings.reasoningEffort)
      : ThinkingLevel.MINIMAL,
  };
}

function toThinkingLevel(effort: ReasoningEffort): ThinkingLevel {
  if (effort === "minimal") {
    return ThinkingLevel.MINIMAL;
  }
  if (effort === "low") {
    return ThinkingLevel.LOW;
  }
  if (effort === "high") {
    return ThinkingLevel.HIGH;
  }
  return ThinkingLevel.MEDIUM;
}

function shouldUseBudgetMode(model?: string): boolean {
  if (!model) {
    return false;
  }

  return model.includes("2.5") || model.includes("2.0");
}

function budgetForEffort(effort: ReasoningEffort): number {
  if (effort === "minimal") {
    return 256;
  }
  if (effort === "low") {
    return 1024;
  }
  if (effort === "high") {
    return 8192;
  }
  return 4096;
}
