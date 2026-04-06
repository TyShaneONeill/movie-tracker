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

  // Only accept internal calls (service_role key in Authorization header)
  const authHeader = req.headers.get("authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!authHeader.includes(serviceRoleKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
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

    const [
      signups,
      dau,
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
      query(
        "SELECT count(DISTINCT person_id) FROM events WHERE timestamp >= now() - toIntervalDay(1)",
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
        { name: "📱 Active Users", value: String(dau), inline: true },
        { name: "\u200b", value: "\u200b", inline: true },
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
      footer: { text: "PocketStubs · PostHog" },
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
      `[post-daily-metrics] Digest posted — signups=${signups} dau=${dau} moviesAdded=${moviesAdded} tvUpdates=${tvUpdates} scans=${scanAttempts}/${scanSuccess} ai=${aiGenerations} upgrades=${upgrades} paywallHits=${paywallHits} follows=${follows} firstTakes=${firstTakes}`,
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
