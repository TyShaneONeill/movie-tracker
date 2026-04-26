// supabase/functions/_shared/bug-report-context.ts
/**
 * Builds the LLM prompt context for analyze-bug-report.
 *
 * Wraps all user-controlled input in XML-ish delimiters so the model treats
 * it as data, not instructions. All user text is HTML-escaped so that a
 * user-submitted "</user_report>" can't break out of the delimiter.
 *
 * Code context comes from Sentry's source-mapped error event stacktraces
 * (pre_context / context_line / post_context fields on each frame). This
 * is the replacement for the graphify RAG originally specified — graphify
 * output is gitignored and not shippable to Supabase edge functions.
 */

export interface ContextArgs {
  title: string;
  description: string;
  platform: string;
  app_version: string;
  route: string;
  breadcrumbs: Array<{ category?: string; message?: string; timestamp?: string }>;
  errorEvents: Array<Record<string, unknown>>;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatBreadcrumbs(crumbs: ContextArgs['breadcrumbs']): string {
  if (!crumbs.length) return '  (none)';
  return crumbs
    .slice(-20)
    .map(c => `  - [${c.category ?? '?'}] ${c.message ?? ''} @ ${c.timestamp ?? ''}`)
    .join('\n');
}

function formatErrorFrame(frame: {
  filename?: string;
  lineno?: number;
  function?: string;
  pre_context?: string[];
  context_line?: string;
  post_context?: string[];
  in_app?: boolean;
}): string {
  const loc = `${frame.filename ?? '?'}:${frame.lineno ?? '?'}`;
  const fn = frame.function ? ` in ${frame.function}()` : '';
  const pre = (frame.pre_context ?? []).join('\n');
  const hl = frame.context_line ?? '';
  const post = (frame.post_context ?? []).join('\n');
  return `${loc}${fn}${frame.in_app ? ' [in-app]' : ''}\n\`\`\`\n${pre}\n${hl}  ← \n${post}\n\`\`\``;
}

function formatErrorEvents(events: ContextArgs['errorEvents']): string {
  if (!events.length) return '  (none)';
  return events
    .slice(0, 3)
    .map(ev => {
      const entries = (ev.entries as Array<{ type: string; data?: Record<string, unknown> }> | undefined) ?? [];
      const exEntry = entries.find(e => e.type === 'exception');
      const values = exEntry?.data?.values as Array<Record<string, unknown>> | undefined;
      const first = values?.[0];
      const type = (first?.type as string) ?? '?';
      const value = (first?.value as string) ?? '';
      const frames = (first?.stacktrace as { frames?: Array<any> } | undefined)?.frames ?? [];
      const topInApp = frames.filter((f: any) => f.in_app).slice(-3);
      return `${type}: ${value}\n${topInApp.map(formatErrorFrame).join('\n\n')}`;
    })
    .join('\n\n---\n\n');
}

export function buildAnalysisContext(args: ContextArgs): string {
  return `
<user_report>
  <title>${escape(args.title)}</title>
  <description>${escape(args.description)}</description>
  <platform>${escape(args.platform)}</platform>
  <app_version>${escape(args.app_version)}</app_version>
  <route>${escape(args.route)}</route>
</user_report>

<breadcrumbs>
${formatBreadcrumbs(args.breadcrumbs)}
</breadcrumbs>

<associated_errors>
${formatErrorEvents(args.errorEvents)}
</associated_errors>

Based on the above, call record_bug_analysis.
`.trim();
}
