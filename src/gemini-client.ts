import {
  GoogleGenAI,
  type GenerateContentParameters,
} from "@google/genai";

import type { ModelClient, ModelResult } from "./contracts";

const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;

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
    const response = await withTimeout(
      this.ai.models.generateContent(request),
      this.requestTimeoutMs,
      `Gemini request timed out after ${this.requestTimeoutMs}ms`,
    );

    return {
      text: extractTextWithoutSdkWarnings(response),
      functionCalls: (response.functionCalls ?? []).map((call) => ({
        id: call.id,
        name: call.name,
        args: call.args,
      })),
      raw: response,
    };
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
