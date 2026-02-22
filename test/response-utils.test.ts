import { describe, expect, it } from "bun:test";

import { extractFirstModelFunctionCallContent } from "../src/core/response-utils";

describe("extractFirstModelFunctionCallContent", () => {
  it("returns original candidate content with function-call parts", () => {
    const content = {
      role: "model",
      parts: [
        {
          functionCall: {
            id: "call_1",
            name: "sum_numbers",
            args: { numbers: [1, 2] },
          },
        },
        {
          thought: true,
          thoughtSignature: "opaque-signature",
        },
      ],
      extraField: "keep-me",
    };

    const extracted = extractFirstModelFunctionCallContent({
      candidates: [{ content }],
    });

    expect(extracted).toBe(content);
  });

  it("returns null when candidate content has no function call", () => {
    const extracted = extractFirstModelFunctionCallContent({
      candidates: [{ content: { role: "model", parts: [{ text: "hello" }] } }],
    });

    expect(extracted).toBeNull();
  });
});
