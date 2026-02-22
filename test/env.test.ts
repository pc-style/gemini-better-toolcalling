import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveEnvSettings } from "../src/env";

describe("env resolution", () => {
  it("prefers .env.local over process env for api key and model", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "gemini-tools-fix-env-"));
    try {
      await writeFile(
        join(cwd, ".env.local"),
        "GOOGLE_API_KEY=local_key\nGEMINI_MODEL=gemini-3.1-pro-preview\n",
        "utf8",
      );

      const result = await resolveEnvSettings({
        cwd,
        env: {
          GOOGLE_API_KEY: "env_key",
          GEMINI_MODEL: "gemini-3-flash-preview",
        },
      });

      expect(result.apiKey).toBe("local_key");
      expect(result.model).toBe("gemini-3.1-pro-preview");
      expect(result.source).toBe("dotenv-local");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

