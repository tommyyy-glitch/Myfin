-- Synthetic rows only. Every mutation is rolled back. No auth users are created.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.myfin_sync_v2 (id,ver,salt,iv,data) values ('__rls_check__',1,'test','test','synthetic');
do $$ begin
  if (select count(*) from public.myfin_sync_v2 where id='__rls_check__') <> 1 then raise exception 'owner SELECT failed'; end if;
  update public.myfin_sync_v2 set ver=2 where id='__rls_check__';
  if not found then raise exception 'owner UPDATE failed'; end if;
  begin
    update public.myfin_sync_v2 set owner_id='00000000-0000-4000-8000-000000000002' where id='__rls_check__';
    raise exception 'owner reassignment was allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.myfin_sync_v2 where id='__rls_check__';
    raise exception 'client DELETE was allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  if exists(select 1 from public.myfin_sync_v2 where id='__rls_check__') then raise exception 'cross-user SELECT leak'; end if;
  update public.myfin_sync_v2 set ver=3 where id='__rls_check__';
  if found then raise exception 'cross-user UPDATE allowed'; end if;
  begin
    insert into public.myfin_sync_v2 (owner_id,id,ver,salt,iv,data) values ('00000000-0000-4000-8000-000000000001','__spoof__',1,'test','test','synthetic');
    raise exception 'spoofed owner INSERT allowed';
  exception when insufficient_privilege then null; end;
end $$;
-- Same ledger code under a different owner must not collide.
insert into public.myfin_sync_v2 (id,ver,salt,iv,data) values ('__rls_check__',1,'test','test','synthetic');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin perform 1 from public.myfin_sync_v2; raise exception 'anonymous SELECT allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.myfin_sync_v2 (id,ver,salt,iv,data) values ('__anon__',1,'test','test','test'); raise exception 'anonymous INSERT allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'OWNER_ISOLATION_TESTS_PASSED_AND_ROLLED_BACK' as result;
