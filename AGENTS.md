# AGENTS.md

## Purpose
This repo compares three Gemini tool-call reliability strategies:
- `structured-json`
- `single-tool-router`
- `hybrid-repair`

Use it to test malformed/unstable tool-call handling and compare outcomes.

## Stack
- Runtime/package manager: Bun
- Language: TypeScript (strict)
- LLM SDK: `@google/genai`

## Required env
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`

Resolution priority:
1. `.env.local`
2. process env

## Run
```bash
bun install
bun run check
bun test
```

Run strategies:
```bash
bun run index.ts structured-json "prompt"
bun run index.ts single-tool-router "prompt"
bun run index.ts hybrid-repair "prompt"
bun run tui
bun run index.ts --benchmark --iterations=2
```

Optional flags:
- `--model=...` (default: `gemini-3-flash-preview`)
- `--repair-model=...` (hybrid only)
- `--preset=...`
- `--list-presets`
- `--router-max-turns=...`
- `--hybrid-max-turns=...`
- `--thinking=<true|false>`
- `--reasoning-effort=<minimal|low|medium|high>`
- `--include-thoughts=<true|false>`
- `--max-retries=<n>`
- `--logs`
- `--verbose`
- `--list-models`
- `--benchmark-presets=<all|id1,id2>`
- `--benchmark-strategies=<all|...>`
- `--models=<id1,id2>`
- `--iterations=<n>`

## Architecture (quick map)
- CLI entrypoint: `/Users/pcstyle/projects/tools/gemini-tools-fix/index.ts`
- Shared contracts: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/contracts.ts`
- Gemini client: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/gemini-client.ts`
- Tool registry: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/tool-registry.ts`
- Intent + JSON helpers: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/core`
- Runners: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/runners`
- Tests: `/Users/pcstyle/projects/tools/gemini-tools-fix/test`
- TUI entrypoint: `/Users/pcstyle/projects/tools/gemini-tools-fix/tui.tsx`
- Presets: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/prompt-presets.ts`
- Benchmark engine: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/benchmark.ts`
- Generation settings: `/Users/pcstyle/projects/tools/gemini-tools-fix/src/generation-settings.ts`

## Strategy behavior
### structured-json
- No native function calls.
- Model returns strict JSON intent + strict JSON final response.

### single-tool-router
- Exposes one native function: `dispatch_tool`.
- Supports multi-step loops (`maxTurns`).
- Repairs `argumentsJson` and validates before execution.

### hybrid-repair
- Native function calling for real tools (`VALIDATED` mode).
- Repairs bad args with a structured repair pass.
- Falls back to structured finalization when model text is empty.

## Important implementation detail
- Preserve model-returned function-call content (including `thoughtSignature`) when sending follow-up turns.
- Reconstructing function-call parts can trigger Gemini API `INVALID_ARGUMENT` errors.

## Editing guidelines for contributors/agents
- Keep Bun-only workflows (`bun ...`).
- Do not start a dev server for this repo.
- Add/update tests for behavior changes in runners.
- Prefer schema-constrained outputs for deterministic parsing.
