-- Foundations release. Authorised by BESA: security, permissions, shared storage.
-- Additive schema changes; existing business records and candidate files retained.
begin;
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated,service_role;

alter table public.besa_admins add column if not exists user_id uuid references auth.users(id);
update public.besa_admins a set user_id=u.id from auth.users u where a.user_id is null and lower(a.email)=lower(u.email);
alter table public.besa_admins alter column user_id set not null;
create unique index if not exists besa_admins_user_id_idx on public.besa_admins(user_id);
create table if not exists private.besa_security_settings(
 id boolean primary key default true check(id),require_mfa boolean not null default false
);
insert into private.besa_security_settings(id) values(true) on conflict do nothing;
revoke all on private.besa_security_settings from public,anon,authenticated;

create or replace function private.besa_is_admin()
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null
 and exists(select 1 from public.besa_admins a where a.user_id=(select auth.uid()))
 and (
   (select auth.jwt()->>'aal')='aal2'
   or (not (select require_mfa from private.besa_security_settings where id)
       and not exists(select 1 from auth.mfa_factors f where f.user_id=(select auth.uid()) and f.status='verified'))
 );
$$;
revoke all on function private.besa_is_admin() from public,anon;
grant execute on function private.besa_is_admin() to authenticated,service_role;
create or replace function public.besa_is_admin()
returns boolean language sql stable security invoker set search_path=''
as $$ select private.besa_is_admin(); $$;
revoke all on function public.besa_is_admin() from public,anon;
grant execute on function public.besa_is_admin() to authenticated,service_role;
drop policy if exists "Administrators can see their membership" on public.besa_admins;
create policy "Administrators can see their membership" on public.besa_admins for select to authenticated
 using(user_id=(select auth.uid()));
revoke all on public.besa_admins from public,anon,authenticated;
grant select on public.besa_admins to authenticated;

-- Keep legacy records, close the old any-signed-in-user permission.
drop policy if exists "Admins full access" on public.drivers;
drop policy if exists "Applicants can view own" on public.drivers;
revoke all on public.drivers,public.documents,public.signatures from public,anon,authenticated;
grant select,insert,update on public.drivers,public.documents,public.signatures to authenticated;
do $$ declare t text;begin
 foreach t in array array['drivers','documents','signatures'] loop
   execute format('create policy besa_admin_legacy_read on public.%I for select to authenticated using((select private.besa_is_admin()))',t);
   execute format('create policy besa_admin_legacy_insert on public.%I for insert to authenticated with check((select private.besa_is_admin()))',t);
   execute format('create policy besa_admin_legacy_update on public.%I for update to authenticated using((select private.besa_is_admin())) with check((select private.besa_is_admin()))',t);
 end loop;
end $$;

-- Preserve the existing draft function and trigger identities in a non-API schema.
alter function public.besa_save_workspace_draft(text,text,jsonb,integer) set schema private;
alter function private.besa_save_workspace_draft(text,text,jsonb,integer) set search_path='';
revoke all on function private.besa_save_workspace_draft(text,text,jsonb,integer) from public,anon;
grant execute on function private.besa_save_workspace_draft(text,text,jsonb,integer) to authenticated,service_role;
create function public.besa_save_workspace_draft(p_workspace text,p_key text,p_payload jsonb,p_expected_version integer)
returns table(saved boolean,conflict boolean,current_version integer)
language sql security invoker set search_path=''
as $$ select * from private.besa_save_workspace_draft(p_workspace,p_key,p_payload,p_expected_version); $$;
revoke all on function public.besa_save_workspace_draft(text,text,jsonb,integer) from public,anon;
grant execute on function public.besa_save_workspace_draft(text,text,jsonb,integer) to authenticated,service_role;
alter function public.besa_log_change() set schema private;
alter function private.besa_log_change() set search_path='';

create table public.besa_driver_journey(
 driver_id uuid primary key references public.besa_drivers(id),
 checklist jsonb not null default '{}'::jsonb check(jsonb_typeof(checklist)='object'),
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
 version integer not null default 0 check(version>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
create table public.besa_driver_journey_history(
 driver_id uuid not null references public.besa_drivers(id),version integer not null,
 checklist jsonb not null,details jsonb not null,changed_at timestamptz not null default now(),changed_by uuid not null references auth.users(id),
 primary key(driver_id,version)
);
create index besa_journey_updated_by_idx on public.besa_driver_journey(updated_by);
create index besa_journey_history_changed_by_idx on public.besa_driver_journey_history(changed_by);
alter table public.besa_driver_journey enable row level security;
alter table public.besa_driver_journey_history enable row level security;
revoke all on public.besa_driver_journey,public.besa_driver_journey_history from public,anon,authenticated;
grant select on public.besa_driver_journey,public.besa_driver_journey_history to authenticated;
create policy besa_admin_journey_read on public.besa_driver_journey for select to authenticated using((select private.besa_is_admin()));
create policy besa_admin_journey_history_read on public.besa_driver_journey_history for select to authenticated using((select private.besa_is_admin()));

create function private.besa_save_driver_journey(p_driver_id uuid,p_checklist jsonb,p_details jsonb,p_expected_version integer)
returns table(saved boolean,conflict boolean,current_version integer)
language plpgsql security definer set search_path=''
as $$ declare previous public.besa_driver_journey%rowtype;begin
 if not private.besa_is_admin() then raise exception 'Administrator verification required' using errcode='42501';end if;
 if p_expected_version is null or p_expected_version<0 or p_checklist is null or p_details is null
 or jsonb_typeof(p_checklist)<>'object' or jsonb_typeof(p_details)<>'object'
 or octet_length(p_checklist::text)+octet_length(p_details::text)>131072 then raise exception 'Invalid checklist data' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_checklist) as item where jsonb_typeof(item.value)<>'boolean' or item.key<>all(array['requirements','sam1','amazon','dbs','amiigo','sam2','ctdone','samOn','dvla','ra1','ra2','radone','hs','active'])) then raise exception 'Invalid checklist task' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('journey:'||p_driver_id::text,0));
 insert into public.besa_driver_journey(driver_id) values(p_driver_id) on conflict do nothing;
 select * into previous from public.besa_driver_journey where driver_id=p_driver_id for update;
 if previous.version<>p_expected_version then return query select false,true,previous.version;return;end if;
 update public.besa_driver_journey set checklist=p_checklist,details=p_details,version=previous.version+1,updated_at=now(),updated_by=auth.uid() where driver_id=p_driver_id;
 insert into public.besa_driver_journey_history(driver_id,version,checklist,details,changed_by) values(p_driver_id,previous.version+1,p_checklist,p_details,auth.uid());
 return query select true,false,previous.version+1;
end $$;
revoke all on function private.besa_save_driver_journey(uuid,jsonb,jsonb,integer) from public,anon;
grant execute on function private.besa_save_driver_journey(uuid,jsonb,jsonb,integer) to authenticated,service_role;
create function public.besa_save_driver_journey(p_driver_id uuid,p_checklist jsonb,p_details jsonb,p_expected_version integer)
returns table(saved boolean,conflict boolean,current_version integer)
language sql security invoker set search_path=''
as $$ select * from private.besa_save_driver_journey(p_driver_id,p_checklist,p_details,p_expected_version); $$;
revoke all on function public.besa_save_driver_journey(uuid,jsonb,jsonb,integer) from public,anon;
grant execute on function public.besa_save_driver_journey(uuid,jsonb,jsonb,integer) to authenticated,service_role;

create function private.besa_create_blank_driver_journey() returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.besa_driver_journey(driver_id) values(new.id) on conflict do nothing;return new;end $$;
revoke all on function private.besa_create_blank_driver_journey() from public,anon,authenticated;
create trigger besa_driver_created_journey after insert on public.besa_drivers for each row execute function private.besa_create_blank_driver_journey();
insert into public.besa_driver_journey(driver_id) select id from public.besa_drivers on conflict do nothing;

create table public.besa_driver_evidence(
 id uuid primary key default gen_random_uuid(),driver_id uuid not null references public.besa_drivers(id),
 doc_type text not null check(doc_type in ('right-to-work','driving-licence-front','driving-licence-back','dvla-check','proof-of-address','kyc-selfie','other')),
 file_name text not null check(length(file_name) between 1 and 160),storage_path text not null unique,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 uploaded_at timestamptz not null default now(),uploaded_by uuid not null default auth.uid() references auth.users(id),
 check(storage_path like driver_id::text||'/'||doc_type||'/%')
);
create index besa_driver_evidence_driver_idx on public.besa_driver_evidence(driver_id,uploaded_at desc);
create index besa_driver_evidence_uploaded_by_idx on public.besa_driver_evidence(uploaded_by);
alter table public.besa_driver_evidence enable row level security;
revoke all on public.besa_driver_evidence from public,anon,authenticated;
grant select,insert on public.besa_driver_evidence to authenticated;
create policy besa_admin_evidence_read on public.besa_driver_evidence for select to authenticated using((select private.besa_is_admin()));
create policy besa_admin_evidence_insert on public.besa_driver_evidence for insert to authenticated with check((select private.besa_is_admin()) and uploaded_by=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('besa-driver-private-evidence','besa-driver-private-evidence',false,8388608,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy besa_admin_private_driver_read on storage.objects for select to authenticated using(bucket_id='besa-driver-private-evidence' and (select private.besa_is_admin()));
create policy besa_admin_private_driver_insert on storage.objects for insert to authenticated with check(bucket_id='besa-driver-private-evidence' and (select private.besa_is_admin()) and exists(select 1 from public.besa_drivers d where d.id::text=(storage.foldername(name))[1]));
-- Only allow cleanup of failed uploads; retained evidence has no client delete permission.
create policy besa_admin_private_driver_orphan_cleanup on storage.objects for delete to authenticated using(bucket_id='besa-driver-private-evidence' and (select private.besa_is_admin()) and not exists(select 1 from public.besa_driver_evidence e where e.storage_path=name));
commit;
