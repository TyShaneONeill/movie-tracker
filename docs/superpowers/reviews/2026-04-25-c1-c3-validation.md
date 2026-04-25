# C1-C3 Validation Against Current Sentry API — 2026-04-25

**Verdict (TL;DR): ALL THREE CONFIRMED.** Refactor `_shared/sentry-feedback.ts` before client-side work proceeds.

---

## C1 — User-feedback endpoint deprecated. **CONFIRMED.**

`sentry-feedback.ts:31-56` POSTs `/projects/{org}/{project}/user-feedback/` with a generated `event_id`.

**Source:** [docs.sentry.io/api/projects/submit-user-feedback/](https://docs.sentry.io/api/projects/submit-user-feedback/) header reads:

> "This endpoint is DEPRECATED. We document it here for older SDKs and users who are still migrating to the User Feedback Widget or API."
> "Feedback must be received by the server no more than 30 minutes after the event was saved."

The 30-min window implicitly requires a real prior event. Our generated UUID has no envelope behind it, so the call 4xxs or is dropped at relay.

**Modern path:** `Sentry.captureFeedback()` is standalone (no event association required) and exposed by `npm:@sentry/deno` ([JS user-feedback docs](https://docs.sentry.io/platforms/javascript/user-feedback/), [config](https://docs.sentry.io/platforms/javascript/user-feedback/configuration/)).

**Recommended fix (use SDK, not raw envelope):**

```ts
import * as Sentry from 'npm:@sentry/deno';
Sentry.init({ dsn: Deno.env.get('SENTRY_DSN')!, tracesSampleRate: 0 });

const eventId = Sentry.captureFeedback(
  { name: args.name, email: args.email ?? undefined, message: args.comments },
  { captureContext: { tags: args.tags } }
);
await Sentry.flush(2000);
return eventId;
```

Tags travel in-band; no follow-up call. SDK handles envelopes/retries.

---

## C2 — Tags PUT + comments field path. **CONFIRMED (both).**

**C2a — Events are immutable.** [docs.sentry.io/api/events/retrieve-an-event-for-a-project/](https://docs.sentry.io/api/events/retrieve-an-event-for-a-project/) documents only `GET /api/0/projects/{org}/{project}/events/{event_id}/`. The [Events & Issues index](https://docs.sentry.io/api/events/) lists no PUT/PATCH on events; only "Bulk Mutate **Issues**" exists. Our PUT will 405/404.

**C2b — Wrong field path.** [develop.sentry.dev/sdk/telemetry/feedbacks/](https://develop.sentry.dev/sdk/telemetry/feedbacks/): the message lives at `contexts.feedback.message`:

> "The `contexts.feedback` object contains: `name`, `contact_email`, `message`, `url`, `source`, `associated_event_id`. All optional except `message`."

Neither `user.comments` nor top-level `comments` exists on the event. (Legacy `user-feedback` had `comments` on a *report* record — separate object the events API never returns.)

**Recommended fix:** if C1 uses the SDK, C2 collapses.
- Tags: `captureContext.tags` at capture (see C1).
- `analyze-bug-report:80` becomes:
  ```ts
  const message = feedback?.contexts?.feedback?.message ?? feedback?.message ?? '';
  ```
  Drop the `\n\n` title/description packing — store title in a `bug_title` tag, use `message` for description alone.

---

## C3 — `fetchFeedbackEvent` query is wrong. **CONFIRMED.**

`sentry-feedback.ts:141-147` builds `/projects/{org}/{project}/events/?query=user.id:X+event.type:error&start=…&end=…&limit=5`.

[docs.sentry.io/api/events/list-a-projects-error-events/](https://docs.sentry.io/api/events/list-a-projects-error-events/) documents exactly: `statsPeriod`, `start`, `end`, `cursor`, `full`, `sample`. **No `query=`, no `limit=`.** Our filter is silently dropped → entire project firehose for that window.

The endpoint that supports Discover-style `query=` is [list-an-organizations-issues](https://docs.sentry.io/api/events/list-an-organizations-issues/): parameters include `environment`, `project` (numeric ids), `statsPeriod`, `start`, `end`, `query`, `sort`, `limit`. `user.id` and `event.type` are valid searchable properties ([events search docs](https://docs.sentry.io/concepts/search/searchable-properties/events/)).

**Recommended fix:**

```ts
const issuesUrl =
  `${BASE}/organizations/${SENTRY_ORG}/issues/` +
  `?query=${encodeURIComponent(`user.id:${userId} event.type:error`)}` +
  `&project=${SENTRY_PROJECT_ID}` +    // numeric, NOT slug
  `&start=${after.toISOString()}&end=${before.toISOString()}&limit=5`;
```

Resolve top issues to latest event via `GET /api/0/organizations/{org}/issues/{issue_id}/events/?limit=1&sort=-timestamp` ([list-an-issues-events](https://docs.sentry.io/api/events/list-an-issues-events/)).

Adds `SENTRY_PROJECT_ID` env var (numeric); slug stays for project-scoped GETs.

---

## Refactor scope

**`_shared/`:** 1 file (`sentry-feedback.ts`) — rewrite `submitSentryFeedback`, **delete** `attachFeedbackTags`, rewrite `fetchFeedbackEvent`. `attachScreenshot`/`postSentryComment` untouched.

**Public API stability:**
- `submitSentryFeedback(args)` — **signature stable**; `submit-bug-report:108-115` unchanged. Drop now-redundant tag call at lines 127-132.
- `attachFeedbackTags` — **removed**. One caller deleted.
- `fetchFeedbackEvent` — **return shape stable** (`{ event, relatedErrors }`); internals only.
- `analyze-bug-report:80-82` — one-line `contexts.feedback.message` fix.

**Cascade:** 2 callers, surgical. No type changes to client code.

**New env vars:** `SENTRY_DSN`, `SENTRY_PROJECT_ID`. **Cold-start cost** of `npm:@sentry/deno` ~150-300ms first invoke, warm negligible. **Tests:** rewrite `sentry-feedback.test.ts`; update analyze fixture. **Effort:** ~6h with curl smoke-test.

---

## Spec/plan accuracy

Plan ([2026-04-24-bug-reporting-system.md](../plans/2026-04-24-bug-reporting-system.md), Tasks 4-5) cited the deprecated endpoint directly — that doc page **carries the deprecation banner today**. Implementer followed faithfully; plan was authored against outdated reference. Plan also assumed `user.comments` on the event, confusing legacy *report* with modern *event* schema. **Action:** add a "doc currency check" step to `Workflows/` planning checklist — fetch cited URLs, confirm no deprecation banner, list parameters before implementation.

---

## C4+ — New issues found during validation

**C5 — `postSentryComment` URL likely wrong.** Uses `/organizations/${SENTRY_ORG}/issues/${issue_id}/comments/`. The documented form is issue-scoped (`/api/0/issues/{issue_id}/comments/`). Verify with curl before relying on it.

**C6 — Sentry web link uses legacy `/organizations/` prefix** (`submit-bug-report:140`). Current Sentry UI dropped that prefix late 2024; redirects today but should be updated to `https://${SENTRY_ORG}.sentry.io/issues/?query=event_id:${event_id}`.

---

## Sources

- [Submit User Feedback (DEPRECATED)](https://docs.sentry.io/api/projects/submit-user-feedback/)
- [Set Up User Feedback (JS)](https://docs.sentry.io/platforms/javascript/user-feedback/) · [config](https://docs.sentry.io/platforms/javascript/user-feedback/configuration/)
- [Feedbacks (Develop SDK telemetry)](https://develop.sentry.dev/sdk/telemetry/feedbacks/)
- [Retrieve an Event for a Project](https://docs.sentry.io/api/events/retrieve-an-event-for-a-project/) · [Events & Issues index](https://docs.sentry.io/api/events/)
- [List a Project's Error Events](https://docs.sentry.io/api/events/list-a-projects-error-events/) · [List an Organization's Issues](https://docs.sentry.io/api/events/list-an-organizations-issues/) · [List an Issue's Events](https://docs.sentry.io/api/events/list-an-issues-events/)
- [Searchable Event Properties](https://docs.sentry.io/concepts/search/searchable-properties/events/)
- [@sentry/deno (npm)](https://www.npmjs.com/package/@sentry/deno)
