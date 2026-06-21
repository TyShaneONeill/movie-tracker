-- Customizable avatars (Duolingo-style): vector avatar config on profiles.
--
-- avatar_type drives how the client <Avatar> renders:
--   'auto'    (default) — deterministic vector avatar seeded from the user id
--   'preset'  — customized vector avatar described by avatar_config
--   'photo'   — uploaded image in avatar_url (existing behavior)
--   'initial' — first-letter monogram (background color in avatar_config.backgroundColor)
--
-- Additive + backward compatible:
--   * Existing rows default to 'auto'. The client treats 'auto' + a present
--     avatar_url as a photo, so existing photo users keep rendering their photo
--     with NO backfill required.
--   * avatar_config is null until a user customizes.
--
-- Security: avatar_type / avatar_config are NOT privileged columns. The existing
-- profiles UPDATE policy (auth.uid() = id) covers them, and the
-- protect_profile_privileged_cols() trigger only pins account_tier /
-- tier_expires_at / rewarded_ad_credits / id — so owners can self-update these
-- freely. No RLS or trigger changes needed.

alter table public.profiles
  add column if not exists avatar_type text not null default 'auto',
  add column if not exists avatar_config jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_avatar_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_type_check
      check (avatar_type in ('auto', 'preset', 'photo', 'initial'));
  end if;
end $$;

comment on column public.profiles.avatar_type is
  'How the client renders the avatar: auto | preset | photo | initial';
comment on column public.profiles.avatar_config is
  'Vector avatar customization (DiceBear avataaars trait ids); null until customized';
