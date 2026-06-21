/**
 * Fail if any EXPO_PUBLIC_* env var holds a Supabase service-role / secret key.
 *
 * EXPO_PUBLIC_* values are inlined into the shipped client bundle, so a
 * service-role/secret key in one bypasses all RLS for anyone who extracts it.
 *
 * Run with the env that a build would see, e.g. per Doppler config:
 *   doppler run -p pocketstubs -c stg -- npm run check:public-env
 *   doppler run -p pocketstubs -c prd -- npm run check:public-env
 * Or as a build pre-step. Exits 1 if a leak is found, prints NO secret values.
 */
function jwtRole(token) {
  const part = String(token).split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const g = globalThis;
  let json = null;
  try {
    if (typeof g.Buffer !== 'undefined') json = g.Buffer.from(b64, 'base64').toString('binary');
    else if (typeof g.atob === 'function') json = g.atob(b64);
  } catch {
    return null;
  }
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    return typeof obj.role === 'string' ? obj.role : null;
  } catch {
    return null;
  }
}

function isServiceRoleKey(value) {
  if (!value) return false;
  if (value.startsWith('sb_secret_')) return true;
  if (value.startsWith('eyJ')) return jwtRole(value) === 'service_role';
  return false;
}

const offenders = Object.keys(process.env)
  .filter((k) => k.startsWith('EXPO_PUBLIC_'))
  .filter((k) => isServiceRoleKey(process.env[k]));

if (offenders.length > 0) {
  console.error('\n========================================');
  console.error('SECURITY: service-role/secret key in client-public env var(s):');
  offenders.forEach((k) => console.error(`  - ${k}`));
  console.error('EXPO_PUBLIC_* ships in the client bundle and bypasses RLS.');
  console.error('Fix: put the ANON/publishable key in the EXPO_PUBLIC_ var, store the');
  console.error('secret under a non-EXPO_PUBLIC_ name, and rotate the exposed key.');
  console.error('========================================\n');
  process.exit(1);
}

const scanned = Object.keys(process.env).filter((k) => k.startsWith('EXPO_PUBLIC_')).length;
console.log(`✓ check:public-env — ${scanned} EXPO_PUBLIC_* var(s) scanned, no service-role/secret keys.`);
