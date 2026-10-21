-- Encrypted exports and non-destructive restore rehearsals. No public data API.
begin;
create table private.besa_backup_settings(
 id boolean primary key default true check(id),public_key text not null,
 job_token_hash text not null check(job_token_hash ~ '^[a-f0-9]{64}$')
);
revoke all on private.besa_backup_settings from public,anon,authenticated;
grant select on private.besa_backup_settings to service_role;
create function public.besa_backup_configuration() returns jsonb language sql security invoker set search_path=''
as $$ select jsonb_build_object('public_key',public_key,'job_token_hash',job_token_hash) from private.besa_backup_settings where id; $$;
revoke all on function public.besa_backup_configuration() from public,anon,authenticated;
grant execute on function public.besa_backup_configuration() to service_role;

create function private.besa_export_backup() returns jsonb language plpgsql security definer set search_path=''
as $$ declare payload jsonb:='{}';item record;records jsonb;begin
 for item in select tablename from pg_catalog.pg_tables where schemaname='public' order by tablename loop
   execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r',item.tablename) into records;
   payload:=payload||jsonb_build_object('public.'||item.tablename,records);
 end loop;
 payload:=payload||jsonb_build_object(
   'auth.users',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from auth.users r),
   'auth.identities',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from auth.identities r),
   'auth.mfa_factors',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from auth.mfa_factors r),
   'private.besa_security_settings',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from private.besa_security_settings r)
 );
 return jsonb_build_object('format','besa-recovery-v1','created_at',now(),'data',payload,
  'columns',(select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema in ('public','private')),
  'constraints',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',p.conname,'definition',pg_get_constraintdef(p.oid))) from pg_catalog.pg_constraint p join pg_catalog.pg_class c on c.oid=p.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')),
  'indexes',(select jsonb_agg(to_jsonb(i)) from pg_catalog.pg_indexes i where schemaname in ('public','private')),
  'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid),'acl',p.proacl)) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
  'triggers',(select jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid))) from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal),
  'policies',(select jsonb_agg(to_jsonb(p)) from pg_catalog.pg_policies p where schemaname in ('public','storage')),
  'grants',(select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where table_schema in ('public','private')),
  'storage_buckets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) from storage.buckets b),
  'storage_objects',(select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) from storage.objects o)
 );
end $$;
revoke all on function private.besa_export_backup() from public,anon,authenticated;
grant execute on function private.besa_export_backup() to service_role;
create function public.besa_export_backup() returns jsonb language sql security invoker set search_path='' as $$ select private.besa_export_backup(); $$;
revoke all on function public.besa_export_backup() from public,anon,authenticated;
grant execute on function public.besa_export_backup() to service_role;

-- Rebuild rows in a random, unexposed schema, compare their content and remove
-- the test schema in the same transaction. Cannot target production tables.
create function private.besa_rehearse_backup(p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=''
as $$ declare sandbox text:='besa_restore_'||replace(gen_random_uuid()::text,'-','');item record;parts text[];total integer:=0;actual jsonb;expected jsonb;extra text[];rows integer;begin
 if p_snapshot->>'format'<>'besa-recovery-v1' or jsonb_typeof(p_snapshot->'data')<>'object' or octet_length(p_snapshot::text)>100000000 then raise exception 'Invalid recovery snapshot';end if;
 execute format('create schema %I',sandbox);
 execute format('revoke all on schema %I from public,anon,authenticated,service_role',sandbox);
 for item in select key,value from jsonb_each(p_snapshot->'data') loop
  parts:=string_to_array(item.key,'.');
  if array_length(parts,1)<>2 or parts[2]!~'^[a-z_][a-z_0-9]*$' or not (
    (parts[1]='public' and exists(select 1 from pg_catalog.pg_tables where schemaname='public' and tablename=parts[2]))
    or (parts[1]='auth' and parts[2]=any(array['users','identities','mfa_factors']))
    or (parts[1]='private' and parts[2]='besa_security_settings')
  ) or jsonb_typeof(item.value)<>'array' then raise exception 'Unexpected recovery table';end if;
  execute format('create table %I.%I as select * from jsonb_populate_recordset(null::%I.%I,$1)',sandbox,parts[1]||'_'||parts[2],parts[1],parts[2]) using item.value;
  select coalesce(jsonb_agg(value order by value::text),'[]'::jsonb) into expected from jsonb_array_elements(item.value);
  select array_agg(column_name) into extra from information_schema.columns where table_schema=parts[1] and table_name=parts[2] and not (coalesce(item.value->0,'{}') ? column_name);
  execute format('select count(*),coalesce(jsonb_agg(to_jsonb(r)-$1 order by (to_jsonb(r)-$1)::text),''[]''::jsonb) from %I.%I r',sandbox,parts[1]||'_'||parts[2]) into rows,actual using coalesce(extra,array[]::text[]);
  if rows<>jsonb_array_length(item.value) or actual<>expected then raise exception 'Recovery content did not match: %',item.key;end if;
  total:=total+rows;
 end loop;
 execute format('drop schema %I cascade',sandbox);
 return jsonb_build_object('verified',true,'restored_rows',total,'production_modified',false);
end $$;
revoke all on function private.besa_rehearse_backup(jsonb) from public,anon,authenticated;
grant execute on function private.besa_rehearse_backup(jsonb) to service_role;
create function public.besa_rehearse_backup(p_snapshot jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.besa_rehearse_backup(p_snapshot); $$;
revoke all on function public.besa_rehearse_backup(jsonb) from public,anon,authenticated;
grant execute on function public.besa_rehearse_backup(jsonb) to service_role;
commit;
