/**
 * Seed STAGING with test accounts + feed activity so avatars are visible in the
 * feed / reviews / comments. Idempotent — safe to re-run.
 *
 * Usage (env provided by Doppler stg):
 *   doppler run -p pocketstubs -c stg -- node scripts/seed-staging-avatars.mjs --email you@example.com
 *   doppler run -p pocketstubs -c stg -- node scripts/seed-staging-avatars.mjs --email you@example.com --reset-onboarding
 *
 * --email             your staging account (you'll follow the test users; required for a populated feed)
 * --reset-onboarding  also flips YOUR profile.onboarding_completed=false so you re-run onboarding
 *
 * SAFETY: refuses to run against the prod project ref.
 */
import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'wliblwulvsrfgqcnbzeh';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const getArg = (n) => {
  const i = args.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i === -1) return undefined;
  const a = args[i];
  if (a.includes('=')) return a.split('=').slice(1).join('='); // --name=value
  const next = args[i + 1];
  if (next && !next.startsWith('--')) return next; // --name value
  return true; // bare flag
};
const rawEmail = getArg('email');
const realEmail = typeof rawEmail === 'string' ? rawEmail : process.env.REAL_USER_EMAIL;
const resetOnboarding = !!getArg('reset-onboarding');
const TEST_PASSWORD = 'TestPass123!';

if (!url || !serviceKey) {
  console.error('Missing Supabase URL or service-role key.');
  console.error('Looked for: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SERVICE_ROLE_KEY).');
  console.error('Check `doppler secrets --project pocketstubs --config stg --only-names` for the exact name and re-run.');
  process.exit(1);
}
if (url.includes(PROD_REF)) {
  console.error(`Refusing to run: ${url} is the PROD project (${PROD_REF}).`);
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const TEST_USERS = [
  {
    email: 'maya.films.stg@pocketstubs.test',
    full_name: 'Maya Chen',
    username: 'maya_films',
    avatar_type: 'preset',
    avatar_config: { skinColor: 'edb98a', top: 'bob', hairColor: '724133', clothing: 'shirtScoopNeck', clothesColor: 'ff488e', eyes: 'happy', eyebrows: 'raisedExcited', mouth: 'smile', backgroundColor: 'ffd5dc' },
    review: { tmdb_id: 27205, movie_title: 'Inception', rating: 9, review_text: 'A dream within a dream — still holds up. The folding-city shot lives rent free.' },
    take: { tmdb_id: 157336, movie_title: 'Interstellar', quote_text: 'Cried at the docking scene. No notes.', reaction_emoji: '😭', rating: 10 },
  },
  {
    email: 'leo.watches.stg@pocketstubs.test',
    full_name: 'Leo Park',
    username: 'leo_watches',
    avatar_type: 'preset',
    avatar_config: { skinColor: 'ae5d29', top: 'shortCurly', hairColor: '2c1b18', clothing: 'hoodie', clothesColor: '10b981', eyes: 'squint', eyebrows: 'default', mouth: 'twinkle', backgroundColor: 'b6e3f4' },
    review: { tmdb_id: 155, movie_title: 'The Dark Knight', rating: 10, review_text: 'Ledger is on another planet. Best comic-book movie, full stop.' },
    take: { tmdb_id: 680, movie_title: 'Pulp Fiction', quote_text: 'Rewatch #6 and the diner scene still slaps.', reaction_emoji: '🔥', rating: 9 },
  },
  {
    email: 'sam.screens.stg@pocketstubs.test',
    full_name: 'Sam Rivera',
    username: 'sam_screens',
    avatar_type: 'initial',
    avatar_config: { backgroundColor: 'fde68a' },
    review: { tmdb_id: 13, movie_title: 'Forrest Gump', rating: 8, review_text: 'Sentimental? Sure. Effective? Absolutely. Run, Forrest.' },
    take: { tmdb_id: 278, movie_title: 'The Shawshank Redemption', quote_text: 'Hope is a good thing. Comfort watch forever.', reaction_emoji: '🥹', rating: 10 },
  },
  {
    email: 'jordan.blake.stg@pocketstubs.test',
    full_name: 'Jordan Blake',
    username: 'jordanb',
    avatar_type: 'auto', // no custom avatar -> shows the initial-letter default
    avatar_config: null,
    review: { tmdb_id: 603, movie_title: 'The Matrix', rating: 9, review_text: 'The bullet-time still feels ahead of its time. Red pill every time.' },
    take: { tmdb_id: 19995, movie_title: 'Avatar', quote_text: 'Saw it in 3D again. The world-building carries it.', reaction_emoji: '🌿', rating: 7 },
  },
];

async function findUserByEmail(email) {
  // Staging is small; page through admin list.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function ensureUser(spec) {
  const { data, error } = await db.auth.admin.createUser({
    email: spec.email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: spec.full_name },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      const existing = await findUserByEmail(spec.email);
      if (!existing) throw new Error(`User ${spec.email} reported existing but not found`);
      return existing.id;
    }
    throw error;
  }
  return data.user.id;
}

async function run() {
  console.log(`▶ Seeding staging at ${url}`);

  // Resolve the real (your) user to follow the test accounts from.
  let realId = null;
  if (realEmail) {
    const real = await findUserByEmail(realEmail);
    if (!real) console.warn(`⚠ Could not find your account (${realEmail}) — skipping follows/onboarding reset. Sign in once on staging, then re-run.`);
    else realId = real.id;
  } else {
    console.warn('⚠ No --email given — creating test users + activity, but you won\'t follow them (feed needs follows).');
  }

  for (const spec of TEST_USERS) {
    const id = await ensureUser(spec);

    await db.from('profiles').update({
      full_name: spec.full_name,
      username: spec.username,
      avatar_type: spec.avatar_type,
      avatar_config: spec.avatar_config,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    // Reset this test user's activity so re-runs don't pile up.
    await db.from('review_comments').delete().eq('user_id', id);
    await db.from('reviews').delete().eq('user_id', id);
    await db.from('first_takes').delete().eq('user_id', id);

    await db.from('reviews').insert({
      user_id: id, media_type: 'movie', visibility: 'public',
      tmdb_id: spec.review.tmdb_id, movie_title: spec.review.movie_title,
      rating: spec.review.rating, review_text: spec.review.review_text, title: spec.review.movie_title,
    });
    await db.from('first_takes').insert({
      user_id: id, media_type: 'movie', visibility: 'public',
      tmdb_id: spec.take.tmdb_id, movie_title: spec.take.movie_title,
      quote_text: spec.take.quote_text, reaction_emoji: spec.take.reaction_emoji, rating: spec.take.rating ?? null,
    });

    if (realId) {
      await db.from('follows').delete().eq('follower_id', realId).eq('following_id', id);
      await db.from('follows').insert({ follower_id: realId, following_id: id });
    }
    console.log(`  ✓ ${spec.full_name} (@${spec.username}) — ${spec.avatar_type}`);
  }

  // A couple of comments so comment-row avatars are visible too: Maya & Leo
  // comment on Sam's review.
  const sam = await findUserByEmail('sam.screens.stg@pocketstubs.test');
  const maya = await findUserByEmail('maya.films.stg@pocketstubs.test');
  const leo = await findUserByEmail('leo.watches.stg@pocketstubs.test');
  if (sam && maya && leo) {
    const { data: samReview } = await db.from('reviews').select('id').eq('user_id', sam.id).limit(1).single();
    if (samReview?.id) {
      await db.from('review_comments').insert([
        { review_id: samReview.id, user_id: maya.id, body: 'Run Forrest run 🏃‍♂️ totally agree.' },
        { review_id: samReview.id, user_id: leo.id, body: 'Comfort-watch royalty. Solid take.' },
      ]);
      console.log('  ✓ Seeded 2 comments on Sam\'s review');
    }
  }

  if (resetOnboarding) {
    if (realId) {
      await db.from('profiles').update({ onboarding_completed: false }).eq('id', realId);
      console.log(`  ✓ Reset onboarding for ${realEmail} — relaunch the app to re-run the flow`);
    } else {
      console.warn('⚠ --reset-onboarding requested but your account was not found; nothing reset.');
    }
  }

  console.log('\n✅ Done. Test accounts (password for all: ' + TEST_PASSWORD + '):');
  TEST_USERS.forEach((u) => console.log(`   ${u.email}`));
  if (!realId) console.log('\n   Re-run with --email <your staging email> to follow them and populate YOUR feed.');
}

run().catch((e) => { console.error('Seed failed:', e.message || e); process.exit(1); });
