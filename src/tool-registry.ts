import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";

import type {
  JsonObject,
  ToolDefinition,
  ToolExecutionContext,
} from "./contracts";

interface ValidationSuccess {
  ok: true;
  args: JsonObject;
}

interface ValidationFailure {
  ok: false;
  error: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  public register<Args extends JsonObject>(tool: ToolDefinition<Args>): void {
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public names(): string[] {
    return [...this.tools.keys()];
  }

  public getArgsJsonSchema(name: string): unknown {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return z.toJSONSchema(tool.argsSchema);
  }

  public describeForPrompt(): Array<Record<string, unknown>> {
    return this.names().map((name) => {
      const tool = this.tools.get(name);
      if (!tool) {
        return {};
      }

      return {
        name: tool.name,
        description: tool.description,
        argsSchema: this.getArgsJsonSchema(name),
      };
    });
  }

  public toFunctionDeclarations(): FunctionDeclaration[] {
    return this.names().map((name) => {
      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      return {
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: this.getArgsJsonSchema(name),
      };
    });
  }

  public validateArgs(name: string, raw: unknown): ValidationResult {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }

    const parsed = tool.argsSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues
          .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "root";
            return `${path}: ${issue.message}`;
          })
          .join("; "),
      };
    }

    return { ok: true, args: parsed.data };
  }

  public async execute(
    name: string,
    args: JsonObject,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return tool.execute(args, context);
  }
}
