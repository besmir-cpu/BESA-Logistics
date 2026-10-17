-- BESA driver portal: first isolated foundation.
-- Apply to the EXISTING Supabase project only after reviewing the backup and policies.
-- Nothing in this migration modifies existing besa_drivers, besa_vehicles or their RLS.
begin;

-- Re-use the office administrator roster without exposing it to driver accounts.
create or replace function public.besa_portal_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.besa_admins a
    where lower(a.email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.besa_portal_is_admin() from public;
grant execute on function public.besa_portal_is_admin() to authenticated;

-- Each verified Supabase Auth user may create ONE profile, linked to their own uid.
-- This is separate from the internal besa_drivers register until office review.
create table if not exists public.besa_portal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text not null check (char_length(last_name) between 1 and 100),
  phone text check (char_length(phone) <= 40),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists besa_portal_profiles_email_idx on public.besa_portal_profiles (lower(email));
alter table public.besa_portal_profiles enable row level security;
drop policy if exists "besa_profile_read" on public.besa_portal_profiles;
create policy "besa_profile_read" on public.besa_portal_profiles for select to authenticated
using (user_id = (select auth.uid()) or (select public.besa_portal_is_admin()));
drop policy if exists "besa_profile_insert" on public.besa_portal_profiles;
create policy "besa_profile_insert" on public.besa_portal_profiles for insert to authenticated
with check (
  user_id = (select auth.uid())
  and lower(email) = lower((select auth.jwt() ->> 'email'))
);
drop policy if exists "besa_profile_update" on public.besa_portal_profiles;
create policy "besa_profile_update" on public.besa_portal_profiles for update to authenticated
using (user_id = (select auth.uid()) or (select public.besa_portal_is_admin()))
with check (
  (user_id = (select auth.uid()) and lower(email) = lower((select auth.jwt() ->> 'email')))
  or (select public.besa_portal_is_admin())
);

-- Document metadata: the files themselves are private Supabase Storage objects.
-- Drivers cannot set their own approval statuses.
create table if not exists public.besa_portal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.besa_portal_profiles(user_id) on delete cascade,
  document_type text not null check (document_type in (
    'licence_front','licence_back','right_to_work','other'
  )),
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) <= 255),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (storage_path like user_id::text || '/%')
);
create index if not exists besa_portal_documents_owner_idx on public.besa_portal_documents (user_id, uploaded_at desc);
alter table public.besa_portal_documents enable row level security;
drop policy if exists "besa_document_read" on public.besa_portal_documents;
create policy "besa_document_read" on public.besa_portal_documents for select to authenticated
using (user_id = (select auth.uid()) or (select public.besa_portal_is_admin()));
drop policy if exists "besa_document_insert" on public.besa_portal_documents;
create policy "besa_document_insert" on public.besa_portal_documents for insert to authenticated
with check (
  user_id = (select auth.uid())
  and review_status = 'pending'
  and reviewed_at is null
  and storage_path like (select auth.uid())::text || '/%'
);
drop policy if exists "besa_document_admin_update" on public.besa_portal_documents;
create policy "besa_document_admin_update" on public.besa_portal_documents for update to authenticated
using ((select public.besa_portal_is_admin()))
with check ((select public.besa_portal_is_admin()));

-- Rota is published by office users and read-only for individual drivers.
-- EW/RA/C1/C2 count as working; Office and OFF do not.
create table if not exists public.besa_portal_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.besa_portal_profiles(user_id) on delete cascade,
  shift_date date not null,
  shift_code text not null check (shift_code in ('EW','RA','C1','C2','Office','OFF')),
  is_working_day boolean generated always as (shift_code in ('EW','RA','C1','C2')) stored,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, shift_date)
);
create index if not exists besa_portal_shifts_schedule_idx on public.besa_portal_shifts (shift_date, user_id);
alter table public.besa_portal_shifts enable row level security;
drop policy if exists "besa_shift_read" on public.besa_portal_shifts;
create policy "besa_shift_read" on public.besa_portal_shifts for select to authenticated
using (user_id = (select auth.uid()) or (select public.besa_portal_is_admin()));
drop policy if exists "besa_shift_admin_insert" on public.besa_portal_shifts;
create policy "besa_shift_admin_insert" on public.besa_portal_shifts for insert to authenticated
with check ((select public.besa_portal_is_admin()));
drop policy if exists "besa_shift_admin_update" on public.besa_portal_shifts;
create policy "besa_shift_admin_update" on public.besa_portal_shifts for update to authenticated
using ((select public.besa_portal_is_admin())) with check ((select public.besa_portal_is_admin()));
drop policy if exists "besa_shift_admin_delete" on public.besa_portal_shifts;
create policy "besa_shift_admin_delete" on public.besa_portal_shifts for delete to authenticated
using ((select public.besa_portal_is_admin()));

grant select, insert, update on public.besa_portal_profiles to authenticated;
grant select, insert, update on public.besa_portal_documents to authenticated;
grant select, insert, update, delete on public.besa_portal_shifts to authenticated;

-- Private files: maximum 10 MB, only images and PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'besa-driver-documents', 'besa-driver-documents', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "besa_storage_read" on storage.objects;
create policy "besa_storage_read" on storage.objects for select to authenticated
using (
  bucket_id = 'besa-driver-documents'
  and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or (select public.besa_portal_is_admin())
  )
);
drop policy if exists "besa_storage_upload" on storage.objects;
create policy "besa_storage_upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'besa-driver-documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists (
    select 1 from public.besa_portal_profiles p where p.user_id = (select auth.uid())
  )
);

commit;
