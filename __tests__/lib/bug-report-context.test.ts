// __tests__/lib/bug-report-context.test.ts
import { buildAnalysisContext } from '../../supabase/functions/_shared/bug-report-context';

describe('buildAnalysisContext', () => {
  it('wraps the user report in XML delimiters', () => {
    const ctx = buildAnalysisContext({
      title: 'crash on scan',
      description: 'phone died',
      platform: 'ios',
      app_version: '1.2.0',
      route: 'Scanner',
      breadcrumbs: [],
      errorEvents: [],
    });
    expect(ctx).toMatch(/<user_report>[\s\S]*<title>crash on scan<\/title>/);
    expect(ctx).toMatch(/<description>phone died<\/description>/);
    expect(ctx).toMatch(/<route>Scanner<\/route>/);
    expect(ctx).toContain('<breadcrumbs>');
  });

  it('includes breadcrumbs when provided', () => {
    const ctx = buildAnalysisContext({
      title: 't',
      description: 'd',
      platform: 'ios',
      app_version: '1.2.0',
      route: '/',
      breadcrumbs: [
        { category: 'nav', message: 'tab.scanner', timestamp: '2026-04-24T00:00:00Z' },
      ],
      errorEvents: [],
    });
    expect(ctx).toContain('tab.scanner');
  });

  it('includes error stack frame code snippets when attached', () => {
    const ctx = buildAnalysisContext({
      title: 't',
      description: 'd',
      platform: 'ios',
      app_version: '1.2.0',
      route: '/',
      breadcrumbs: [],
      errorEvents: [{
        message: 'TypeError: null is not an object',
        entries: [{
          type: 'exception',
          data: {
            values: [{
              type: 'TypeError',
              value: 'null is not an object',
              stacktrace: {
                frames: [
                  {
                    filename: 'app/scanner.tsx',
                    lineno: 42,
                    function: 'handleScan',
                    pre_context: ['const data = result.data;'],
                    context_line: '  return data.value.id;',
                    post_context: ['}'],
                    in_app: true,
                  },
                ],
              },
            }],
          },
        }],
      }],
    });
    expect(ctx).toContain('<associated_errors>');
    expect(ctx).toContain('app/scanner.tsx:42');
    expect(ctx).toContain('data.value.id');
  });

  it('safely escapes < > & in user content to prevent tag confusion', () => {
    const ctx = buildAnalysisContext({
      title: 'bug <script>alert(1)</script>',
      description: 'a & b > c',
      platform: 'ios',
      app_version: '1.2.0',
      route: '/',
      breadcrumbs: [],
      errorEvents: [],
    });
    expect(ctx).toContain('bug &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(ctx).toContain('a &amp; b &gt; c');
  });
});
