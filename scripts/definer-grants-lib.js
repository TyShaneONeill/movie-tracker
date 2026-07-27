/**
 * STATIC pre-merge guard: a migration that creates a SECURITY DEFINER function
 * in `public` must explicitly REVOKE EXECUTE from PUBLIC, anon AND authenticated.
 *
 * WHY THIS EXISTS (and why the runtime guard wasn't enough)
 * --------------------------------------------------------
 * `scripts/check-schema-drift.mjs` already audits DEFINER grants — but it audits
 * LIVE databases, so it can only complain after a migration has been applied. The
 * 2026-07-22 leak (#744, `get_continue_watching_nudge_candidates`) sat exposed on
 * production for five days before that audit flagged it. This check runs on the
 * DIFF, so the same mistake fails a pull request instead of reaching users.
 *
 * Third occurrence of the same footgun: 2026-06-05, 2026-07-03, 2026-07-22.
 *
 * THE FOOTGUN, MEASURED (not inherited)
 * -------------------------------------
 * Verified empirically against staging on 2026-07-27, inside a rolled-back
 * transaction, rather than trusted from prior write-ups:
 *
 *   A. create function ... security definer
 *        -> =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
 *      A NEW function is EXECUTE-able by PUBLIC *and* by anon/authenticated
 *      directly, because Supabase ships default privileges granting those two
 *      roles on top of Postgres's own PUBLIC default.
 *
 *   B. revoke all ... from public            <-- what 20260721090000:232 did
 *        -> postgres=X | anon=X | authenticated=X | service_role=X
 *      The PUBLIC entry (`=X/`) disappears and ANON SURVIVES. anon does not hold
 *      EXECUTE *via* PUBLIC; it holds a separate, direct grant. Revoking PUBLIC
 *      alone is therefore a no-op for the role that actually matters. This is
 *      the whole bug, and it looks like a fix in review.
 *
 *   C. revoke all ... from public, anon, authenticated
 *        -> postgres=X | service_role=X                        <-- correct
 *
 * A CORRECTION WORTH KEEPING
 * --------------------------
 * Earlier write-ups (including 20260727040000's own header) state that
 * `CREATE OR REPLACE FUNCTION` resets a function's ACL to Supabase defaults, and
 * that replaying a migration would therefore re-grant anon. That is FALSE, and
 * the same experiment shows it:
 *
 *   D. create or replace ... over the hardened function from C
 *        -> postgres=X | service_role=X       <-- ACL PRESERVED
 *   E. drop function; create function ...     (control)
 *        -> =X/postgres | postgres=X | anon=X | ...   <-- reset, anon back
 *
 * Postgres documents exactly this: replacing a function leaves its owner and
 * permissions unchanged. Only DROP + CREATE resets them.
 *
 * WHY THE CHECK STILL FIRES ON `CREATE OR REPLACE`
 * ------------------------------------------------
 * Because "the ACL is preserved" is only reassuring on a database where the
 * function ALREADY EXISTS. A migration runs against several environments, and
 * ours demonstrably drift: on 2026-07-27 `get_continue_watching_nudge_candidates`
 * existed on prod but not on staging. On the environment that lacks it, a
 * `CREATE OR REPLACE` is simply a CREATE — case A — and the function is born
 * anon-executable. A static check cannot know which environments already have the
 * function, so it requires the REVOKE unconditionally. The REVOKE is idempotent
 * and costs one line; guessing wrong costs a data exposure.
 *
 * DROP + CREATE (case E) genuinely must re-apply grants, and
 * 20260726160000 does exactly that for `sync_tv_show_progress`.
 *
 * SCOPE
 * -----
 * Only migrations ADDED or MODIFIED relative to the merge base are inspected, so
 * historical migrations do not need retrofitting. Comments are stripped before
 * parsing — several migrations discuss "SECURITY DEFINER" in prose while the DDL
 * declares nothing of the kind (20260726160000 calls its helper a "SECURITY
 * DEFINER helper" in the header; the function is actually INVOKER), and a naive
 * grep would both false-positive on those and miss real declarations.
 *
 * Exit 0 = clean. Exit 1 = at least one unguarded DEFINER function.
 */

// Pure SQL-parsing helpers, kept in CommonJS so Jest can require them directly
// (the repo's jest-expo preset does not transform .mjs, and widening that
// transform for one file would put 1800+ passing tests at risk). The CLI wrapper
// lives in check-definer-grants.mjs.

// Deliberate, reviewed exceptions: DEFINER functions that MUST stay executable
// by anon/PUBLIC. Mirrors DEFINER_EXECUTE_ALLOWLIST in check-schema-drift.mjs —
// an entry here re-opens the exact hole this check exists to catch, so it needs a
// written reason. Key on the bare function name (this is a static check; it has
// no catalog to resolve identity arguments against).
//
//   can_view_user_content
//     RLS privacy helper, called inside USING clauses on follows/content. The
//     querying role — including anon browsing public content — must be able to
//     execute it. Returns a boolean only; exposes no row data itself.
const ANON_EXECUTE_ALLOWLIST = new Set(['can_view_user_content']);

/** Strip `--` line comments and block comments, preserving $$-quoted bodies. */
function stripComments(sql) {
  let out = '';
  let i = 0;
  let dollarTag = null;
  while (i < sql.length) {
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        out += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        out += sql[i++];
      }
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (dollar) {
      dollarTag = dollar[0];
      out += dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    out += sql[i++];
  }
  return out;
}

const unquote = (s) => s.replace(/"/g, '').toLowerCase();

/**
 * Blank out every $tag$...$tag$ body, keeping its delimiters.
 *
 * Declaration scanning must never look inside a function body. A body is opaque
 * text that can legally contain the words "create function ... security definer"
 * — in a string literal, a RAISE message, or dynamic SQL — and reading that as a
 * declaration invents functions that do not exist. Clause order makes this safe:
 * SECURITY DEFINER belongs to the header and always precedes the body.
 */
function stripDollarBodies(sql) {
  return sql.replace(/(\$[A-Za-z_]*\$)[\s\S]*?\1/g, (_, tag) => `${tag}${tag}`);
}

/**
 * Names of public-schema functions this SQL creates WITH `SECURITY DEFINER`.
 * Bodies are blanked first, then only each statement's header — everything up to
 * the body delimiter — is examined.
 */
function definerFunctionsCreated(rawSql) {
  const sql = stripDollarBodies(rawSql);
  const found = new Set();
  const re = /\bcreate\s+(?:or\s+replace\s+)?function\s+([^(]+)\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const raw = m[1].trim();
    const parts = raw.split('.').map(unquote);
    const name = parts[parts.length - 1];
    const schema = parts.length > 1 ? parts[0] : 'public';
    if (schema !== 'public') continue;

    // Header = from the match to the start of the body ($$ / AS ' / LANGUAGE sql AS).
    const rest = sql.slice(m.index);
    const bodyAt = rest.search(/\$[A-Za-z_]*\$|\bas\s+'/i);
    const header = bodyAt === -1 ? rest.slice(0, 2000) : rest.slice(0, bodyAt);
    if (/\bsecurity\s+definer\b/i.test(header)) found.add(name);
  }
  return found;
}

/** Function name out of an `ON FUNCTION [schema.]name(` clause, or null. */
function targetFunction(clause) {
  const fn = /\bon\s+function\s+([^(]+)\(/i.exec(clause);
  if (!fn) return null;
  const parts = fn[1].trim().split('.').map(unquote);
  return parts[parts.length - 1];
}

/**
 * Per-function grant posture declared by this SQL:
 *   revokedPublic / revokedAnon / revokedAuthenticated — named in a REVOKE
 *   grantedAuthenticated — named in a GRANT
 *
 * `authenticated` is tracked separately from PUBLIC/anon on purpose. A fresh
 * function is granted to authenticated BY DEFAULT (case A), so authenticated
 * access is only ever *intentional* if the migration either revokes it or grants
 * it explicitly. Plenty of DEFINER RPCs are legitimately client-JWT-callable —
 * `sync_tv_show_progress` is one — so demanding it always be revoked would be
 * wrong, but silently inheriting the default is what this catches.
 */
function grantPosture(sql) {
  const posture = new Map();
  const at = (fn) => {
    if (!posture.has(fn)) {
      posture.set(fn, {
        revokedPublic: false,
        revokedAnon: false,
        revokedAuthenticated: false,
        grantedAuthenticated: false,
      });
    }
    return posture.get(fn);
  };

  const revokeRe = /\brevoke\b([\s\S]*?)\bfrom\b([^;]*);/gi;
  let m;
  while ((m = revokeRe.exec(sql)) !== null) {
    const fn = targetFunction(m[1]);
    if (!fn) continue;
    const roles = m[2].toLowerCase();
    const p = at(fn);
    if (/\bpublic\b/.test(roles)) p.revokedPublic = true;
    if (/\banon\b/.test(roles)) p.revokedAnon = true;
    if (/\bauthenticated\b/.test(roles)) p.revokedAuthenticated = true;
  }

  const grantRe = /\bgrant\b([\s\S]*?)\bto\b([^;]*);/gi;
  while ((m = grantRe.exec(sql)) !== null) {
    const fn = targetFunction(m[1]);
    if (!fn) continue;
    if (/\bauthenticated\b/.test(m[2].toLowerCase())) at(fn).grantedAuthenticated = true;
  }
  return posture;
}

/**
 * Why a function fails, or null if its posture is sound.
 *
 * Hard requirement: PUBLIC and anon must both be named in a REVOKE. Revoking
 * PUBLIC alone is the exact no-op that leaked three times (case B).
 *
 * Softer requirement: authenticated must be either revoked or explicitly
 * granted, so its EXECUTE is a decision rather than an inherited default.
 */
function violation(posture) {
  if (!posture) return 'no REVOKE at all — anon and PUBLIC keep the default EXECUTE';
  const missing = [];
  if (!posture.revokedPublic) missing.push('PUBLIC');
  if (!posture.revokedAnon) missing.push('anon');
  if (missing.length) return `REVOKE does not name ${missing.join(' or ')}`;
  if (!posture.revokedAuthenticated && !posture.grantedAuthenticated) {
    return 'authenticated is neither revoked nor explicitly granted — it keeps EXECUTE by default';
  }
  return null;
}

module.exports = {
  ANON_EXECUTE_ALLOWLIST,
  stripComments,
  definerFunctionsCreated,
  grantPosture,
  violation,
};
