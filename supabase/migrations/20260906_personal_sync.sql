-- Personal authenticated sync. Additive: legacy public.myfin_sync is untouched.
begin;
create table public.myfin_sync_v2 (
  owner_id uuid not null default auth.uid(),
  id text not null check (length(id) between 1 and 100),
  ver bigint not null check (ver > 0 and ver <= 9007199254740991),
  updated_at timestamptz not null default now(),
  salt text not null,
  iv text not null,
  data text not null,
  primary key (owner_id, id)
);
alter table public.myfin_sync_v2 enable row level security;
revoke all on public.myfin_sync_v2 from public, anon, authenticated;
grant select, insert, update on public.myfin_sync_v2 to authenticated;
create policy myfin_owner_select on public.myfin_sync_v2
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy myfin_owner_insert on public.myfin_sync_v2
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy myfin_owner_update on public.myfin_sync_v2
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
comment on table public.myfin_sync_v2 is 'Myfin encrypted profiles, owner-only. No anonymous access or client deletion. Legacy sync is separate.';
commit;
