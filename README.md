# Gemini Tool-Call Reliability Playground

This repository contains three side-by-side strategies for making Gemini tool
usage more reliable when function calls are malformed or inconsistent.

## Implemented versions

1. `structured-json`
- No native function calling.
- The model must emit strict JSON intent (`call_tool` or `respond`) using
  `responseMimeType: application/json` + `responseJsonSchema`.
- Tool args are validated with Zod before execution.

2. `single-tool-router`
- Native function calling is enabled, but only one tool is exposed:
  `dispatch_tool`.
- The model passes `toolName` and `argumentsJson` (a JSON string).
- `argumentsJson` is repaired with `jsonrepair`, validated, then executed.
- Supports multi-step dispatch loops (multiple tool calls across turns).

3. `hybrid-repair`
- Native per-tool function calling with `VALIDATED` mode.
- If tool args are invalid, args are repaired through a second structured JSON
  repair call.
- If no function call is produced, fallback attempts structured intent.

## Setup

```bash
bun install
```

## Interactive TUI (Ink)

Run:

```bash
bun run tui
```

TUI flow:
- Choose mode: single run or benchmark
- Choose strategy/prompt/presets/model
- Configure settings (thinking, reasoning effort, retries, logs, verbose, etc.)
- Run and inspect results, tool calls, trace, and benchmark aggregates

## Run a strategy

Set your API key first:

```bash
export GEMINI_API_KEY=your_key_here
```

Run:

```bash
bun run index.ts structured-json "What time is it?"
bun run index.ts single-tool-router "Add 4, 7, and 11"
bun run index.ts hybrid-repair "Uppercase the text: reliable tool calls"
bun run index.ts single-tool-router --preset=sum-and-uppercase
```

Optional flags:

- `-h`, `--help` (show CLI usage with examples)
- `--model=...` (override resolved default model)
- `--repair-model=...` (hybrid runner only)
- `--preset=...` (use bundled preset by id as prompt)
- `--router-max-turns=...` (single-tool-router loop cap)
- `--hybrid-max-turns=...` (hybrid-repair loop cap)
- `--thinking=<true|false>`
- `--reasoning-effort=<minimal|low|medium|high>`
- `--include-thoughts=<true|false>`
- `--max-retries=...`
- `--logs`
- `--verbose`
- `--list-presets` (discover bundled prompt ids)
- `--list-models` (discover currently available model ids)

Discoverability commands:

```bash
bun run index.ts --help
bun run index.ts --list-presets
bun run index.ts --list-models
```

## Benchmark CLI

```bash
bun run index.ts --benchmark --iterations=2 --benchmark-presets=all --benchmark-strategies=all --models=gemini-3-flash-preview,gemini-2.5-flash
```

Benchmark flags:
- `--benchmark`
- `--iterations=...`
- `--benchmark-presets=<all|id1,id2>`
- `--benchmark-strategies=<all|structured-json,single-tool-router,hybrid-repair>`
- `--models=<model1,model2,...>`

## Validation and tests

```bash
bun run check
bun test
```

## Notes

- This project uses `@google/genai` and follows Gemini API structured output
  and function-calling patterns.
- The default model is configurable because model availability can change; use
  `--model` or `GEMINI_MODEL` as needed.
- Demo toolset includes math, text transforms, parsing, sorting, and conversion
  tools for quick benchmarking in prompts/TUI.
- API key/model resolution prefers `.env.local` over process env variables.
