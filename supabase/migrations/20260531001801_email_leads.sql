-- Email lead capture for the public landing page (public/welcome.html).
-- Backs the "Keep your seat" email capture and the future Android "notify me" block.
-- Insert-only for anon so captured emails CANNOT be read/harvested with the public key.

create table if not exists public.email_leads (
    id uuid primary key default gen_random_uuid(),
    email text not null
        check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    source text not null default 'web_welcome'
        check (char_length(source) <= 64),
    created_at timestamptz not null default now(),
    unique (email, source)
);

alter table public.email_leads enable row level security;

-- The public landing page (anon) may INSERT leads only. There is intentionally NO
-- select/update/delete policy, so captured emails are not readable with the public key.
-- Admin/export reads go through the service role, which bypasses RLS.
create policy "anon can insert email leads"
    on public.email_leads
    for insert
    to anon
    with check (true);

-- Logged-in users (e.g. in-app launch opt-ins) may also insert.
create policy "authenticated can insert email leads"
    on public.email_leads
    for insert
    to authenticated
    with check (true);

comment on table public.email_leads is
    'Landing-page email capture (lead recovery / launch notify). Insert-only via anon; read/export via service role only. source distinguishes web_welcome vs android_notify, etc.';
