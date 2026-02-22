# AGENTS.md

## Build / Test
- Runtime & package manager: **Bun** (no Node/npm). TypeScript strict mode.
- `bun install` → `bun run check` (tsc --noEmit) → `bun test`
- Single test: `bun test test/env.test.ts` (pass file path to `bun test`)
- Run a strategy: `bun run index.ts <structured-json|single-tool-router|hybrid-repair> "prompt"`
- TUI: `bun run tui` | Benchmark: `bun run index.ts --benchmark --iterations=2`
- Requires `GEMINI_API_KEY` or `GOOGLE_API_KEY` (resolved from `.env.local` first, then process env).

## Architecture
- **CLI entrypoint**: `index.ts` — parses flags, dispatches to strategy runners or benchmark.
- **Runners** (`src/runners/`): one per strategy (`structured-json`, `single-tool-router`, `hybrid-repair`).
- **Core helpers** (`src/core/`): intent parsing (`intents.ts`), JSON repair (`json-utils.ts`), response utils.
- **Shared contracts** (`src/contracts.ts`): `ToolDefinition`, `RunnerResult`, `ModelClient` interfaces.
- **Supporting modules**: `src/gemini-client.ts` (API wrapper), `src/tool-registry.ts`, `src/prompt-presets.ts`, `src/benchmark.ts`, `src/generation-settings.ts`, `src/model-catalog.ts`.
- **Tests** (`test/`): unit tests with `MockModelClient` from `test/test-helpers.ts`; no live API calls.
- **TUI**: `tui.tsx` — Ink/React interactive terminal UI.

## Code Style & Conventions
- ESM-only (`"type": "module"`); use `import type` for type-only imports (`verbatimModuleSyntax`).
- Libs: `@google/genai`, `zod` (v4) for schemas, `jsonrepair`, `ink`/`react` for TUI. No others.
- Preserve model-returned function-call content (incl. `thoughtSignature`) in follow-up turns; never reconstruct function-call parts (triggers Gemini `INVALID_ARGUMENT`).
- Add/update tests in `test/` for any runner behavior changes. Prefer schema-constrained outputs.
