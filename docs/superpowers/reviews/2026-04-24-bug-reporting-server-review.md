# Bug Reporting Server-Side Review — 2026-04-24

**Reviewed:** Tasks 1–11 of `docs/superpowers/plans/2026-04-24-bug-reporting-system.md`
**Base SHA:** `d6840a6` (plan commit)
**Head SHA:** `9c0b461` (analyze-bug-report shipped)
**CI status at review:** lint 0 errors, tsc clean, 806/806 tests pass
**Reviewer model:** Code-reviewer agent (Opus)

## TL;DR

Solid implementation that follows the plan faithfully. **3 critical findings** require validation against current Sentry API docs before client-side work proceeds. 10 important findings can be folded into a hardening pass after client lands. Several minor suggestions for style/perf.

## Critical findings (block client-side work without resolution)

### C1. Sentry user-feedback endpoint is deprecated

`sentry-feedback.ts:31-56` POSTs to `/projects/{org}/{project}/user-feedback/` with a generated `event_id`. Per the reviewer, this endpoint is documented as DEPRECATED — feedback must be associated with an existing event captured ≤30 minutes prior. With a freshly-generated UUID and no real event, submissions likely return 4xx or silently drop.

**Recommended fix:** migrate to one of:
1. **`Sentry.captureFeedback()` via `@sentry/deno` SDK** (modern path; supports standalone feedback post-2024). Init SDK in edge function, call SDK method, get feedback id back.
2. **Direct envelope POST** to `https://o<org_id>.ingest.sentry.io/api/<project_id>/envelope/` with item type `feedback`. More maintenance, no SDK runtime cost.
3. **Capture error event first, then attach feedback.** Pollutes issue stream and triggers alerting incorrectly — not recommended.

**Verification needed:** independently confirm against current Sentry API docs (post-2024 user feedback widget docs). The reviewer's claim is strong but Sentry's API surface changes.

### C2. Tags round-trip is broken

(a) `attachFeedbackTags` PUTs to `/events/{event_id}/` — Sentry events are immutable. Tag mutation via PUT will 4xx.

(b) `analyze-bug-report/index.ts:80` reads `feedback?.user?.comments ?? feedback?.comments` to extract title/description. The actual feedback event field depends on which API path was used to write — neither matches what we're writing today.

**Recommended fix:** if C1's fix uses the SDK, tags become a `hint` argument and field paths become well-defined. If C1's fix uses raw envelope, document the exact JSON shape we're posting and parse the same shape on analyze side.

### C3. `fetchFeedbackEvent` related-errors query is wrong

`sentry-feedback.ts:141-147` builds a URL using the project events endpoint with a `query=` param. Filtered event search needs the org-scoped Discover events endpoint with `project=<numeric_id>`, not the project slug. Currently always returns 4xx or empty array → analyze always runs without source-mapped error context (defeating the entire RAG layer that replaced graphify).

**Recommended fix:** switch to `/organizations/{org}/issues/?query=user.id:${userId}+event.type:error&statsPeriod=10m&project=${projectId}`, then resolve top issues to latest events via `/organizations/{org}/issues/{issue_id}/events/latest/`.

### C4. SENTRY_ORG/PROJECT slug values need deploy-time validation

The codebase uses both as path segments without validating they resolve. Recommend a boot-time check in submit/analyze that fetches `/organizations/{SENTRY_ORG}/projects/` and confirms `SENTRY_PROJECT` is in the list, failing loudly if not.

## Important findings (fix opportunistically before merge)

| # | Issue | File:Line | Action |
|---|---|---|---|
| I1 | `\r` not flattened in `sanitizeDescription`; analyze split on `\n\n` could leak | `bug-report-sanitize.ts:24-26` | Add `\r` flattening, or use `split(/\r?\n\r?\n/)` |
| I2 | `\n\n` delimiter packing title+description is fragile | `submit-bug-report:113`, `analyze-bug-report:81-82` | If C1 fix uses SDK, put title in a tag (`bug_title`) — message body becomes description alone |
| I3 | Anthropic SDK 0.30.0 is old; `(c: any)` narrowing | `claude-client.ts:1, 73` | Bump SDK; verify `claude-sonnet-4-6` model id at deploy time |
| I4 | No `cache_control` on system prompt — paying full read on every call | `claude-client.ts:50-60` | Add ephemeral cache_control to system block (~25% cost cut) |
| I5 | No daily AI spend cap on analyze function | `analyze-bug-report` | Use existing `cost-tracking.ts` `checkDailyAiSpend(adminClient, 5.0)` and `logAiCost` after Claude call |
| I6 | "topInApp" frame slice naming misleading | `bug-report-context.ts:69` | Rename or document — `slice(-3)` is correct (deepest frames) but name suggests "top" |
| I7 | analyze-bug-report has no idempotency / per-event rate limit | `analyze-bug-report` | `enforceRateLimit('system', 'analyze_bug_report_event_${event_id}', 1, 3600, req)` |
| I8 | Discord "threading" is just a follow-up message referencing parent ID | `discord-webhook.ts:76-106` | Real options: (a) `thread_name` param creates a forum thread, (b) PATCH the original message in-place |
| I9 | CORS on analyze-bug-report unnecessary (webhook only, no browser) | `analyze-bug-report:21-22, 26` | Drop CORS; add `User-Agent` check for `Sentry-Hookshot/*` |
| I10 | 1500ms Discord timeout too tight for analysis post (have 10s budget) | `discord-webhook.ts:97` | 5000ms |

## Suggestions (absorb into final pass)

- **S1:** Type-extraction fix (`bug-analysis-types.ts`) was correct and proportionate. Keep.
- **S2:** Base64 decode could use `Uint8Array.fromBase64()` (Deno-standard) for speed.
- **S3:** Missing PNG/JPEG magic-byte check on screenshot (spec asked for it; only size is checked today).
- **S4:** No integration test for `submit-bug-report` handler itself — only its modules. Add a Deno test exercising the full pipeline.
- **S5:** `account_tier` lookup costs a service-role round-trip per submit. Could be in JWT claims.
- **S6:** `bug-report-context.ts` frame template trailing-arrow rendering — verify against real Sentry payload via fixture test.
- **S7:** Edge functions should `import "jsr:@supabase/functions-js/edge-runtime.d.ts";` for type defs (existing convention; submit/analyze omit).

## What was done well

- PII scrub regex set is the right minimal set, with deliberate non-match on hyphenated digits
- XML-delimited prompt + tool-use output is a real prompt-injection defense, not a checkbox
- HMAC constant-time comparison correctly implemented
- Server-side re-enforcement of length limits (no silent truncation)
- Two-tier rate limit reuses existing infra
- Test coverage on pure modules: 14+11+4+4+3+3 = 39 unit tests
- Structured JSON logging throughout
- Fallback comment paths preserve "user already saw success" principle

## Next-action recommendation

1. **Block on C1, C2, C3.** Verify Sentry API state via current docs (Context7 MCP or sentry.io/api/0/ docs). If reviewer is correct, refactor `sentry-feedback.ts` + analyze parser to use a working ingestion path. Estimated ~1 day.
2. **C4** is low-effort, fold into the same PR as C1 fix.
3. **Important issues** can be batched into a "harden bug-report server" PR after client lands.
4. **Client-side tasks 12–19** can technically proceed in parallel since the HTTP contract is unchanged, but the reviewer recommends waiting until end-to-end is verified against a real Sentry project (smoke-test via curl per Task 20.5).

## Files reviewed

22 files including all server-side implementation, all tests, the spec, the plan, and 2 existing edge functions for pattern comparison.
