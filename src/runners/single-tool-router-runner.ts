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

import type { ModelClient, RunnerResult, RunnerTraceStep } from "../contracts";
import type { GenerationSettings } from "../generation-settings";
import { applyGenerationSettings } from "../generation-settings";
import {
  buildFinalResponsePrompt,
  finalResponseJsonSchema,
  parseFinalResponseText,
} from "../core/intents";
import { parseObjectWithRepair } from "../core/json-utils";
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

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const request: GenerateContentParameters = {
      model: options.model,
      contents,
      config: applyGenerationSettings(
        {
        tools: [{ functionDeclarations: [dispatchDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.VALIDATED,
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
    const validation = registry.validateArgs(toolName, maybeArgs);
    if (!validation.ok) {
      throw new Error(`Tool args validation failed: ${validation.error}`);
    }

    const toolResult = await registry.execute(toolName, validation.args, {
      now: new Date(),
    });
    toolCalls.push({
      toolName,
      args: validation.args,
      result: toolResult,
      repaired: false,
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
