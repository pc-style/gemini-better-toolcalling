import type { GenerateContentParameters } from "@google/genai";

import type { ModelClient, ModelResult } from "../src/contracts";

export class MockModelClient implements ModelClient {
  private readonly responses: ModelResult[];
  public calls: GenerateContentParameters[] = [];

  public constructor(responses: ModelResult[]) {
    this.responses = responses;
  }

  public async generateContent(
    request: GenerateContentParameters,
  ): Promise<ModelResult> {
    this.calls.push(request);
    const next = this.responses.shift();
    if (!next) {
      throw new Error("No more mock responses configured.");
    }
    return next;
  }
}

