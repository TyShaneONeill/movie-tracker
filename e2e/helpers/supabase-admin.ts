import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://wliblwulvsrfgqcnbzeh.supabase.co';
// Public anon key — safe to commit (EXPO_PUBLIC_ prefix = intentionally client-side)
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsaWJsd3VsdnNyZmdxY25iemVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwOTYyODIsImV4cCI6MjA4MzY3MjI4Mn0.6FmxPYtHhhIQP0BGADmneIoItVXEzyBMwYX8yER1U5M';

/**
 * Creates an authenticated Supabase client using the E2E test user credentials.
 * Used for seeding and cleaning test data directly without going through the UI.
 */
async function createTestClient() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const email = process.env.E2E_TEST_EMAIL ?? 'g@g.g';
  const password = process.env.E2E_TEST_PASSWORD ?? 'gggggg';

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`E2E test auth failed: ${error.message}`);

  return client;
}

function blockedUsersTable(client: Awaited<ReturnType<typeof createTestClient>>) {
  // blocked_users is not in generated types yet — use untyped wrapper
  return client.from('blocked_users' as any) as any;
}

/**
 * Seeds a blocked_users row for the test user.
 * Safe to call if the row already exists (23505 unique violation is swallowed).
 */
export async function seedBlockedUser(blockedId: string): Promise<void> {
  const client = await createTestClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No authenticated user after sign-in');

  const { error } = await blockedUsersTable(client).insert({
    blocker_id: user.id,
    blocked_id: blockedId,
  });

  if (error && error.code !== '23505') {
    throw new Error(`Failed to seed blocked user: ${error.message}`);
  }
}

/**
 * Removes the blocked_users row for the test user.
 * Safe to call even if the row was already deleted (unblock via UI).
 */
export async function cleanBlockedUser(blockedId: string): Promise<void> {
  const client = await createTestClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No authenticated user after sign-in');

  const { error } = await blockedUsersTable(client)
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) throw new Error(`Failed to clean blocked user: ${error.message}`);
}
