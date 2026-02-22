import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface EnvResolutionOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedEnv {
  apiKey?: string;
  model?: string;
  source: "dotenv-local" | "process-env" | "none";
}

export async function resolveEnvSettings(
  options: EnvResolutionOptions = {},
): Promise<ResolvedEnv> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const localEnv = await readDotEnvLocal(cwd);

  const localApiKey = localEnv.GOOGLE_API_KEY ?? localEnv.GEMINI_API_KEY;
  const processApiKey = env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY;

  const localModel = localEnv.GEMINI_MODEL;
  const processModel = env.GEMINI_MODEL;

  if (localApiKey || localModel) {
    return {
      apiKey: localApiKey ?? processApiKey,
      model: localModel ?? processModel,
      source: "dotenv-local",
    };
  }

  if (processApiKey || processModel) {
    return {
      apiKey: processApiKey,
      model: processModel,
      source: "process-env",
    };
  }

  return {
    source: "none",
  };
}

async function readDotEnvLocal(cwd: string): Promise<Record<string, string>> {
  const path = join(cwd, ".env.local");
  if (!existsSync(path)) {
    return {};
  }

  const contents = await readFile(path, "utf8");
  const output: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    output[key] = value;
  }

  return output;
}

