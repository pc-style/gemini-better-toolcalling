import {
  FunctionCallingConfigMode,
  createModelContent,
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
  createUserContent,
  type FunctionDeclaration,
  type GenerateContentParameters,
} from "@google/genai";
import { z } from "zod";

import type {
  JsonObject,
  ModelClient,
  RunnerResult,
  RunnerTraceStep,
} from "../contracts";
import type { GenerationSettings } from "../generation-settings";
import { applyGenerationSettings, doesNotSupportThinking } from "../generation-settings";
import {
  buildFinalResponsePrompt,
  finalResponseJsonSchema,
  parseFinalResponseText,
} from "../core/intents";
import {
  parseJsonWithRepair,
  parseObjectWithRepair,
  toJsonObject,
} from "../core/json-utils";
import { extractFirstModelFunctionCallContent } from "../core/response-utils";
import { ToolRegistry } from "../tool-registry";

export interface SingleToolRouterRunnerOptions {
  model: string;
  maxTurns?: number;
  generationSettings?: GenerationSettings;
}

const DISPATCH_TOOL_NAME = "dispatch_tool";

const dispatchArgsSchema = z.object({
  toolName: z.string(),
  argumentsJson: z.string(),
});

export async function runSingleToolRouterRunner(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  options: SingleToolRouterRunnerOptions,
): Promise<RunnerResult> {
  const trace: RunnerTraceStep[] = [];
  const toolCalls: RunnerResult["toolCalls"] = [];
  const dispatchDeclaration = createDispatchDeclaration(registry);
  const maxTurns = options.maxTurns ?? 4;
  const contents = [createUserContent(userPrompt)];
  const fcMode = doesNotSupportThinking(options.model)
    ? FunctionCallingConfigMode.ANY
    : FunctionCallingConfigMode.VALIDATED;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const request: GenerateContentParameters = {
      model: options.model,
      contents,
      config: applyGenerationSettings(
        {
        tools: [{ functionDeclarations: [dispatchDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: fcMode,
            allowedFunctionNames: [DISPATCH_TOOL_NAME],
          },
        },
        },
        options.generationSettings,
        options.model,
      ),
    };

    trace.push({ kind: "llm", detail: `turn_${turn}_request_dispatch` });
    const response = await client.generateContent(request);
    appendThoughtTrace(trace, `turn_${turn}`, response.thoughts ?? []);
    const functionCall = response.functionCalls[0];

    if (!functionCall) {
      if (response.text.trim().length > 0) {
        return {
          strategy: "single-tool-router",
          finalText: response.text,
          toolCalls,
          trace,
        };
      }

      if (toolCalls.length === 0) {
        return {
          strategy: "single-tool-router",
          finalText: "Model did not provide a dispatch tool call.",
          toolCalls,
          trace,
        };
      }

      const lastCall = toolCalls[toolCalls.length - 1];
      if (!lastCall) {
        throw new Error("Expected at least one tool call before finalization.");
      }

      trace.push({ kind: "llm", detail: "finalize_after_dispatch_with_json" });
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
      appendThoughtTrace(trace, "finalize", finalize.thoughts ?? []);

      return {
        strategy: "single-tool-router",
        finalText: parseFinalResponseText(finalize.text),
        toolCalls,
        trace,
      };
    }

    const dispatchPayload = dispatchArgsSchema.safeParse(functionCall.args);
    if (!dispatchPayload.success) {
      throw new Error(
        `dispatch_tool args are invalid: ${dispatchPayload.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      );
    }

    const { toolName, argumentsJson } = dispatchPayload.data;
    const maybeArgs = parseObjectWithRepair(
      argumentsJson,
      "dispatch argumentsJson",
    );
    const validated = await resolveDispatchToolArgs(
      client,
      registry,
      userPrompt,
      toolName,
      maybeArgs,
      options.model,
      trace,
      options.generationSettings,
    );

    const toolResult = await registry.execute(toolName, validated.args, {
      now: new Date(),
    });
    toolCalls.push({
      toolName,
      args: validated.args,
      result: toolResult,
      repaired: validated.repaired,
    });

    const callId = functionCall.id ?? `dispatch_call_${turn}`;
    const modelFunctionCallContent =
      extractFirstModelFunctionCallContent(response.raw) ??
      createModelContent(
        createPartFromFunctionCall(DISPATCH_TOOL_NAME, dispatchPayload.data),
      );

    contents.push(modelFunctionCallContent);
    contents.push(
      createUserContent(
        createPartFromFunctionResponse(callId, DISPATCH_TOOL_NAME, {
          toolName,
          result: toolResult,
        }),
      ),
    );
  }

  const lastCall = toolCalls[toolCalls.length - 1];
  return {
    strategy: "single-tool-router",
    finalText: lastCall ? JSON.stringify(lastCall.result, null, 2) : "No result.",
    toolCalls,
    trace,
  };
}

function appendThoughtTrace(
  trace: RunnerTraceStep[],
  step: string,
  thoughts: string[],
): void {
  for (const thought of thoughts) {
    trace.push({
      kind: "thought",
      detail: `${step}_thought`,
      data: { text: thought },
    });
  }
}

function createDispatchDeclaration(registry: ToolRegistry): FunctionDeclaration {
  return {
    name: DISPATCH_TOOL_NAME,
    description:
      "Route a call to one of the available tools. argumentsJson must be valid JSON.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        toolName: {
          type: "string",
          enum: registry.names(),
          description: "Exact name of the tool to run.",
        },
        argumentsJson: {
          type: "string",
          description:
            "JSON string for tool arguments. Must parse into a JSON object.",
        },
      },
      required: ["toolName", "argumentsJson"],
    },
  };
}

async function resolveDispatchToolArgs(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  toolName: string,
  argsCandidate: JsonObject,
  model: string,
  trace: RunnerTraceStep[],
  generationSettings: GenerationSettings | undefined,
): Promise<{ args: JsonObject; repaired: boolean }> {
  const validation = registry.validateArgs(toolName, argsCandidate);
  if (validation.ok) {
    return { args: validation.args, repaired: false };
  }

  trace.push({
    kind: "repair",
    detail: "dispatch_args_invalid_attempting_llm_repair",
    data: { toolName, reason: validation.error },
  });
  const repairedArgs = await repairDispatchArgsWithLlm(
    client,
    registry,
    userPrompt,
    toolName,
    argsCandidate,
    model,
    trace,
    generationSettings,
  );
  const repairedValidation = registry.validateArgs(toolName, repairedArgs);
  if (!repairedValidation.ok) {
    throw new Error(`Tool args validation failed: ${repairedValidation.error}`);
  }

  return { args: repairedValidation.args, repaired: true };
}

async function repairDispatchArgsWithLlm(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  toolName: string,
  brokenArgs: JsonObject,
  model: string,
  trace: RunnerTraceStep[],
  generationSettings: GenerationSettings | undefined,
): Promise<JsonObject> {
  const response = await client.generateContent({
    model,
    contents: [
      "Repair these tool args so they exactly satisfy the tool JSON schema.",
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
      model,
    ),
  });
  appendThoughtTrace(trace, "repair", response.thoughts ?? []);
  return toJsonObject(parseJsonWithRepair(response.text), "Repaired dispatch args");
}
