-- BESA secure workspace drafts — APPROVED FOR CONTROLLED DATABASE DEPLOYMENT.
-- Deployment is separate from live website release and financial posting.
-- Does not alter any existing driver, vehicle, SAM or Google Sheet record.
-- All access is denied by default. Only BESA administrators may read/write.
-- Works with existing besa_admins email allowlist; verify its RLS separately.
-- Snapshot audit is an application history, NOT a substitute for off-site backups.
begin;
create table if not exists public.besa_workspace_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace text not null check(workspace in ('rota','van-allocation','payment-tracker','work-summary')),
  workspace_key text not null check(length(workspace_key) between 1 and 80),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2000000),
  version integer not null default 1 check(version>=1),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid(),
  unique(workspace,workspace_key)
);
create index if not exists besa_drafts_updated_idx on public.besa_workspace_drafts(updated_at desc);

create table if not exists public.besa_workspace_draft_history (
  id bigint generated always as identity primary key,
  draft_id uuid not null references public.besa_workspace_drafts(id) on delete restrict,
  workspace text not null,
  workspace_key text not null,
  version integer not null check(version>=1),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  change_at timestamptz not null default now(),
  changed_by uuid not null,
  unique(draft_id,version)
);
create index if not exists besa_draft_history_recent_idx on public.besa_workspace_draft_history(draft_id,version desc);

alter table public.besa_workspace_drafts enable row level security;
alter table public.besa_workspace_draft_history enable row level security;
revoke all on public.besa_workspace_drafts from anon, public, authenticated;
revoke all on public.besa_workspace_draft_history from anon, public, authenticated;
grant select on public.besa_workspace_drafts to authenticated;
grant select on public.besa_workspace_draft_history to authenticated;

drop policy if exists besa_admin_drafts_read on public.besa_workspace_drafts;
create policy besa_admin_drafts_read on public.besa_workspace_drafts for select to authenticated
  using((select public.besa_is_admin()));

drop policy if exists besa_admin_drafts_history on public.besa_workspace_draft_history;
create policy besa_admin_drafts_history on public.besa_workspace_draft_history for select to authenticated
  using((select public.besa_is_admin()));

-- SECURITY DEFINER is only used for this vetted RPC, with fixed
-- search_path and an explicit admin test. App accounts cannot change
-- draft rows or history directly.
create or replace function public.besa_save_workspace_draft(
  p_workspace text,p_key text,p_payload jsonb,p_expected_version integer
) returns table(saved boolean, conflict boolean, current_version integer)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_record public.besa_workspace_drafts%rowtype;
  v_auth uuid;
begin
  v_auth:=auth.uid();
  if v_auth is null or not (select public.besa_is_admin()) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_workspace is null or p_workspace not in ('rota','van-allocation','payment-tracker','work-summary')
     or p_key is null or length(p_key) not between 1 and 80
     or p_payload is null or jsonb_typeof(p_payload)<>'object'
     or octet_length(p_payload::text)>2000000
     or p_expected_version is null or p_expected_version<0
  then
    raise exception 'Invalid draft input' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace||':'||p_key,0));
  select * into v_record from public.besa_workspace_drafts
    where workspace=p_workspace and workspace_key=p_key
    for update;
  if found then
    if v_record.version<>p_expected_version then
      return query select false,true,v_record.version;return;
    end if;
    update public.besa_workspace_drafts d
      set payload=p_payload,version=v_record.version+1,updated_at=now(),updated_by=v_auth
      where d.id=v_record.id
      returning * into v_record;
  else
    if p_expected_version<>0 then
      return query select false,true,0;return;
    end if;
    insert into public.besa_workspace_drafts(workspace,workspace_key,payload,updated_by)
      values (p_workspace,p_key,p_payload,v_auth)
      returning * into v_record;
  end if;
  insert into public.besa_workspace_draft_history
    (draft_id,workspace,workspace_key,version,payload,changed_by)
    values(v_record.id,v_record.workspace,v_record.workspace_key,
      v_record.version,v_record.payload,v_auth);
  return query select true,false,v_record.version;
end;
$$;
revoke all on function public.besa_save_workspace_draft(text,text,jsonb,integer) from public,anon;
grant execute on function public.besa_save_workspace_draft(text,text,jsonb,integer) to authenticated;

-- This deployment intentionally does not copy Google Sheets or SAM invoices,
-- activate accounts, upload documents or issue payments.
commit;

-- REQUIRED BEFORE PRODUCTION:
-- [ ] Admin/non-admin/anonymous RLS and RPC permission tests with separate JWTs.
-- [ ] Review besa_admins read policies, admin removal/revocation and MFA setup.
-- [ ] Configure and test Supabase automatic database backups/PITR per plan,
--     off-site encrypted exports, restore exercise, and retention policies.
-- [ ] Test two simultaneous staff edits; second writer must see a conflict.
-- [ ] Confirm finance data stays review-only and no invoice issuance is exposed.
-- [x] Owner approved applying this additive secure-draft database migration.
-- [ ] Separate sign-off still required for publishing frontend and enabling staff workflows.
