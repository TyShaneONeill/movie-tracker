#!/usr/bin/env node
/**
 * CLI for the static DEFINER-grant guard. All parsing lives in
 * ./definer-grants-lib.js (CommonJS, so the Jest suite can require it without
 * touching the shared jest-expo transform config); this file only resolves which
 * migrations changed, runs them through the lib, and reports.
 *
 * See definer-grants-lib.js for the full rationale, including the measured ACL
 * behaviour this check is built on.
 *
 * Exit 0 = clean. Exit 1 = at least one unguarded SECURITY DEFINER function.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ANON_EXECUTE_ALLOWLIST, stripComments, definerFunctionsCreated, grantPosture, violation } =
  require('./definer-grants-lib.js');

function changedMigrations() {
  const base = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : 'origin/main';
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', 'supabase/migrations'],
      { encoding: 'utf8' },
    );
  } catch {
    console.error(`! could not diff against ${base}; nothing to check.`);
    return [];
  }
  return out.split('\n').filter((f) => f.endsWith('.sql'));
}

function main() {
  const files = changedMigrations();
  if (files.length === 0) {
    console.log('✔ DEFINER-GRANT (static): no migrations changed in this diff.');
    return;
  }

  const findings = [];
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue; // deleted between diff and read
    }
    const sql = stripComments(raw);
    const posture = grantPosture(sql);
    for (const fn of definerFunctionsCreated(sql)) {
      if (ANON_EXECUTE_ALLOWLIST.has(fn)) continue;
      const why = violation(posture.get(fn));
      if (why) findings.push({ file, fn, why });
    }
  }

  console.log(`DEFINER-GRANT (static): inspected ${files.length} changed migration(s).`);
  if (findings.length === 0) {
    console.log('✔ every SECURITY DEFINER function created here revokes PUBLIC, anon, authenticated.');
    return;
  }

  console.error(
    `\n✖ DEFINER-GRANT: ${findings.length} SECURITY DEFINER function(s) created without a full REVOKE.\n`,
  );
  for (const f of findings) console.error(`  🔴 ${f.fn}()  —  ${f.why}\n       ${f.file}`);
  console.error(`
A new SECURITY DEFINER function is EXECUTE-able by anon by default, which means
anyone can POST /rpc/<fn> with the public anon key and run it with the owner's
privileges, bypassing RLS. Revoking only PUBLIC does NOT remove it: Supabase
grants anon and authenticated directly, so all three must be named.

Add, with the exact signature:

  REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO <only the roles that call it>;

See 20260710093000_definer_fn_grant_hardening.sql for the established pattern.
If anon EXECUTE is genuinely intended, add the function to
ANON_EXECUTE_ALLOWLIST in this script WITH a written reason.
`);
  process.exit(1);
}

main();
