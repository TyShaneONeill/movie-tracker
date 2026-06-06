import { introPeriodToDays, deriveIntroFromPackages } from '@/lib/premium-intro';

describe('introPeriodToDays', () => {
  it('converts each period unit to whole days', () => {
    expect(introPeriodToDays('DAY', 3)).toBe(3);
    expect(introPeriodToDays('WEEK', 1)).toBe(7); // "Free for the first week" → 7-day copy
    expect(introPeriodToDays('WEEK', 2)).toBe(14);
    expect(introPeriodToDays('MONTH', 1)).toBe(30);
    expect(introPeriodToDays('YEAR', 1)).toBe(365);
  });

  it('is case-insensitive on the unit', () => {
    expect(introPeriodToDays('week', 1)).toBe(7);
  });

  it('returns null for zero/unknown input', () => {
    expect(introPeriodToDays('WEEK', 0)).toBeNull();
    expect(introPeriodToDays('FORTNIGHT', 1)).toBeNull();
  });
});

describe('deriveIntroFromPackages', () => {
  const freeTrialPkg = { product: { introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 } } };
  const paidIntroPkg = { product: { introPrice: { price: 4.99, periodUnit: 'MONTH', periodNumberOfUnits: 1 } } };
  const noIntroPkg = { product: { introPrice: null } };

  it('detects a free trial (price 0) and reports its length in days', () => {
    expect(deriveIntroFromPackages([noIntroPkg, freeTrialPkg])).toEqual({ isFreeTrial: true, trialDays: 7 });
  });

  it('does NOT treat a discounted (paid) intro price as a free trial', () => {
    expect(deriveIntroFromPackages([paidIntroPkg])).toEqual({ isFreeTrial: false, trialDays: null });
  });

  it('returns no trial when no package has an intro price', () => {
    expect(deriveIntroFromPackages([noIntroPkg])).toEqual({ isFreeTrial: false, trialDays: null });
  });

  it('handles empty / nullish package lists', () => {
    expect(deriveIntroFromPackages([])).toEqual({ isFreeTrial: false, trialDays: null });
    expect(deriveIntroFromPackages(undefined as any)).toEqual({ isFreeTrial: false, trialDays: null });
  });
});
