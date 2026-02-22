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

  if (doesNotSupportThinking(model)) {
    return existing;
  }

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
  if (!settings.thinking) {
    if (shouldUseBudgetMode(model)) {
      return {
        includeThoughts: settings.includeThoughts,
        thinkingBudget: 0,
      };
    }

    return {
      includeThoughts: settings.includeThoughts,
      thinkingLevel: supportsMinimalThinking(model)
        ? ThinkingLevel.MINIMAL
        : ThinkingLevel.LOW,
    };
  }

  const useBudget = shouldUseBudgetMode(model);

  if (useBudget) {
    return {
      includeThoughts: settings.includeThoughts,
      thinkingBudget: budgetForEffort(settings.reasoningEffort),
    };
  }

  const level = clampThinkingLevel(toThinkingLevel(settings.reasoningEffort), model);

  return {
    includeThoughts: settings.includeThoughts,
    thinkingLevel: level,
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

export function doesNotSupportThinking(model?: string): boolean {
  if (!model) {
    return false;
  }
  const lower = model.toLowerCase();
  return lower.includes("flash-lite") || lower.includes("nano");
}

function shouldUseBudgetMode(model?: string): boolean {
  if (!model) {
    return false;
  }

  return model.includes("2.5") || model.includes("2.0");
}

function supportsMinimalThinking(model?: string): boolean {
  if (!model) {
    return true;
  }
  const lower = model.toLowerCase();
  return !lower.includes("-pro");
}

function clampThinkingLevel(level: ThinkingLevel, model?: string): ThinkingLevel {
  if (!model) {
    return level;
  }
  const lower = model.toLowerCase();
  const isPro = lower.includes("-pro");

  if (isPro && level === ThinkingLevel.MINIMAL) {
    return ThinkingLevel.LOW;
  }
  if (lower.includes("gemini-3-pro-preview") && level === ThinkingLevel.MEDIUM) {
    return ThinkingLevel.LOW;
  }
  return level;
}

function budgetForEffort(effort: ReasoningEffort): number {
  if (effort === "minimal") {
    return 512;
  }
  if (effort === "low") {
    return 1024;
  }
  if (effort === "high") {
    return 8192;
  }
  return 4096;
}
