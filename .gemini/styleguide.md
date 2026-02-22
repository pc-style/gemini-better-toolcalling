# Gemini Review Style Guide

## Purpose
Keep review feedback high-signal for a Bun + TypeScript Gemini tool-calling benchmark project.

## Priorities
1. Runtime correctness and reliability.
2. API compatibility with current Gemini behavior.
3. Deterministic tool-calling behavior and schema adherence.
4. Benchmark fairness and comparability.
5. Developer ergonomics only after correctness.

## What To Flag
- Bugs and regressions that can break runs, benchmarks, or TUI flow.
- Incorrect or fragile Gemini API usage (model config incompatibilities, request/response assumptions, thought/tool-call handling).
- Missing retries/backoff/timeouts where failures can stall or spam.
- Tool-argument validation/repair defects that create false failures.
- Benchmark metric/reporting mistakes that misrepresent strategy outcomes.
- Error handling that hides root causes or blocks recovery.
- Security or privacy issues (key handling, accidental token leakage in logs).

## What Not To Comment On
- Pure praise-only comments.
- Trivial style preferences without impact.
- Low-value nits unless they clearly reduce maintainability risk.
- Repeating the same issue on multiple lines; consolidate into one comment.

## Repo-Specific Expectations
- Use Bun workflows (`bun ...`), not npm.
- Preserve strict TypeScript behavior (no `any` escapes without strong reason).
- Keep model handling defensive: reject/avoid unsupported legacy models.
- Treat logs as operational artifacts: unique file names and failure-safe logger init.
- TUI should remain responsive and non-blocking, with clear status/error feedback.

## Review Comment Quality
- Include concrete impact and failure mode.
- Provide minimal, practical fix direction.
- Prefer one clear actionable comment over multiple vague comments.
- Use severity carefully:
  - `MEDIUM`: user-visible bug risk or reliability issue.
  - `HIGH`/`CRITICAL`: data loss, security, hard runtime failure, or severe reliability regression.

