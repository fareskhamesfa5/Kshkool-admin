-- Koshkool Admin: initial schema only.
-- Run after reviewing your existing Supabase schema. Do not paste passwords or service-role keys here.
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  admin_id text not null unique,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now()
);
alter table public.admin_roles enable row level security;

-- Authenticated admins can read their own role row only.
drop policy if exists "admins read own role" on public.admin_roles;
create policy "admins read own role" on public.admin_roles
for select to authenticated using (auth.uid() = user_id);

-- No browser-side insert/update/delete policies are provided intentionally.
-- Provision the first owner using a trusted server-side script / Supabase dashboard.
-- Add server-side policies for each managed table after confirming your schema.
