import { describe, expect, it } from "bun:test";

import { createTestToolRegistry } from "../src/demo-tools";
import { runHybridRepairRunner } from "../src/runners/hybrid-repair-runner";
import { MockModelClient } from "./test-helpers";

describe("hybrid-repair runner", () => {
  it("repairs invalid function-call args via structured repair step", async () => {
    const client = new MockModelClient([
      {
        text: "",
        functionCalls: [
          {
            id: "call_1",
            name: "sum_numbers",
            args: {
              numbers: ["1", "2", "3"],
            },
          },
        ],
        raw: {},
      },
      {
        text: '{"numbers":[1,2,3]}',
        functionCalls: [],
        raw: {},
      },
      {
        text: "The sum is 6.",
        functionCalls: [],
        raw: {},
      },
    ]);

    const result = await runHybridRepairRunner(
      client,
      createTestToolRegistry(),
      "Add 1 2 3",
      { model: "test-model", repairModel: "repair-model", maxTurns: 2 },
    );

    expect(result.finalText).toBe("The sum is 6.");
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0]?.repaired).toBe(true);
    expect(result.toolCalls[0]?.args).toEqual({ numbers: [1, 2, 3] });
  });

  it("reuses raw function-call content in subsequent turn context", async () => {
    const rawModelContent = {
      role: "model",
      parts: [
        {
          functionCall: {
            id: "call_1",
            name: "sum_numbers",
            args: {
              numbers: [4, 6],
            },
          },
        },
        {
          thought: true,
          thoughtSignature: "opaque-signature",
        },
      ],
    };

    const client = new MockModelClient([
      {
        text: "",
        functionCalls: [
          {
            id: "call_1",
            name: "sum_numbers",
            args: {
              numbers: [4, 6],
            },
          },
        ],
        raw: {
          candidates: [{ content: rawModelContent }],
        },
      },
      {
        text: "The sum is 10.",
        functionCalls: [],
        raw: {},
      },
    ]);

    await runHybridRepairRunner(
      client,
      createTestToolRegistry(),
      "Add 4 and 6",
      { model: "test-model", maxTurns: 2 },
    );

    const followUpContents = client.calls[1]?.contents;
    if (!Array.isArray(followUpContents)) {
      throw new Error("Expected follow-up contents to be a Content[] array.");
    }

    expect(followUpContents[1]).toBe(rawModelContent);
  });
});
