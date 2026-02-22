import type { Content, Part } from "@google/genai";

export function extractFirstModelFunctionCallContent(raw: unknown): Content | null {
  if (!isObject(raw)) {
    return null;
  }

  const candidates = raw["candidates"];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const firstCandidate = candidates[0];
  if (!isObject(firstCandidate)) {
    return null;
  }

  const content = firstCandidate["content"];
  if (!isObject(content)) {
    return null;
  }

  const parts = content["parts"];
  if (!Array.isArray(parts)) {
    return null;
  }

  const hasFunctionCall = parts.some(
    (part) => isObject(part) && isObject(part["functionCall"]),
  );
  if (!hasFunctionCall) {
    return null;
  }

  return content as Content;
}

function isPartLike(value: unknown): value is Part {
  if (!isObject(value)) {
    return false;
  }

  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
