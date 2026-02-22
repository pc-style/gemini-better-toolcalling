import { describe, expect, it } from "bun:test";

import { createTestToolRegistry } from "../src/demo-tools";
import { runSingleToolRouterRunner } from "../src/runners/single-tool-router-runner";
import { MockModelClient } from "./test-helpers";

describe("single-tool-router runner", () => {
  it("routes through dispatch_tool and returns final text", async () => {
    const client = new MockModelClient([
      {
        text: "",
        functionCalls: [
          {
            id: "call_1",
            name: "dispatch_tool",
            args: {
              toolName: "sum_numbers",
              argumentsJson: '{"numbers":[2,4,8]}',
            },
          },
        ],
        raw: {},
      },
      {
        text: "The total is 14.",
        functionCalls: [],
        raw: {},
      },
    ]);

    const result = await runSingleToolRouterRunner(
      client,
      createTestToolRegistry(),
      "Add 2, 4, and 8",
      { model: "test-model" },
    );

    expect(result.finalText).toBe("The total is 14.");
    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0]?.args).toEqual({ numbers: [2, 4, 8] });
  });

  it("supports multiple dispatch turns", async () => {
    const client = new MockModelClient([
      {
        text: "",
        functionCalls: [
          {
            id: "call_1",
            name: "dispatch_tool",
            args: {
              toolName: "sum_numbers",
              argumentsJson: '{"numbers":[1,2,3]}',
            },
          },
        ],
        raw: {},
      },
      {
        text: "",
        functionCalls: [
          {
            id: "call_2",
            name: "dispatch_tool",
            args: {
              toolName: "sum_numbers",
              argumentsJson: '{"numbers":[10,20]}',
            },
          },
        ],
        raw: {},
      },
      {
        text: "Done with both calculations.",
        functionCalls: [],
        raw: {},
      },
    ]);

    const result = await runSingleToolRouterRunner(
      client,
      createTestToolRegistry(),
      "Run two calculations and confirm.",
      { model: "test-model", maxTurns: 4 },
    );

    expect(result.finalText).toBe("Done with both calculations.");
    expect(result.toolCalls.length).toBe(2);
    expect(result.toolCalls[0]?.args).toEqual({ numbers: [1, 2, 3] });
    expect(result.toolCalls[1]?.args).toEqual({ numbers: [10, 20] });
  });

  it("preserves raw model function-call content for follow-up turns", async () => {
    const rawModelContent = {
      role: "model",
      parts: [
        {
          functionCall: {
            id: "call_1",
            name: "dispatch_tool",
            args: {
              toolName: "sum_numbers",
              argumentsJson: "{\"numbers\":[2,3]}",
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
            name: "dispatch_tool",
            args: {
              toolName: "sum_numbers",
              argumentsJson: "{\"numbers\":[2,3]}",
            },
          },
        ],
        raw: {
          candidates: [{ content: rawModelContent }],
        },
      },
      {
        text: "The total is 5.",
        functionCalls: [],
        raw: {},
      },
    ]);

    await runSingleToolRouterRunner(
      client,
      createTestToolRegistry(),
      "Add 2 and 3",
      { model: "test-model", maxTurns: 2 },
    );

    const followUpContents = client.calls[1]?.contents;
    if (!Array.isArray(followUpContents)) {
      throw new Error("Expected follow-up contents to be a Content[] array.");
    }

    expect(followUpContents[1]).toBe(rawModelContent);
  });
});
