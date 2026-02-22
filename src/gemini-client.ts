import {
  GoogleGenAI,
  type GenerateContentParameters,
} from "@google/genai";

import type { ModelClient, ModelResult } from "./contracts";

const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const MAX_TRANSIENT_RETRIES = 2;

export class GoogleModelClient implements ModelClient {
  private readonly ai: GoogleGenAI;
  private readonly requestTimeoutMs: number;

  public constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.requestTimeoutMs = resolveRequestTimeoutMs();
  }

  public async generateContent(
    request: GenerateContentParameters,
  ): Promise<ModelResult> {
    const response = await this.generateWithRetry(request);

    return {
      text: extractTextWithoutSdkWarnings(response),
      thoughts: extractThoughtTexts(response),
      functionCalls: (response.functionCalls ?? []).map((call) => ({
        id: call.id,
        name: call.name,
        args: call.args,
      })),
      raw: response,
    };
  }

  private async generateWithRetry(
    request: GenerateContentParameters,
  ): Promise<Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
      try {
        return await withTimeout(
          this.ai.models.generateContent(request),
          this.requestTimeoutMs,
          `Gemini request timed out after ${this.requestTimeoutMs}ms`,
        );
      } catch (error) {
        lastError = error;
        const message = toErrorMessage(error);
        if (!isRetryableGeminiError(message) || attempt === MAX_TRANSIENT_RETRIES) {
          throw error;
        }

        const delayMs = extractRetryDelayMs(message) ?? 2_000 * (attempt + 1);
        await sleep(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

function resolveRequestTimeoutMs(): number {
  const raw = process.env.GEMINI_REQUEST_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return Math.floor(parsed);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRetryableGeminiError(message: string): boolean {
  const upper = message.toUpperCase();
  return (
    upper.includes("RESOURCE_EXHAUSTED") ||
    upper.includes("RATE_LIMIT") ||
    upper.includes("\"CODE\":429") ||
    upper.includes("SERVICE_UNAVAILABLE") ||
    upper.includes("\"CODE\":503")
  );
}

function extractRetryDelayMs(message: string): number | null {
  const retryInfoMatch = message.match(/"retryDelay":"(\d+)s"/i);
  if (retryInfoMatch?.[1]) {
    const seconds = Number(retryInfoMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1_000;
    }
  }

  const inlineMatch = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (inlineMatch?.[1]) {
    const seconds = Number(inlineMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1_000);
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractThoughtTexts(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
}): string[] {
  const firstCandidate = response.candidates?.[0];
  const parts = firstCandidate?.content?.parts ?? [];
  return parts
    .filter((part) => part.thought && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter((text) => text.length > 0);
}

function extractTextWithoutSdkWarnings(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
}): string {
  const firstCandidate = response.candidates?.[0];
  const parts = firstCandidate?.content?.parts ?? [];
  const textParts = parts
    .filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text ?? "");

  return textParts.join("");
}
