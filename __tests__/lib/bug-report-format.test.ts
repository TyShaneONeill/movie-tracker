// __tests__/lib/bug-report-format.test.ts
import {
  formatSentryComment,
  formatDiscordAnalysis,
} from '../../supabase/functions/_shared/bug-report-format';

const sample = {
  severity: 'P1' as const,
  category: 'crash' as const,
  area: 'scanner',
  confidence: 0.72,
  root_cause_hypothesis: 'Null deref when scanner returns an empty result.',
  suspected_files: ['app/scanner.tsx:42', 'lib/scan-service.ts:18'],
  reproduction_guess: 'Tap the scanner tab, then deny camera permission.',
  recommended_next_step: 'Add null check + user-facing error state.',
};

describe('formatSentryComment', () => {
  it('renders markdown for Sentry UI', () => {
    const md = formatSentryComment(sample);
    expect(md).toMatch(/^\*\*AI Analysis\*\*/);
    expect(md).toContain('Severity: `P1`');
    expect(md).toContain('Category: `crash`');
    expect(md).toContain('Confidence: **72%**');
    expect(md).toContain('app/scanner.tsx:42');
    expect(md).toContain('Add null check');
  });
});

describe('formatDiscordAnalysis', () => {
  it('renders condensed markdown for Discord', () => {
    const md = formatDiscordAnalysis(sample);
    expect(md).toContain('**P1 · crash · scanner**');
    expect(md).toContain('Null deref when scanner');
    expect(md).toContain('app/scanner.tsx:42');
  });

  it('formats 0 confidence without nan', () => {
    const md = formatDiscordAnalysis({ ...sample, confidence: 0 });
    expect(md).toContain('0%');
  });
});
