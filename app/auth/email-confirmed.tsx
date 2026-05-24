import { Redirect } from 'expo-router';

/**
 * Backward-compat alias for confirmation emails generated before the
 * redirect URL was corrected to `/email-confirmed` (no `/auth` prefix).
 * In-flight emails point at this path; we forward to the real handler.
 */
export default function EmailConfirmedAlias() {
  return <Redirect href="/email-confirmed" />;
}
