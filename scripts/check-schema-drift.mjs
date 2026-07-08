/**
 * Schema-drift guard: fail if PROD and STAGING public-schema DDL diverge.
 *
 * WHY THIS EXISTS
 * Migrations here are applied by hand via the Supabase Management API, which
 * does NOT record rows in `supabase_migrations.schema_migrations`. On 2026-07-07
 * that let the PS-12 `edited_at` migration reach staging but silently miss prod
 * for days — every user's feed reviews/first-takes/comments 400'd because the
 * client selected a column prod didn't have. Nothing caught it. This does.
 *
 * The workflow is "apply to staging, verify, then apply to prod." So if the two
 * databases' schema effects diverge, someone forgot one side — which is exactly
 * the failure above. This compares STRUCTURE (tables, columns, functions +
 * signatures, RLS policies), not data. It intentionally does NOT trust
 * `schema_migrations` (unreliable given the manual-apply workflow) — it diffs
 * the live effects, which is what actually broke.
 *
 * USAGE
 *   doppler run -p pocketstubs -c prd -- node scripts/check-schema-drift.mjs
 * (prd config is used only for SUPABASE_MANAGEMENT_TOKEN, which can read both
 * projects. Reads only information_schema / pg_catalog. Prints object NAMES
 * only — never data or secret values.) Exits 1 on drift, 0 when in sync.
 *
 * CI: .github/workflows/schema-drift.yml runs this daily + on migration changes.
 */

const MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const PROD_REF = process.env.PROD_SUPABASE_REF || 'wliblwulvsrfgqcnbzeh';
const STAGING_REF = process.env.STAGING_SUPABASE_REF || 'scleidoemjpkbxrpyqyv';
const DISCORD_WEBHOOK = process.env.DISCORD_METRICS_WEBHOOK_URL; // optional alert

// Each probe returns a sorted list of opaque identity strings for one object
// class. Only public-schema DDL; no data. Keep these deterministic (ORDER BY).
const PROBES = {
  columns: `
    select table_name || '.' || column_name || ':' || data_type as id
    from information_schema.columns
    where table_schema = 'public'
    order by id`,
  functions: `
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
             || case when p.prosecdef then ' [definer]' else '' end as id
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by id`,
  policies: `
    select c.relname || ':' || pol.polname || ':' || pol.polcmd::text as id
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
    order by id`,
  tables: `
    select table_name as id
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by id`,
};

async function runQuery(ref, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    throw new Error(`Management API ${res.status} for ${ref}: ${(await res.text()).slice(0, 200)}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected response for ${ref}: ${JSON.stringify(rows).slice(0, 200)}`);
  }
  return rows.map((r) => r.id);
}

export function diff(prodList, stagingList) {
  const prod = new Set(prodList);
  const staging = new Set(stagingList);
  return {
    onlyProd: prodList.filter((x) => !staging.has(x)),
    onlyStaging: stagingList.filter((x) => !prod.has(x)),
  };
}

async function main() {
  if (!MANAGEMENT_TOKEN) {
    console.error('✖ SUPABASE_MANAGEMENT_TOKEN not set (run via `doppler run -c prd --`).');
    process.exit(2);
  }
  const report = {};
  let driftCount = 0;

  for (const [name, sql] of Object.entries(PROBES)) {
    const [prod, staging] = await Promise.all([
      runQuery(PROD_REF, sql),
      runQuery(STAGING_REF, sql),
    ]);
    const d = diff(prod, staging);
    report[name] = d;
    driftCount += d.onlyProd.length + d.onlyStaging.length;
  }

  if (driftCount === 0) {
    console.log('✓ Schema in sync — prod and staging public DDL match (tables, columns, functions, policies).');
    process.exit(0);
  }

  const lines = [`✖ SCHEMA DRIFT: ${driftCount} object(s) differ between prod and staging.`];
  for (const [name, d] of Object.entries(report)) {
    if (!d.onlyProd.length && !d.onlyStaging.length) continue;
    lines.push(`\n[${name}]`);
    for (const x of d.onlyProd) lines.push(`  PROD only (missing in staging):    ${x}`);
    for (const x of d.onlyStaging) lines.push(`  STAGING only (missing in PROD):    ${x}`);
  }
  lines.push(
    '\nMost likely cause: a migration was applied to one database but not the other.',
    'Reconcile before shipping — a client selecting a prod-missing column will 400 for all users (burned 2026-07-07).'
  );
  const message = lines.join('\n');
  console.error(message);

  if (DISCORD_WEBHOOK) {
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '🔴 **Schema drift** (prod ↔ staging)\n```\n' + message.slice(0, 1800) + '\n```' }),
      });
    } catch {
      /* best-effort; never mask the real exit code */
    }
  }
  process.exit(1);
}

// Run as a CLI only when invoked directly (not when imported by a test).
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✖ check-schema-drift failed to run: ${err.message}`);
    process.exit(2);
  });
}
