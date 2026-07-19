import { StatsV2Screen } from '@/components/stats-v2/stats-v2-screen';

/**
 * Analytics tab — renders the v2 stats reskin unconditionally.
 *
 * Formerly gated behind the `stats_v2` PostHog flag; stripped 2026-07-18
 * after 100% rollout since 2026-07-11 (issue #661). The legacy v1 screen
 * (summary cards, monthly bar chart, genre donut) has been removed.
 */
export default function AnalyticsScreen() {
  return <StatsV2Screen />;
}
