import { describe, expect, it } from "bun:test";

import { createTestToolRegistry } from "../src/demo-tools";
import { runStructuredJsonRunner } from "../src/runners/structured-json-runner";
import { MockModelClient } from "./test-helpers";

describe("structured-json runner", () => {
  it("repairs malformed JSON intent and executes tool", async () => {
    const client = new MockModelClient([
      {
        text: '{"action":"call_tool","toolName":"sum_numbers","args":{"numbers":[1,2,3],},}',
        functionCalls: [],
        raw: {},
      },
      {
        text: '{"action":"respond","response":"Total is 6"}',
        functionCalls: [],
        raw: {},
      },
    ]);

    const result = await runStructuredJsonRunner(
      client,
      createTestToolRegistry(),
      "Add 1, 2, and 3",
      { model: "test-model" },
    );

    expect(result.finalText).toBe("Total is 6");
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0]?.toolName).toBe("sum_numbers");
  });
});

