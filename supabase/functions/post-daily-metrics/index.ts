import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// post-daily-metrics
// Called by pg_cron daily at 12:00 UTC (8am ET).
// Queries PostHog for the past 24 hours of key events and posts a digest embed
// to the Discord #metrics channel.
//
// Secrets required (set via `supabase secrets set`):
//   POSTHOG_PERSONAL_API_KEY  — Personal API key from PostHog Settings → Personal API Keys
//                               (different from the project capture key used in the app)
//   POSTHOG_PROJECT_ID        — Numeric project ID from PostHog project settings URL
//   DISCORD_METRICS_WEBHOOK_URL — Discord webhook URL for the #metrics channel

const POSTHOG_BASE = "https://app.posthog.com";

// "Engaged active user" = a distinct person who took a REAL in-app action in the
// window. This deliberately excludes the two signals that inflate a naive
// count(DISTINCT person_id): the native SDK's `Application Opened` (fires on
// background/widget/push wakes) and anonymous `$pageview` traffic to the SEO
// movie pages. Cross-platform (web + mobile). See vault PRD "Analytics
// Instrumentation Fix (MAU + Discord)".
const ENGAGED_EVENTS = [
  "nav:tab_switch", "movie:view", "tv:view", "feed:view", "feed:item_tap",
  "movie:search", "movie:watchlist_add", "movie:rate", "review:create",
  "first_take:create", "journey:view", "scan:attempt", "scan:success",
  "social:follow", "social:like", "social:comment",
  "onboarding:step", "onboarding:complete", "premium:upgrade_view", "premium:subscribe",
];

// Internal/test accounts excluded from analytics (founder + E2E). Keep in sync with
// lib/internal-accounts.ts, which tags `is_internal` on the PostHog person at identify time.
const INTERNAL_EMAILS = ["tyoneill97@gmail.com", "g@g.g", "tyshaneoneill@gmail.com"];

// Stock emulator/simulator device-name PATTERNS (ILIKE) — Google Play pre-launch reports, CI,
// and local sims. Patterns, not exact names: device farms rotate images (arm64/x86_64/legacy),
// and an exact denylist silently re-inflates when a new image appears.
// Keep in sync with the PostHog project-level filter if one is added.
const EMULATOR_DEVICE_PATTERNS = [
  "sdk_gphone%", // modern AVD images (sdk_gphone64_arm64, sdk_gphone64_x86_64, ...)
  "%Simulator%", // iOS Simulator ("Simulator iOS")
  "Android SDK built for%", // legacy AVD images
  "generic_x86%", // legacy generic images
];

interface HogQLResult {
  results?: Array<Array<number>>;
}

async function queryPostHog(
  projectId: string,
  apiKey: string,
  hogql: string,
  signal: AbortSignal,
): Promise<number | "—"> {
  try {
    const res = await fetch(
      `${POSTHOG_BASE}/api/projects/${projectId}/query/`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
        signal,
      },
    );
    if (!res.ok) {
      console.error(
        `[post-daily-metrics] PostHog query failed (${res.status}): ${hogql.slice(0, 80)}`,
      );
      return "—";
    }
    const data: HogQLResult = await res.json();
    return data.results?.[0]?.[0] ?? 0;
  } catch (err) {
    console.error(`[post-daily-metrics] Query error for: ${hogql.slice(0, 80)}`, err);
    return "—";
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }


  const POSTHOG_PERSONAL_API_KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY");
  const POSTHOG_PROJECT_ID = Deno.env.get("POSTHOG_PROJECT_ID");
  const DISCORD_METRICS_WEBHOOK_URL = Deno.env.get(
    "DISCORD_METRICS_WEBHOOK_URL",
  );

  if (!POSTHOG_PERSONAL_API_KEY || !POSTHOG_PROJECT_ID || !DISCORD_METRICS_WEBHOOK_URL) {
    console.error(
      "[post-daily-metrics] Missing required secrets (POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, or DISCORD_METRICS_WEBHOOK_URL)",
    );
    return new Response(JSON.stringify({ error: "Missing secrets" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Wrap all PostHog calls in a 20s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const query = (hogql: string) =>
      queryPostHog(POSTHOG_PROJECT_ID, POSTHOG_PERSONAL_API_KEY, hogql, controller.signal);

    const engagedEventList = ENGAGED_EVENTS.map((e) => `'${e}'`).join(",");
    const internalEmailList = INTERNAL_EMAILS.map((e) => `'${e}'`).join(",");
    // person.properties.email is NULL for anonymous users — keep those, drop the named internal accounts.
    const notInternal =
      `(person.properties.email IS NULL OR person.properties.email NOT IN (${internalEmailList}))`;

    // Clean active-user definition (PRD "Analytics Instrumentation Fix"): `app:session_start`
    // fires once per real session on every platform (Android/iOS/iPadOS/web), so a distinct
    // person_id count over it is the canonical DAU/MAU, replacing the event-allowlist proxy.
    // `is_internal` is a Boolean person property, but under person-on-events its value on
    // `events.person.properties.*` reflects what was set AT INGESTION TIME per row — an
    // internal person can have some session_start events tagged is_internal=true and others
    // (same day, same person) with it unset, since identity merges and property backfills
    // don't rewrite historical rows. A row-level `events.person.properties.is_internal != true`
    // filter only drops the tagged rows, not the person, so they still surface in
    // count(DISTINCT person_id) via their other rows. Excluding by person_id against the
    // `persons` table's current property value removes the person from the count entirely.
    // Belt-and-braces: also exclude by email, since an account can go un-tagged until the
    // client build carrying the current INTERNAL_EMAILS list ships (see lib/internal-accounts.ts).
    const notInternalPerson =
      `person_id NOT IN (SELECT id FROM persons WHERE properties.is_internal = true OR properties.email IN (${internalEmailList}))`;

    // Device-farm exclusion (burned 2026-07-07): Google Play pre-launch reports and CI runs
    // create real-looking persons from stock emulator images — ~100 of them inflated the
    // Jun 29-30 cohort and pushed "clean MAU" from 24 to 126. `$device_name` is an event-time
    // fact, so a row-level filter IS correct here (unlike is_internal above): an emulator-only
    // persona has no surviving rows and drops out of count(DISTINCT person_id), while a real
    // user's real-device sessions still count.
    const notEmulatorDevice = `(properties.$device_name IS NULL OR NOT (${
      EMULATOR_DEVICE_PATTERNS.map((p) => `properties.$device_name ILIKE '${p}'`).join(" OR ")
    }))`;

    const [
      signups,
      activeUsers,
      mau30d,
      engagedLegacy,
      appOpens,
      webVisitors,
      moviesAdded,
      tvUpdates,
      scanAttempts,
      scanSuccess,
      aiGenerations,
      upgrades,
      paywallHits,
      follows,
      firstTakes,
    ] = await Promise.all([
      query(
        "SELECT count() FROM events WHERE event = 'auth:sign_up' AND timestamp >= now() - toIntervalDay(1)",
      ),
      // Clean headline DAU — distinct real sessions in the last 24h, excl. internal + emulator devices.
      query(
        `SELECT count(DISTINCT person_id) FROM events WHERE event = 'app:session_start' AND timestamp >= now() - toIntervalDay(1) AND ${notInternalPerson} AND ${notEmulatorDevice}`,
      ),
      // Clean rolling 30-day MAU — same definition, wider window, for the Mo-4/Mo-6 plan gates.
      query(
        `SELECT count(DISTINCT person_id) FROM events WHERE event = 'app:session_start' AND timestamp >= now() - toIntervalDay(30) AND ${notInternalPerson} AND ${notEmulatorDevice}`,
      ),
      // Legacy event-allowlist engaged metric — kept ~2 weeks for cross-checking against the clean definition above, then remove.
      query(
        `SELECT count(DISTINCT person_id) FROM events WHERE timestamp >= now() - toIntervalDay(1) AND event IN (${engagedEventList}) AND ${notInternal}`,
      ),
      // Context signals (broad, intentionally unfiltered) so the digest stays honest:
      query(
        "SELECT count(DISTINCT person_id) FROM events WHERE event = 'Application Opened' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'movie:watchlist_add' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'tv:status_change' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'scan:attempt' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'scan:success' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'generate:art:success' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'premium:subscribe' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'premium:gate_hit' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'social:follow' AND timestamp >= now() - toIntervalDay(1)",
      ),
      query(
        "SELECT count() FROM events WHERE event = 'first_take:create' AND timestamp >= now() - toIntervalDay(1)",
      ),
    ]);

    clearTimeout(timeout);

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });

    const embed = {
      title: `📊 PocketStubs Daily — ${today}`,
      color: 0xE11D48,
      fields: [
        { name: "👤 Signups", value: String(signups), inline: true },
        { name: "📱 Active Users", value: String(activeUsers), inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "📆 MAU (30d)", value: String(mau30d), inline: true },
        { name: "🎟️ Engaged (legacy def)", value: String(engagedLegacy), inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "🔓 App opens", value: String(appOpens), inline: true },
        { name: "🌐 Web visitors", value: String(webVisitors), inline: true },
        { name: "​", value: "​", inline: true },
        { name: "🎬 Movies Added", value: String(moviesAdded), inline: true },
        { name: "📺 TV Updates", value: String(tvUpdates), inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        {
          name: "🎫 Scans",
          value: `${scanAttempts} (${scanSuccess}✓)`,
          inline: true,
        },
        {
          name: "✨ AI Posters",
          value: String(aiGenerations),
          inline: true,
        },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "💎 Upgrades", value: String(upgrades), inline: true },
        { name: "🔒 Paywall Hits", value: String(paywallHits), inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
        { name: "👥 Follows", value: String(follows), inline: true },
        { name: "📝 First Takes", value: String(firstTakes), inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
      ],
      footer: { text: "PocketStubs · PostHog · Active = distinct app:session_start users, 24h (excl. internal & emulators)" },
      timestamp: new Date().toISOString(),
    };

    const discordRes = await fetch(DISCORD_METRICS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!discordRes.ok) {
      const body = await discordRes.text();
      console.error(
        `[post-daily-metrics] Discord webhook failed (${discordRes.status}): ${body}`,
      );
      // Still return 200 so pg_cron doesn't retry aggressively
      return new Response(
        JSON.stringify({ ok: false, error: "Discord webhook failed" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[post-daily-metrics] Digest posted — signups=${signups} activeUsers=${activeUsers} mau30d=${mau30d} engagedLegacy=${engagedLegacy} appOpens=${appOpens} webVisitors=${webVisitors} moviesAdded=${moviesAdded} tvUpdates=${tvUpdates} scans=${scanAttempts}/${scanSuccess} ai=${aiGenerations} upgrades=${upgrades} paywallHits=${paywallHits} follows=${follows} firstTakes=${firstTakes}`,
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    clearTimeout(timeout);
    console.error("[post-daily-metrics] Unexpected error:", err);
    // Return 200 so pg_cron doesn't retry aggressively
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
