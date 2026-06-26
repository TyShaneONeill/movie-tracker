// Internal / test accounts to exclude from product analytics (founder + E2E).
//
// Tagged onto the PostHog person via `is_internal` at identify time (see
// app/_layout.tsx `useAnalyticsIdentity`). The daily Discord metrics digest
// (supabase/functions/post-daily-metrics) and any PostHog dashboard can then
// filter on `person.properties.is_internal` instead of hardcoding emails.
//
// Keep this list in sync with INTERNAL_EMAILS in post-daily-metrics/index.ts
// until every active account has been tagged (then the digest can rely solely
// on the property).
export const INTERNAL_EMAILS = ['tyoneill97@gmail.com', 'g@g.g'];

/** True if the email belongs to a founder/test account excluded from metrics. */
export function isInternalEmail(email?: string | null): boolean {
  return !!email && INTERNAL_EMAILS.includes(email.trim().toLowerCase());
}
