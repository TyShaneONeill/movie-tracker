/**
 * Static DEFINER-grant guard (scripts/check-definer-grants.mjs).
 *
 * The regression that matters is the LAST case: the real migration that leaked
 * `get_continue_watching_nudge_candidates` to anon on production for five days
 * must fail this check. Everything else exists to keep the guard from crying
 * wolf, because a noisy security check gets bypassed and then it protects
 * nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  stripComments,
  definerFunctionsCreated,
  grantPosture,
  violation,
  // CommonJS on purpose — see the note in definer-grants-lib.js.
} = require('../../scripts/definer-grants-lib.js');

/** Mirrors the script: parse SQL, return [fn, reason] for each unguarded fn. */
function audit(sql: string): Array<[string, string]> {
  const clean = stripComments(sql);
  const posture = grantPosture(clean);
  return [...definerFunctionsCreated(clean)]
    .map((fn: string) => [fn, violation(posture.get(fn))] as [string, string])
    .filter(([, why]) => why);
}

const migration = (f: string) =>
  readFileSync(path.join(__dirname, '../../supabase/migrations', f), 'utf8');

describe('definer detection', () => {
  it('flags a SECURITY DEFINER function created with no REVOKE at all', () => {
    const found = audit(`
      create function public.leaky() returns int
        language sql security definer as $$ select 1 $$;
    `);
    expect(found).toEqual([['leaky', expect.stringContaining('no REVOKE')]]);
  });

  it('ignores a SECURITY INVOKER function (the default)', () => {
    expect(
      audit(`create function public.safe() returns int language sql as $$ select 1 $$;`),
    ).toEqual([]);
  });

  it('ignores functions outside the public schema', () => {
    expect(
      audit(`
        create function private.hidden() returns int
          language sql security definer as $$ select 1 $$;
      `),
    ).toEqual([]);
  });

  it('does not trip on "SECURITY DEFINER" appearing only in a comment', () => {
    // 20260726160000 describes its helper as a "SECURITY DEFINER helper" in prose
    // while the DDL declares no such thing — a grep-based check false-positives here.
    const found = audit(`
      -- Extract the check into a shared SECURITY DEFINER helper.
      /* Another SECURITY DEFINER mention, in a block comment. */
      create function public.helper() returns int language sql as $$ select 1 $$;
    `);
    expect(found).toEqual([]);
  });

  it('does not trip on "security definer" inside a function body', () => {
    const found = audit(`
      create function public.emitter() returns text language sql as $$
        select 'create function x() security definer'
      $$;
    `);
    expect(found).toEqual([]);
  });

  it('handles quoted, schema-qualified identifiers', () => {
    const found = audit(`
      create or replace function "public"."quoted_fn"("p" uuid) returns int
        language plpgsql security definer as $$ begin return 1; end; $$;
    `);
    expect(found).toEqual([['quoted_fn', expect.any(String)]]);
  });
});

describe('grant posture', () => {
  const create = `create function public.fn() returns int
      language sql security definer as $$ select 1 $$;`;

  it('rejects a REVOKE naming only PUBLIC — the exact three-time footgun', () => {
    // Measured on staging: this leaves anon=X and authenticated=X intact.
    const found = audit(`${create} revoke all on function public.fn() from public;`);
    expect(found).toEqual([['fn', expect.stringContaining('anon')]]);
  });

  it('rejects a REVOKE naming only anon (PUBLIC still holds EXECUTE)', () => {
    const found = audit(`${create} revoke all on function public.fn() from anon;`);
    expect(found).toEqual([['fn', expect.stringContaining('PUBLIC')]]);
  });

  it('accepts revoking all three roles', () => {
    expect(
      audit(`${create} revoke all on function public.fn() from public, anon, authenticated;`),
    ).toEqual([]);
  });

  it('accepts revoking PUBLIC+anon when authenticated is explicitly granted', () => {
    // A client-JWT-callable DEFINER RPC is legitimate; requiring authenticated to
    // be revoked would be wrong. What matters is that it was a decision.
    expect(
      audit(`
        ${create}
        revoke all on function public.fn() from public, anon;
        grant execute on function public.fn() to authenticated, service_role;
      `),
    ).toEqual([]);
  });

  it('rejects PUBLIC+anon revoke when authenticated is left to the default', () => {
    const found = audit(`${create} revoke all on function public.fn() from public, anon;`);
    expect(found).toEqual([['fn', expect.stringContaining('authenticated')]]);
  });

  it('does not let a REVOKE on a DIFFERENT function satisfy the requirement', () => {
    const found = audit(`
      ${create}
      revoke all on function public.other() from public, anon, authenticated;
    `);
    expect(found).toEqual([['fn', expect.stringContaining('no REVOKE')]]);
  });
});

describe('regression against real migrations', () => {
  it('FAILS 20260721090000 — the migration that leaked to anon on prod', () => {
    const found = audit(migration('20260721090000_continue_watching_nudge_candidates_rpc.sql'));
    expect(found).toEqual([
      ['get_continue_watching_nudge_candidates', expect.stringContaining('anon')],
    ]);
  });

  it('PASSES 20260726160000 — revokes PUBLIC+anon, grants authenticated', () => {
    expect(audit(migration('20260726160000_show_completion_shared_helper.sql'))).toEqual([]);
  });

  it('PASSES 20260727040000 — a revoke-only migration that creates nothing', () => {
    expect(audit(migration('20260727040000_revoke_nudge_candidates_anon.sql'))).toEqual([]);
  });

  it('PASSES 20260710093000 — the canonical hardening pattern', () => {
    expect(audit(migration('20260710093000_definer_fn_grant_hardening.sql'))).toEqual([]);
  });

  it('PASSES a migration containing no functions at all', () => {
    expect(audit(migration('20260726150000_reviews_rating_numeric.sql'))).toEqual([]);
  });
});
