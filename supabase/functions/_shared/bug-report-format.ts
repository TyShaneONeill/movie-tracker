// supabase/functions/_shared/bug-report-format.ts
import type { BugAnalysis } from './bug-analysis-types.ts';

export function formatSentryComment(a: BugAnalysis): string {
  const pct = Math.round(a.confidence * 100);
  const files = a.suspected_files.length
    ? a.suspected_files.map(f => `- \`${f}\``).join('\n')
    : '- _(none identified)_';
  return [
    `**AI Analysis**`,
    ``,
    `Severity: \`${a.severity}\` · Category: \`${a.category}\` · Area: \`${a.area}\` · Confidence: **${pct}%**`,
    ``,
    `**Hypothesis:** ${a.root_cause_hypothesis}`,
    ``,
    `**Suspected files:**`,
    files,
    ``,
    `**Reproduction guess:** ${a.reproduction_guess}`,
    ``,
    `**Next step:** ${a.recommended_next_step}`,
  ].join('\n');
}

export function formatDiscordAnalysis(a: BugAnalysis): string {
  const pct = Math.round(a.confidence * 100);
  const files = a.suspected_files.slice(0, 3).map(f => `\`${f}\``).join(', ');
  return [
    `**${a.severity} · ${a.category} · ${a.area}** (${pct}%)`,
    a.root_cause_hypothesis,
    files ? `**Files:** ${files}` : '',
    `**Next:** ${a.recommended_next_step}`,
  ].filter(Boolean).join('\n');
}
