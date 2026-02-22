import {
  FunctionCallingConfigMode,
  createModelContent,
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
  createUserContent,
  type GenerateContentParameters,
} from "@google/genai";

import type {
  JsonObject,
  ModelClient,
  ModelFunctionCall,
  RunnerResult,
  RunnerTraceStep,
} from "../contracts";
import type { GenerationSettings } from "../generation-settings";
import { applyGenerationSettings } from "../generation-settings";
import {
  buildFinalResponsePrompt,
  buildToolSelectionPrompt,
  finalResponseJsonSchema,
  parseFinalResponseText,
  parseToolIntentText,
  toolIntentJsonSchema,
} from "../core/intents";
import {
  parseObjectWithRepair,
  toJsonObject,
  parseJsonWithRepair,
} from "../core/json-utils";
import { extractFirstModelFunctionCallContent } from "../core/response-utils";
import { ToolRegistry } from "../tool-registry";

export interface HybridRepairRunnerOptions {
  model: string;
  repairModel?: string;
  maxTurns?: number;
  functionCallingMode?: FunctionCallingConfigMode;
  generationSettings?: GenerationSettings;
}

export async function runHybridRepairRunner(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  options: HybridRepairRunnerOptions,
): Promise<RunnerResult> {
  const trace: RunnerTraceStep[] = [];
  const toolCalls: RunnerResult["toolCalls"] = [];
  const contents = [createUserContent(userPrompt)];
  const maxTurns = options.maxTurns ?? 3;
  const repairModel = options.repairModel ?? options.model;
  const mode = options.functionCallingMode ?? FunctionCallingConfigMode.VALIDATED;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const request: GenerateContentParameters = {
      model: options.model,
      contents,
      config: applyGenerationSettings(
        {
        tools: [{ functionDeclarations: registry.toFunctionDeclarations() }],
        toolConfig: {
          functionCallingConfig: {
            mode,
          },
        },
        },
        options.generationSettings,
        options.model,
      ),
    };

    trace.push({ kind: "llm", detail: `turn_${turn}_request` });
    const response = await client.generateContent(request);
    const functionCall = response.functionCalls[0];

    if (!functionCall) {
      if (response.text.trim().length > 0) {
        trace.push({ kind: "llm", detail: `turn_${turn}_text_response` });
        return {
          strategy: "hybrid-repair",
          finalText: response.text,
          toolCalls,
          trace,
        };
      }

      if (toolCalls.length > 0) {
        const lastCall = toolCalls[toolCalls.length - 1];
        if (!lastCall) {
          throw new Error("Expected at least one tool call before finalization.");
        }

        trace.push({ kind: "llm", detail: "finalize_after_tool_call_with_json" });
        const finalize = await client.generateContent({
          model: options.model,
          contents: buildFinalResponsePrompt(
            userPrompt,
            lastCall.toolName,
            lastCall.args,
            lastCall.result,
          ),
          config: applyGenerationSettings(
            {
            responseMimeType: "application/json",
            responseJsonSchema: finalResponseJsonSchema(),
            },
            options.generationSettings,
            options.model,
          ),
        });

        return {
          strategy: "hybrid-repair",
          finalText: parseFinalResponseText(finalize.text),
          toolCalls,
          trace,
        };
      }

      const fallback = await fallbackViaStructuredIntent(
        client,
        registry,
        userPrompt,
        options.model,
        trace,
        options.generationSettings,
      );
      return {
        strategy: "hybrid-repair",
        finalText: fallback,
        toolCalls,
        trace,
      };
    }

    const toolName = functionCall.name;
    if (!toolName || !registry.has(toolName)) {
      throw new Error(`Model requested unknown tool: ${toolName ?? "undefined"}`);
    }

    const repaired = await resolveToolArgs(
      client,
      registry,
      userPrompt,
      toolName,
      functionCall,
      repairModel,
      trace,
      options.generationSettings,
    );
    const toolResult = await registry.execute(toolName, repaired.args, {
      now: new Date(),
    });
    toolCalls.push({
      toolName,
      args: repaired.args,
      result: toolResult,
      repaired: repaired.repaired,
    });

    const callId = functionCall.id ?? `call_${turn}`;
    const modelFunctionCallContent =
      extractFirstModelFunctionCallContent(response.raw) ??
      createModelContent(createPartFromFunctionCall(toolName, repaired.args));
    contents.push(modelFunctionCallContent);
    contents.push(
      createUserContent(
        createPartFromFunctionResponse(callId, toolName, { result: toolResult }),
      ),
    );
  }

  return {
    strategy: "hybrid-repair",
    finalText: "No final text response after max tool turns.",
    toolCalls,
    trace,
  };
}

async function resolveToolArgs(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  toolName: string,
  functionCall: ModelFunctionCall,
  repairModel: string,
  trace: RunnerTraceStep[],
  generationSettings: GenerationSettings | undefined,
): Promise<{ args: JsonObject; repaired: boolean }> {
  const direct = validateRawToolArgs(registry, toolName, functionCall.args);
  if (direct.ok) {
    return { args: direct.args, repaired: false };
  }

  trace.push({
    kind: "repair",
    detail: "raw_args_invalid_attempting_llm_repair",
    data: {
      toolName,
      reason: direct.error,
    },
  });

  const repairedArgs = await repairToolArgsWithLlm(
    client,
    registry,
    userPrompt,
    toolName,
    functionCall.args,
    repairModel,
    generationSettings,
  );
  const revalidated = registry.validateArgs(toolName, repairedArgs);
  if (!revalidated.ok) {
    throw new Error(`Tool args still invalid after repair: ${revalidated.error}`);
  }

  return { args: revalidated.args, repaired: true };
}

function validateRawToolArgs(
  registry: ToolRegistry,
  toolName: string,
  rawArgs: unknown,
): { ok: true; args: JsonObject } | { ok: false; error: string } {
  if (typeof rawArgs === "string") {
    try {
      const parsed = parseObjectWithRepair(rawArgs, "functionCall.args");
      const validation = registry.validateArgs(toolName, parsed);
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }
      return { ok: true, args: validation.args };
    } catch (error) {
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  try {
    const candidate = toJsonObject(rawArgs, "functionCall.args");
    const validation = registry.validateArgs(toolName, candidate);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
    return { ok: true, args: validation.args };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

async function repairToolArgsWithLlm(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  toolName: string,
  brokenArgs: unknown,
  repairModel: string,
  generationSettings: GenerationSettings | undefined,
): Promise<JsonObject> {
  const request: GenerateContentParameters = {
    model: repairModel,
    contents: [
      "Repair the tool args so they match the schema exactly.",
      "Return only JSON for the repaired args object.",
      `Tool: ${toolName}`,
      `Schema: ${JSON.stringify(registry.getArgsJsonSchema(toolName))}`,
      `User request: ${userPrompt}`,
      `Broken args: ${JSON.stringify(brokenArgs)}`,
    ].join("\n"),
    config: applyGenerationSettings(
      {
      responseMimeType: "application/json",
      responseJsonSchema: registry.getArgsJsonSchema(toolName),
      },
      generationSettings,
      repairModel,
    ),
  };

  const response = await client.generateContent(request);
  const parsed = parseJsonWithRepair(response.text);
  return toJsonObject(parsed, "Repaired tool args");
}

async function fallbackViaStructuredIntent(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  model: string,
  trace: RunnerTraceStep[],
  generationSettings: GenerationSettings | undefined,
): Promise<string> {
  trace.push({ kind: "fallback", detail: "structured_intent_fallback" });
  const response = await client.generateContent({
    model,
    contents: buildToolSelectionPrompt(userPrompt, registry),
    config: applyGenerationSettings(
      {
      responseMimeType: "application/json",
      responseJsonSchema: toolIntentJsonSchema(),
      },
      generationSettings,
      model,
    ),
  });

  const intent = parseToolIntentText(response.text);
  if (intent.action === "respond") {
    if (!intent.response) {
      throw new Error("Fallback intent missing response");
    }
    return intent.response;
  }

  return `Fallback selected tool '${intent.toolName}', but no direct execution was run in fallback mode.`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
