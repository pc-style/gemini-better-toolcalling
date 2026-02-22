import { z } from "zod";

import type { JsonObject } from "../contracts";
import { parseJsonWithRepair, toJsonObject } from "./json-utils";
import type { ToolRegistry } from "../tool-registry";

export const toolIntentSchema = z
  .object({
    action: z.enum(["call_tool", "respond"]),
    toolName: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    response: z.string().optional(),
    reason: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "call_tool") {
      if (!value.toolName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toolName"],
          message: "toolName is required when action=call_tool",
        });
      }
      if (!value.args) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["args"],
          message: "args is required when action=call_tool",
        });
      }
    }
    if (value.action === "respond" && !value.response) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response"],
        message: "response is required when action=respond",
      });
    }
  });

export const finalResponseSchema = z.object({
  action: z.literal("respond"),
  response: z.string(),
});

export type ToolIntent = z.infer<typeof toolIntentSchema>;

export function toolIntentJsonSchema(): unknown {
  return z.toJSONSchema(toolIntentSchema);
}

export function finalResponseJsonSchema(): unknown {
  return z.toJSONSchema(finalResponseSchema);
}

export function parseToolIntentText(text: string): ToolIntent {
  const parsed = parseJsonWithRepair(text);
  const validated = toolIntentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(validated.error.issues.map((issue) => issue.message).join("; "));
  }
  return validated.data;
}

export function parseFinalResponseText(text: string): string {
  const parsed = parseJsonWithRepair(text);
  const validated = finalResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(validated.error.issues.map((issue) => issue.message).join("; "));
  }
  return validated.data.response;
}

export function buildToolSelectionPrompt(
  userPrompt: string,
  registry: ToolRegistry,
): string {
  return [
    "You are a tool planner for a deterministic tool-calling pipeline.",
    "Decide whether to call exactly one tool or respond directly.",
    "Output must be valid JSON matching the response schema exactly.",
    "Do not wrap JSON in markdown, code fences, or prose.",
    "If action='call_tool':",
    "- toolName must exactly match one available tool name.",
    "- args must be a JSON object that matches the chosen tool schema.",
    "If action='respond':",
    "- include a concise response string in 'response'.",
    "- omit toolName and args.",
    "Available tools:",
    JSON.stringify(registry.describeForPrompt(), null, 2),
    "User request:",
    userPrompt,
  ].join("\n");
}

export function buildFinalResponsePrompt(
  userPrompt: string,
  toolName: string,
  toolArgs: JsonObject,
  toolResult: unknown,
): string {
  return [
    "You are finalizing an assistant reply after a tool call.",
    "Return only valid JSON that matches this exact shape:",
    '{"action":"respond","response":"<concise answer>"}',
    "Do not add markdown, code fences, or additional keys.",
    "Ground the response in the tool result and the original user request.",
    "Original user request:",
    userPrompt,
    "Tool that was executed:",
    toolName,
    "Tool args:",
    JSON.stringify(toolArgs),
    "Tool result:",
    JSON.stringify(toolResult),
  ].join("\n");
}

export function toJsonRecordForPrompt(value: unknown): JsonObject {
  return toJsonObject(value, "Prompt value");
}
