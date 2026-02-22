import { resolveEnvSettings } from "./env";

export const MODEL_CATALOG_FALLBACK = "gemini-3-flash-preview";

export const MODEL_CATALOG_DEFAULTS = [
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  MODEL_CATALOG_FALLBACK,
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
  return [...new Set(models)]
    .filter((model) => !isUnsupportedLegacyModel(model))
    .sort((a, b) => a.localeCompare(b));
}

export async function probeModelAvailability(model: string): Promise<void> {
  const { apiKey } = await resolveEnvSettings();
  if (!apiKey) {
    throw new Error("Missing API key. Set GOOGLE_API_KEY or GEMINI_API_KEY.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 1, temperature: 0 },
      }),
    },
  );

  if (response.ok) {
    return;
  }

  const body = (await response.text()).trim();
  throw new Error(body.length > 0 ? body : `Model probe failed (${response.status})`);
}

function isToolCallingFriendlyModel(id: string, methods: string[]): boolean {
  const lower = id.toLowerCase();
  if (!lower.startsWith("gemini-")) {
    return false;
  }

  if (!methods.includes("generateContent")) {
    return false;
  }

  // Exclude known legacy ids unavailable to many users.
  if (isUnsupportedLegacyModel(lower)) {
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

export function isUnsupportedLegacyModel(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.startsWith("gemini-2.0-") || lower.startsWith("gemini-1.5-");
}

export function normalizeRunnableModel(model: string | undefined): string | undefined {
  if (!model) {
    return undefined;
  }
  return isUnsupportedLegacyModel(model) ? undefined : model;
}
