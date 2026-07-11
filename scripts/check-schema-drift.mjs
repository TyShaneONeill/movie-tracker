/**
 * Schema-drift guard: fail if PROD and STAGING public-schema DDL diverge,
 * AND flag any SECURITY DEFINER function that anon/PUBLIC can EXECUTE.
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
 * DEFINER-GRANT AUDIT (added 2026-07-10)
 * A second, independent check runs against BOTH prod and staging: it flags every
 * SECURITY DEFINER function in schema `public` that `anon` or `PUBLIC` can
 * EXECUTE. This closes a class burned TWICE (2026-06-05, 2026-07-03): a migration
 * "revoked" anon EXECUTE but was a NO-OP because anon inherits PUBLIC, and
 * separately Supabase's default privileges GRANT new functions EXPLICIT
 * anon/authenticated EXECUTE on creation. A 2026-07-10 audit found 5 live P1s of
 * this class (anon could read any user's stats / watch-history / social graph via
 * /rpc). The house-rule fix (`REVOKE ... FROM PUBLIC, anon, authenticated`) is in
 * migration 20260710093000_definer_fn_grant_hardening.sql, but nothing DETECTED
 * regressions — a new migration or hand-applied function can silently reintroduce
 * anon-exec. This audit does. See DEFINER_EXECUTE_ALLOWLIST for the carve-out.
 *
 * ACL PARSING NOTES (pg_proc.proacl, an aclitem[])
 *   - Empty grantee in an ACL entry (text form `=X/owner`) means PUBLIC. In
 *     `aclexplode(proacl)` that surfaces as `grantee = 0`.
 *   - `proacl IS NULL` means DEFAULT privileges are in effect. For functions the
 *     default is EXECUTE granted to PUBLIC, so a DEFINER fn with NULL proacl IS a
 *     finding (PUBLIC can execute it) even though no explicit grant row exists.
 *
 * SCOPE
 *   - Trigger / event-trigger functions are EXCLUDED: they are unreachable via
 *     PostgREST /rpc (matches the carve-out documented in 20260710093000).
 *   - `authenticated`-EXECUTE is DELIBERATELY NOT audited — client RPCs
 *     legitimately need it (owner-scoped reads/writes). Auditing it would require
 *     guessing which fns are cron/service-only, and we don't invent heuristics.
 *
 * USAGE
 *   doppler run -p pocketstubs -c prd -- node scripts/check-schema-drift.mjs
 * (prd config is used only for SUPABASE_MANAGEMENT_TOKEN, which can read both
 * projects. Reads only information_schema / pg_catalog. Prints object NAMES
 * only — never data or secret values.) Exits 1 on drift or DEFINER finding,
 * 0 when both are clean.
 *
 * CI: .github/workflows/schema-drift.yml runs this daily + on migration changes.
 */

const MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const PROD_REF = process.env.PROD_SUPABASE_REF || 'wliblwulvsrfgqcnbzeh';
const STAGING_REF = process.env.STAGING_SUPABASE_REF || 'scleidoemjpkbxrpyqyv';
const DISCORD_WEBHOOK = process.env.DISCORD_METRICS_WEBHOOK_URL; // optional alert

// Functions intentionally left anon/PUBLIC-executable, keyed by the exact
// `name(identity args)` signature the audit emits. Suppressing an entry here is
// a deliberate, reviewed exception — adding one REQUIRES a documented reason
// (why anon/PUBLIC EXECUTE is safe for that specific function), because every
// entry re-opens the exact hole this check exists to catch.
//
//   can_view_user_content(content_user_id uuid, content_visibility text)
//     RLS privacy helper. SECURITY DEFINER + anon/PUBLIC EXECUTE by design: it
//     is called inside `follows`/content RLS USING clauses to decide public vs.
//     private vs. mutual visibility, so the querying role (incl. anon browsing
//     public content) must be able to execute it. Returns only a boolean — it
//     exposes no row data itself. Kept anon-executable in 20260710093000.
const DEFINER_EXECUTE_ALLOWLIST = new Set([
  'can_view_user_content(content_user_id uuid, content_visibility text)',
]);

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

// Every SECURITY DEFINER function in `public` that anon or PUBLIC can EXECUTE.
// Emits one row per (function, grantee) finding. See ACL PARSING NOTES above:
// NULL proacl => default privileges => PUBLIC has EXECUTE (a finding); an ACL
// entry with grantee 0 is PUBLIC. Trigger/event-trigger fns are excluded (not
// /rpc-reachable). `authenticated` is intentionally out of scope.
const DEFINER_GRANT_PROBE = `
  with definer_fns as (
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.proacl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_function_result(p.oid) not in ('trigger', 'event_trigger')
  ),
  findings as (
    -- NULL proacl => DEFAULT privileges => PUBLIC holds EXECUTE.
    select proname, args, 'PUBLIC'::text as grantee
    from definer_fns
    where proacl is null
    union all
    -- Explicit EXECUTE grants to PUBLIC (grantee 0) or anon.
    select d.proname, d.args,
           case when a.grantee = 0 then 'PUBLIC' else r.rolname end as grantee
    from definer_fns d
    cross join lateral aclexplode(d.proacl) a
    left join pg_roles r on r.oid = a.grantee
    where a.privilege_type = 'EXECUTE'
      and (a.grantee = 0 or r.rolname = 'anon')
  )
  select proname || '(' || args || ')' as fn, grantee
  from findings
  where grantee in ('PUBLIC', 'anon')
  order by fn, grantee`;

async function fetchRows(ref, sql) {
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
  return rows;
}

async function runQuery(ref, sql) {
  return (await fetchRows(ref, sql)).map((r) => r.id);
}

// Returns non-allowlisted DEFINER-grant findings for one project, each tagged
// with the environment label so a combined report can name the source DB.
async function auditDefinerGrants(ref, envLabel) {
  const rows = await fetchRows(ref, DEFINER_GRANT_PROBE);
  return rows
    .filter((r) => !DEFINER_EXECUTE_ALLOWLIST.has(r.fn))
    .map((r) => ({ env: envLabel, fn: r.fn, grantee: r.grantee }));
}

// Best-effort Discord alert in the script's existing style; never masks exit code.
async function sendDiscordAlert(title, body) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `🔴 **${title}**\n\`\`\`\n${body.slice(0, 1800)}\n\`\`\`` }),
    });
  } catch {
    /* best-effort; never mask the real exit code */
  }
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

  // Independent DEFINER-grant audit across BOTH databases.
  const definerFindings = [
    ...(await auditDefinerGrants(PROD_REF, 'PROD')),
    ...(await auditDefinerGrants(STAGING_REF, 'STAGING')),
  ];

  if (driftCount === 0 && definerFindings.length === 0) {
    console.log('✓ Schema in sync — prod and staging public DDL match (tables, columns, functions, policies).');
    console.log('✓ DEFINER grants clean — no SECURITY DEFINER function is anon/PUBLIC-executable (prod + staging).');
    process.exit(0);
  }

  if (driftCount > 0) {
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
    await sendDiscordAlert('Schema drift (prod ↔ staging)', message);
  }

  if (definerFindings.length > 0) {
    const lines = [
      `✖ DEFINER-GRANT LEAK: ${definerFindings.length} SECURITY DEFINER function grant(s) let anon/PUBLIC EXECUTE.`,
    ];
    for (const f of definerFindings) {
      lines.push(`  [${f.env}] ${f.grantee} can EXECUTE  ${f.fn}`);
    }
    lines.push(
      '\nanon/PUBLIC EXECUTE on a SECURITY DEFINER fn = anyone can call it unauthenticated via /rpc,',
      'running with the owner\'s privileges (bypasses RLS). Burned 2026-06-05 and 2026-07-03 — a REVOKE',
      'that omits PUBLIC is a no-op because anon inherits PUBLIC, and new fns default to PUBLIC EXECUTE.',
      'Fix: `REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, authenticated;` then GRANT only',
      'the roles that must call it (see 20260710093000_definer_fn_grant_hardening.sql). If a finding is',
      'intentional (e.g. an RLS helper), add its exact signature to DEFINER_EXECUTE_ALLOWLIST with a reason.'
    );
    const message = lines.join('\n');
    console.error(message);
    await sendDiscordAlert('DEFINER grant leak (anon/PUBLIC EXECUTE)', message);
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
