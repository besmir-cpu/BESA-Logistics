-- Owner-run transaction rehearsal. Assertions roll back all test settings.
begin;
select set_config('besa.test_admin',(select user_id::text from public.besa_admins limit 1),true);
select set_config('besa.test_driver',(select id::text from public.besa_drivers limit 1),true);
select set_config('besa.test_vehicles',(select count(*)::text from public.besa_vehicles),true);
update private.besa_security_settings set require_mfa=true where id;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('besa.test_admin'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ begin
 if public.besa_is_admin() or (select count(*) from public.besa_vehicles)<>0 then raise exception 'Unverified administrator accessed records';end if;
 if (select count(*) from public.besa_admins)<>1 then raise exception 'MFA enrolment membership lookup unavailable';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('besa.test_admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin
 if not public.besa_is_admin() or (select count(*) from public.besa_vehicles)::text<>current_setting('besa.test_vehicles') then raise exception 'Verified administrator lost access';end if;
 if has_table_privilege(current_user,'public.besa_driver_journey','UPDATE') then raise exception 'Unchecked checklist writes permitted';end if;
 if has_function_privilege(current_user,'public.besa_export_backup()','EXECUTE') or has_function_privilege(current_user,'public.besa_rehearse_backup(jsonb)','EXECUTE') then raise exception 'Office user has backup powers';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$ begin
 if public.besa_is_admin() or (select count(*) from public.besa_vehicles)<>0 or (select count(*) from public.besa_driver_journey)<>0 or (select count(*) from public.besa_admins)<>0 then raise exception 'Non-administrator accessed private records';end if;
 begin
  perform public.besa_save_driver_journey(current_setting('besa.test_driver')::uuid,'{}','{}',0);
  raise exception 'Non-administrator saved checklist';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 if has_table_privilege(current_user,'public.besa_vehicles','SELECT') or has_table_privilege(current_user,'public.besa_driver_evidence','INSERT') or has_function_privilege(current_user,'public.besa_export_backup()','EXECUTE') then raise exception 'Anonymous private access permitted';end if;
end $$;
reset role;
rollback;
select 'Verified administrator, unverified administrator, non-administrator and anonymous permissions passed; test changes rolled back.' as result;
