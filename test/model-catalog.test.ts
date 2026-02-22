import { afterEach, describe, expect, it, mock } from "bun:test";

import { getModelOptions } from "../src/model-catalog";

const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
const originalGeminiApiKey = process.env.GEMINI_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env.GOOGLE_API_KEY = originalGoogleApiKey;
  process.env.GEMINI_API_KEY = originalGeminiApiKey;
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("model catalog", () => {
  it("filters out non-tool-calling or unsupported models", async () => {
    process.env.GOOGLE_API_KEY = "test-key";
    delete process.env.GEMINI_API_KEY;

    const fetchMock = mock(async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-3-flash-preview",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-2.0-flash-lite-001",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-embedding-001",
              supportedGenerationMethods: ["embedContent"],
            },
            {
              name: "models/imagen-4.0-generate-001",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const models = await getModelOptions();

    expect(models).toContain("gemini-3-flash-preview");
    expect(models).not.toContain("gemini-2.0-flash-lite-001");
    expect(models).not.toContain("gemini-embedding-001");
    expect(models).not.toContain("imagen-4.0-generate-001");
  });
});
