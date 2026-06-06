/**
 * Pure helpers for deriving real introductory-offer (free-trial) info from
 * RevenueCat offering packages. Kept side-effect-free and provider-independent
 * so the paywall's trial logic is unit-testable without mocking the SDK.
 */

/** Convert a RevenueCat intro-price period (DAY/WEEK/MONTH/YEAR + count) to whole days */
export function introPeriodToDays(periodUnit: string, periodNumberOfUnits: number): number | null {
  if (!periodNumberOfUnits) return null;
  switch (String(periodUnit).toUpperCase()) {
    case 'DAY': return periodNumberOfUnits;
    case 'WEEK': return periodNumberOfUnits * 7;
    case 'MONTH': return periodNumberOfUnits * 30;
    case 'YEAR': return periodNumberOfUnits * 365;
    default: return null;
  }
}

/** Derive free-trial info from an offering's packages (a free trial has introPrice.price === 0) */
export function deriveIntroFromPackages(
  packages: any[]
): { isFreeTrial: boolean; trialDays: number | null } {
  for (const pkg of packages ?? []) {
    const intro = pkg?.product?.introPrice;
    if (intro && intro.price === 0) {
      return { isFreeTrial: true, trialDays: introPeriodToDays(intro.periodUnit, intro.periodNumberOfUnits) };
    }
  }
  return { isFreeTrial: false, trialDays: null };
}
