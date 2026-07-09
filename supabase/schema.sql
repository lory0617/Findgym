-- Run in the Supabase SQL editor after creating the project.
-- Also enable "Anonymous sign-ins" under Auth > Providers.

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) default auth.uid(),
  gym_id          text,
  report_type     text not null,
  submitted_value text,
  evidence_url    text,
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

create table if not exists public.saved (
  user_id    uuid not null references auth.users(id) default auth.uid(),
  gym_id     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, gym_id)
);

alter table public.reports enable row level security;
alter table public.saved   enable row level security;

-- reports: users insert their own; nobody reads via the anon key (operator
-- reads through the dashboard / service role).
create policy "reports insert own" on public.reports
  for insert to authenticated with check (user_id = auth.uid());

-- saved: users fully manage only their own rows.
create policy "saved select own" on public.saved
  for select to authenticated using (user_id = auth.uid());
create policy "saved insert own" on public.saved
  for insert to authenticated with check (user_id = auth.uid());
create policy "saved delete own" on public.saved
  for delete to authenticated using (user_id = auth.uid());
