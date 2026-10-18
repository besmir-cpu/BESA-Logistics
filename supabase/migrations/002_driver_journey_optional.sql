-- BESA Driver Journey: OPTIONAL REVIEW-REQUIRED migration.
-- DO NOT apply to a production Supabase project without administrator review,
-- access-control testing, secure backups and explicit BESA approval.
-- It is not executed or installed by publishing the GitHub Pages website.
-- Data remains protected from anonymous users and applicants.

begin;

create extension if not exists pgcrypto;

create table if not exists public.besa_driver_journey (
  driver_id text primary key,
  checklist jsonb not null default '{}'::jsonb
    check (jsonb_typeof(checklist) = 'object'),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.besa_driver_evidence (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null,
  doc_type text not null check(doc_type in (
    'right-to-work','driving-licence-front','driving-licence-back',
    'dvla-check','proof-of-address','other'
  )),
  file_name text not null check(length(file_name) between 1 and 160),
  storage_path text not null unique,
  mime_type text not null check(mime_type in (
    'application/pdf','image/jpeg','image/png','image/webp'
  )),
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid default auth.uid()
);
create index if not exists besa_driver_evidence_driver_idx
  on public.besa_driver_evidence(driver_id,uploaded_at desc);

-- Only the same office administrators already checked by the main website.
-- Row-level security is NOT relaxed for anyone else.
alter table public.besa_driver_journey enable row level security;
alter table public.besa_driver_evidence enable row level security;
revoke all on public.besa_driver_journey from public, anon;
revoke all on public.besa_driver_evidence from public, anon;
grant select,insert,update on public.besa_driver_journey to authenticated;
grant select,insert on public.besa_driver_evidence to authenticated;

drop policy if exists "besa_admin_journey_read" on public.besa_driver_journey;
create policy "besa_admin_journey_read" on public.besa_driver_journey
  for select to authenticated
  using (exists (
    select 1 from public.besa_admins
    where lower(email)=lower(coalesce(auth.jwt()->>'email',''))
  ));
drop policy if exists "besa_admin_journey_insert" on public.besa_driver_journey;
create policy "besa_admin_journey_insert" on public.besa_driver_journey
  for insert to authenticated
  with check (exists (
    select 1 from public.besa_admins
    where lower(email)=lower(coalesce(auth.jwt()->>'email',''))
  ));
drop policy if exists "besa_admin_journey_update" on public.besa_driver_journey;
create policy "besa_admin_journey_update" on public.besa_driver_journey
  for update to authenticated
  using (exists (
    select 1 from public.besa_admins
    where lower(email)=lower(coalesce(auth.jwt()->>'email',''))
  ))
  with check (exists (
    select 1 from public.besa_admins
    where lower(email)=lower(coalesce(auth.jwt()->>'email',''))
  ));

drop policy if exists "besa_admin_evidence_read" on public.besa_driver_evidence;
create policy "besa_admin_evidence_read" on public.besa_driver_evidence
  for select to authenticated
  using (exists (
    select 1 from public.besa_admins
    where lower(email)=lower(coalesce(auth.jwt()->>'email',''))
  ));
drop policy if exists "besa_admin_evidence_insert" on public.besa_driver_evidence;
create policy "besa_admin_evidence_insert" on public.besa_driver_evidence
  for insert to authenticated
  with check (exists (
    select 1 from public.besa_admins
    where lower(email)=lower(coalesce(auth.jwt()->>'email',''))
  ));

-- Store private evidence only; never use a public bucket or getPublicUrl().
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
 'besa-driver-private-evidence','besa-driver-private-evidence',false,
 8388608,array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict(id) do update
set public=false,file_size_limit=8388608,
    allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "besa_admin_private_driver_read" on storage.objects;
create policy "besa_admin_private_driver_read" on storage.objects
  for select to authenticated
  using (
    bucket_id='besa-driver-private-evidence' and
    exists (select 1 from public.besa_admins
      where lower(email)=lower(coalesce(auth.jwt()->>'email','')))
  );
drop policy if exists "besa_admin_private_driver_insert" on storage.objects;
create policy "besa_admin_private_driver_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id='besa-driver-private-evidence' and
    exists (select 1 from public.besa_admins
      where lower(email)=lower(coalesce(auth.jwt()->>'email','')))
  );
drop policy if exists "besa_admin_private_driver_delete" on storage.objects;
create policy "besa_admin_private_driver_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id='besa-driver-private-evidence' and
    exists (select 1 from public.besa_admins
      where lower(email)=lower(coalesce(auth.jwt()->>'email','')))
  );

-- Whenever a real BESA driver is added using the existing live
-- besa_drivers form, automatically allocate that driver's blank checklist.
-- This trigger does NOT activate drivers or invite anyone.
create or replace function public.besa_create_blank_driver_journey()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.besa_driver_journey(driver_id)
  values (new.id::text)
  on conflict(driver_id) do nothing;
  return new;
end;
$$;
revoke all on function public.besa_create_blank_driver_journey() from public;
drop trigger if exists besa_driver_created_journey on public.besa_drivers;
create trigger besa_driver_created_journey
  after insert on public.besa_drivers
  for each row execute function public.besa_create_blank_driver_journey();

-- Preserve existing drivers and create only missing blank checklists.
insert into public.besa_driver_journey(driver_id)
select id::text from public.besa_drivers
on conflict(driver_id) do nothing;

commit;

-- BEFORE PRODUCTION ROLLOUT:
-- 1. Check admin login: admin can select/insert/update tasks and upload docs.
-- 2. Check non-admin and anonymous JWTs: no data, no upload, no signed URLs.
-- 3. Verify bucket PUBLIC=false and cannot be accessed without signed URL.
-- 4. Verify existing besa_drivers RLS and insert/create behaviour are unchanged.
-- 5. Verify backup, retention, breach response, and right-to-work audit rules.
-- 6. Require explicit BESA approval for this migration before execution.
