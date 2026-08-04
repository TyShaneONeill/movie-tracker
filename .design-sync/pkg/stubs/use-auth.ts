// Preview-only stub replacing @/hooks/use-auth AND @/lib/auth-context in the web bundle.
import * as React from 'react';

export function useAuth(): any {
  return { user: null, session: null, loading: false, isGuest: true };
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return children as any;
}
export default useAuth;
