import type { GenerateContentParameters } from "@google/genai";

import type { ModelClient, RunnerResult, RunnerTraceStep } from "../contracts";
import type { GenerationSettings } from "../generation-settings";
import { applyGenerationSettings } from "../generation-settings";
import { ToolRegistry } from "../tool-registry";
import {
  buildFinalResponsePrompt,
  buildToolSelectionPrompt,
  finalResponseJsonSchema,
  parseFinalResponseText,
  parseToolIntentText,
  toolIntentJsonSchema,
} from "../core/intents";

export interface StructuredJsonRunnerOptions {
  model: string;
  generationSettings?: GenerationSettings;
}

export async function runStructuredJsonRunner(
  client: ModelClient,
  registry: ToolRegistry,
  userPrompt: string,
  options: StructuredJsonRunnerOptions,
): Promise<RunnerResult> {
  const trace: RunnerTraceStep[] = [];
  const toolCalls: RunnerResult["toolCalls"] = [];

  const request: GenerateContentParameters = {
    model: options.model,
    contents: buildToolSelectionPrompt(userPrompt, registry),
    config: applyGenerationSettings(
      {
      responseMimeType: "application/json",
      responseJsonSchema: toolIntentJsonSchema(),
      },
      options.generationSettings,
      options.model,
    ),
  };

  trace.push({ kind: "llm", detail: "request_tool_intent" });
  const response = await client.generateContent(request);
  appendThoughtTrace(trace, "intent", response.thoughts ?? []);
  trace.push({
    kind: "llm",
    detail: "received_tool_intent",
    data: { textLength: response.text.length },
  });

  const intent = parseToolIntentText(response.text);
  trace.push({
    kind: "intent",
    detail: "parsed_intent",
    data: { action: intent.action },
  });

  if (intent.action === "respond") {
    if (!intent.response) {
      throw new Error("Missing response for action=respond");
    }
    return {
      strategy: "structured-json",
      finalText: intent.response,
      toolCalls,
      trace,
    };
  }

  if (!intent.toolName || !intent.args) {
    throw new Error("Missing toolName/args for action=call_tool");
  }

  const validation = registry.validateArgs(intent.toolName, intent.args);
  if (!validation.ok) {
    throw new Error(`Tool args validation failed: ${validation.error}`);
  }

  const result = await registry.execute(intent.toolName, validation.args, {
    now: new Date(),
  });
  toolCalls.push({
    toolName: intent.toolName,
    args: validation.args,
    result,
    repaired: false,
  });

  const finalizeRequest: GenerateContentParameters = {
    model: options.model,
    contents: buildFinalResponsePrompt(
      userPrompt,
      intent.toolName,
      validation.args,
      result,
    ),
    config: applyGenerationSettings(
      {
      responseMimeType: "application/json",
      responseJsonSchema: finalResponseJsonSchema(),
      },
      options.generationSettings,
      options.model,
    ),
  };

  trace.push({ kind: "llm", detail: "request_final_response" });
  const finalizeResponse = await client.generateContent(finalizeRequest);
  appendThoughtTrace(trace, "finalize", finalizeResponse.thoughts ?? []);
  const finalText = parseFinalResponseText(finalizeResponse.text);

  return {
    strategy: "structured-json",
    finalText,
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
