-- Read-only recovery metadata; existing business rows and policies are retained.
begin;
create or replace function private.besa_export_backup_v2() returns jsonb language plpgsql security definer set search_path=''
as $$ declare snapshot jsonb;sequences jsonb:='[]';item record;lastval bigint;called boolean;begin
 snapshot:=private.besa_export_backup();
 for item in select n.nspname as schema,c.relname as name,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle,format_type(s.seqtypid,null) as data_type,
  (select jsonb_build_object('schema',tn.nspname,'table',tc.relname,'column',a.attname,'identity',d.deptype='i') from pg_depend d join pg_class tc on tc.oid=d.refobjid join pg_namespace tn on tn.oid=tc.relnamespace join pg_attribute a on a.attrelid=tc.oid and a.attnum=d.refobjsubid where d.objid=c.oid and d.deptype in ('a','i') limit 1) as owned_by
  from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_sequence s on s.seqrelid=c.oid where n.nspname in ('public','private') loop
  execute format('select last_value,is_called from %I.%I',item.schema,item.name) into lastval,called;
  sequences:=sequences||jsonb_build_array(to_jsonb(item)||jsonb_build_object('last_value',lastval,'is_called',called));
 end loop;
 return snapshot||jsonb_build_object('format','besa-recovery-v2','source_project','xyicnwfwsmbfcputqrbn','files_included',false,
  'schema',jsonb_build_object('version',1,
   'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'),
   'auth_columns',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'generated',a.attgenerated,'identity',a.attidentity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid where n.nspname='auth' and c.relname in ('users','identities','mfa_factors') and a.attnum>0 and not a.attisdropped),
   'sequences',sequences,
   'enums',(select coalesce(jsonb_agg(e),'[]') from (select n.nspname as schema,t.typname as name,(select jsonb_agg(enumlabel order by enumsortorder) from pg_enum where enumtypid=t.oid) as labels from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private') and t.typtype='e')e),
   'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'grants',(select jsonb_agg(jsonb_build_object('role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable)) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
   'sequence_grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from information_schema.usage_privileges g where object_schema in ('public','private') and object_type='SEQUENCE'),
   'schema_grants',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type)) from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a where n.nspname in ('public','private')),
   'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname<>'plpgsql'),
   'unsupported',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind)),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('p','v','m','f'))));
end $$;
revoke all on function private.besa_export_backup_v2() from public,anon,authenticated;
grant execute on function private.besa_export_backup_v2() to service_role;
create or replace function public.besa_export_backup_v2() returns jsonb language sql security invoker set search_path='' as $$ select private.besa_export_backup_v2(); $$;
revoke all on function public.besa_export_backup_v2() from public,anon,authenticated;
grant execute on function public.besa_export_backup_v2() to service_role;
create or replace function private.besa_backup_object(p_bucket text,p_path text) returns jsonb language sql stable security definer set search_path='' as $$ select to_jsonb(o) from storage.objects o where bucket_id=p_bucket and name=p_path; $$;
revoke all on function private.besa_backup_object(text,text) from public,anon,authenticated;
grant execute on function private.besa_backup_object(text,text) to service_role;
create or replace function public.besa_backup_object(p_bucket text,p_path text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.besa_backup_object(p_bucket,p_path); $$;
revoke all on function public.besa_backup_object(text,text) from public,anon,authenticated;
grant execute on function public.besa_backup_object(text,text) to service_role;
commit;
