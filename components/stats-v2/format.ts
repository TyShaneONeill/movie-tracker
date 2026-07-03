/**
 * Stats v2 number formatting (from the design handoff, vault PS-05).
 *
 * The surface must hold up whether you watched 13 hours or 13,000:
 *   counts: <10k shown in full with separators, then compact (12.8k, 1.3M)
 *   watch time: minutes → "Xh Ym" up to 48h, then "Xd Yh" / "Xd" (days framing)
 */

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 1000000) {
    const k = n / 1000;
    return (k >= 100 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '')) + 'k';
  }
  const m = n / 1000000;
  return (m >= 100 ? String(Math.round(m)) : m.toFixed(1).replace(/\.0$/, '')) + 'M';
}

export function formatWatch(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const totalH = Math.floor(minutes / 60);
  if (totalH < 48) {
    // under 2 days → hours + minutes
    const m = minutes % 60;
    return m ? `${totalH}h ${m}m` : `${totalH}h`;
  }
  const days = Math.floor(minutes / 1440); // 2+ days → days framing
  const h = Math.floor((minutes % 1440) / 60);
  if (days >= 100) return `${days}d`; // very large → just days, keep it short
  return h ? `${days}d ${h}h` : `${days}d`;
}
