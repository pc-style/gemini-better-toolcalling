import { describe, expect, it } from "bun:test";
import type { GenerateContentParameters } from "@google/genai";

import type { ModelClient, ModelResult } from "../src/contracts";
import { runStrategy } from "../src/strategy-runner";

class FlakyStructuredClient implements ModelClient {
  private calls = 0;

  public async generateContent(
    request: GenerateContentParameters,
  ): Promise<ModelResult> {
    this.calls += 1;

    if (this.calls === 1) {
      throw new Error("transient failure");
    }

    const isFinalize =
      typeof request.contents === "string" &&
      request.contents.includes("You are finalizing an assistant reply");

    if (!isFinalize) {
      return {
        text: '{"action":"call_tool","toolName":"sum_numbers","args":{"numbers":[2,3,4]}}',
        functionCalls: [],
        raw: {},
      };
    }

    return {
      text: '{"action":"respond","response":"Total is 9"}',
      functionCalls: [],
      raw: {},
    };
  }
}

describe("strategy runner", () => {
  it("retries and succeeds when maxRetries is set", async () => {
    const result = await runStrategy({
      strategy: "structured-json",
      prompt: "Add 2,3,4",
      model: "test-model",
      maxRetries: 2,
      client: new FlakyStructuredClient(),
      logs: false,
      verbose: false,
    });

    expect(result.finalText).toBe("Total is 9");
    expect(result.attempts).toBe(2);
    expect(result.toolCalls.length).toBe(1);
  });
});

