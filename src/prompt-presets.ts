import type { Strategy } from "./strategy-runner";

export interface PromptPreset {
  id: string;
  title: string;
  prompt: string;
  description: string;
  recommendedStrategy: Strategy;
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "sum-and-uppercase",
    title: "Sum + Uppercase",
    description: "Simple multi-intent request with arithmetic + text transform.",
    prompt:
      "Use tools when needed: add 9, 12, and 30, then give me the uppercase word done.",
    recommendedStrategy: "single-tool-router",
  },
  {
    id: "timezone-check",
    title: "Localized Current Time",
    description: "Forces a locale-aware time tool call.",
    prompt:
      "What is the current time for Tokyo locale and explain in one sentence?",
    recommendedStrategy: "structured-json",
  },
  {
    id: "temp-conversion",
    title: "Temperature Conversion",
    description: "Unit conversion with deterministic expected answer.",
    prompt:
      "Convert 95 Fahrenheit to Celsius and also convert 0 Celsius to Fahrenheit.",
    recommendedStrategy: "hybrid-repair",
  },
  {
    id: "extract-emails",
    title: "Extract Emails",
    description: "Text parsing and deduping from noisy content.",
    prompt:
      "Extract unique emails from this text and summarize count: support@acme.io, test@acme.io, support@acme.io, hello@example.com.",
    recommendedStrategy: "structured-json",
  },
  {
    id: "multi-step-router",
    title: "Forced Multi-Step",
    description: "Encourages at least two tool calls in sequence.",
    prompt:
      "Use separate tool calls: first multiply 3, 4, and 5. Then uppercase the word shipped. Return one sentence.",
    recommendedStrategy: "single-tool-router",
  },
  {
    id: "markdown-report",
    title: "Mini Report",
    description: "Uses word stats + slug generation for content tooling.",
    prompt:
      "Analyze this text for word stats and generate a slug title: 'Gemini tool reliability is improving quickly this quarter'.",
    recommendedStrategy: "hybrid-repair",
  },
  {
    id: "extract-number-sequence",
    title: "Number Sequence Parse",
    description: "Extract numeric sequence from noisy text and summarize findings.",
    prompt:
      "Extract all numbers from this text with duplicates kept: release 1 had 2 regressions, release 2 had 0, and release 3 had 2.",
    recommendedStrategy: "structured-json",
  },
  {
    id: "percentage-check",
    title: "Percentage Calculation",
    description: "Compute deterministic percentages with explicit precision.",
    prompt:
      "Use a tool to calculate percentage for 23 out of 40 with 1 decimal precision, then explain the result briefly.",
    recommendedStrategy: "hybrid-repair",
  },
  {
    id: "excerpt-then-uppercase",
    title: "Excerpt + Transform",
    description: "Forces sequential text tooling with truncation plus formatting.",
    prompt:
      "Use separate tool calls: first trim this sentence to max 24 chars with ellipsis: ' Gemini tool reliability benchmark output is now easier to compare '. Then uppercase the excerpt and return one sentence.",
    recommendedStrategy: "single-tool-router",
  },
];
