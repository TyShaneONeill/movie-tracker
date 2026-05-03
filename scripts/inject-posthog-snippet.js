#!/usr/bin/env node
// Injects the PostHog snippet into static HTML landing pages in dist/.
//
// Why this exists:
//   The Expo SPA initializes posthog-js inside app/_layout.tsx, but the static
//   landing pages (welcome.html, about.html, etc.) are served by Vercel before
//   the SPA bundle ever loads. UTM-tagged inbound traffic from social bios
//   lands on these pages first, so without inline PostHog, every initial
//   pageview + utm_* property is dropped on the floor.
//
// Run order:
//   Must run AFTER `expo export --platform web` (so dist/*.html exists) and
//   before deploy. See vercel.json buildCommand for wiring.
//
// API key source:
//   Reads EXPO_PUBLIC_POSTHOG_API_KEY from env. In Vercel, this comes from
//   the Doppler integration. Locally, wrap with `doppler run -- node ...`.
//   If unset, the script logs a warning and exits 0 so missing-key in dev
//   doesn't block the build pipeline.

const fs = require('fs');
const path = require('path');

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
if (!apiKey) {
  console.warn('[inject-posthog] EXPO_PUBLIC_POSTHOG_API_KEY not set — skipping injection');
  process.exit(0);
}

const snippet = `<!-- PostHog (auto-injected by scripts/inject-posthog-snippet.js) -->
<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('${apiKey}', {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    autocapture: false,
    respect_dnt: true
  });
</script>`;

const targets = [
  'welcome.html',
  'landing.html',
  'about.html',
  'privacy.html',
  'terms.html',
  'support.html',
  'reset-password.html',
];

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error(`[inject-posthog] dist/ does not exist at ${distDir}`);
  process.exit(1);
}

let injected = 0;
let skipped = 0;
let missing = 0;

for (const file of targets) {
  const filePath = path.join(distDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[inject-posthog] ${file} not found in dist/, skipping`);
    missing++;
    continue;
  }
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('window.posthog')) {
    console.log(`[inject-posthog] ${file} already has PostHog, skipping`);
    skipped++;
    continue;
  }
  if (!html.includes('</head>')) {
    console.warn(`[inject-posthog] ${file} has no </head> tag, skipping`);
    skipped++;
    continue;
  }
  html = html.replace('</head>', `${snippet}\n</head>`);
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[inject-posthog] injected into ${file}`);
  injected++;
}

console.log(`[inject-posthog] done — injected: ${injected}, skipped: ${skipped}, missing: ${missing}`);
