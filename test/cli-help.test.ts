import { describe, expect, it } from "bun:test";

describe("cli help", () => {
  it("prints usage for --help", () => {
    const result = Bun.spawnSync({
      cmd: ["bun", "run", "index.ts", "--help"],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();

    expect(result.exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Gemini Tool-Call Reliability Playground CLI");
    expect(stdout).toContain("Usage (single run):");
    expect(stdout).toContain("--list-models");
  });
});
