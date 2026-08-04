// Preview-only stub: chainable no-op replacing @/lib/supabase in the web bundle.
// Real client creation reads env + native storage; previews never touch data.
const chain: any = new Proxy(() => chain, { get: () => chain, apply: () => chain });
export const supabase: any = chain;
export default chain;
