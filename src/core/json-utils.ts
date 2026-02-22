import { jsonrepair } from "jsonrepair";

import type { JsonObject } from "../contracts";

export function unwrapMarkdownCodeFence(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (!match) {
    return input;
  }
  return match[1] ?? input;
}

export function extractFirstBalancedJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parseJsonWithRepair(raw: string): unknown {
  const normalized = unwrapMarkdownCodeFence(raw).trim();
  if (normalized.length === 0) {
    throw new Error("Empty JSON string");
  }

  try {
    return JSON.parse(normalized);
  } catch {
    try {
      return JSON.parse(jsonrepair(normalized));
    } catch {
      const candidate = extractFirstBalancedJsonObject(normalized);
      if (!candidate) {
        throw new Error("No JSON object found");
      }
      return JSON.parse(jsonrepair(candidate));
    }
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

export function parseObjectWithRepair(raw: string, label: string): JsonObject {
  return toJsonObject(parseJsonWithRepair(raw), label);
}

