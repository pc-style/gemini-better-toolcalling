import { resolveEnvSettings } from "./env";

export const MODEL_CATALOG_DEFAULTS = [
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export async function listAvailableModelsFromApi(): Promise<string[]> {
  const { apiKey } = await resolveEnvSettings();
  if (!apiKey) {
    return [...MODEL_CATALOG_DEFAULTS];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!response.ok) {
    return [...MODEL_CATALOG_DEFAULTS];
  }

  const payload = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };

  const discovered =
    payload.models
      ?.map((model) => ({
        id: model.name?.replace(/^models\//, ""),
        methods: model.supportedGenerationMethods ?? [],
      }))
      .filter(
        (item): item is { id: string; methods: string[] } =>
          typeof item.id === "string" && item.id.length > 0,
      ) ?? [];

  const ids = discovered
    .filter((item) => isToolCallingFriendlyModel(item.id, item.methods))
    .map((item) => item.id);

  const merged = new Set<string>([...MODEL_CATALOG_DEFAULTS, ...ids]);
  return [...merged];
}

export async function getModelOptions(): Promise<string[]> {
  const models = await listAvailableModelsFromApi();
  return models.sort((a, b) => a.localeCompare(b));
}

function isToolCallingFriendlyModel(id: string, methods: string[]): boolean {
  const lower = id.toLowerCase();
  if (!lower.startsWith("gemini-")) {
    return false;
  }

  if (!methods.includes("generateContent")) {
    return false;
  }

  // Exclude known multimodal/non-chat model families and legacy unavailable ids.
  if (lower === "gemini-2.0-flash-lite-001") {
    return false;
  }

  const excludedFragments = [
    "embedding",
    "image",
    "audio",
    "aqa",
    "veo",
    "imagen",
    "robotics",
    "computer-use",
    "deep-research",
    "nano-banana",
    "tts",
    "live",
  ];

  return excludedFragments.every((fragment) => !lower.includes(fragment));
}
