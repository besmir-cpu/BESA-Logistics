-- BESA confidential candidate onboarding. No existing records are edited.
-- All candidate data and uploaded evidence use private, admin-only storage.
-- Candidate token verification and all writes occur exclusively in a reviewed
-- Supabase Edge Function using server-side credentials. The browser only ever
-- receives a temporary invitation token, never service credentials.
begin;

create table public.besa_candidate_invites (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.besa_drivers(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  submitted_at timestamptz,
  candidate_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(candidate_payload)='object' and octet_length(candidate_payload::text) <= 16000),
  unique(id,driver_id),
  check (expires_at>created_at)
);
create index besa_candidate_invites_driver_idx
  on public.besa_candidate_invites(driver_id,created_at desc);

create table public.besa_candidate_documents (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.besa_candidate_invites(id) on delete restrict,
  driver_id uuid not null references public.besa_drivers(id) on delete restrict,
  doc_type text not null check (doc_type in (
    'passport','right-to-work','driving-licence-front','driving-licence-back',
    'dvla-evidence','proof-of-address','other'
  )),
  original_name text not null check (length(original_name) between 1 and 140),
  storage_path text not null unique,
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  byte_size integer not null check(byte_size between 1 and 8388608),
  uploaded_at timestamptz not null default now()
);
create index besa_candidate_documents_invite_idx
  on public.besa_candidate_documents(invite_id,uploaded_at desc);
create index besa_candidate_documents_driver_idx
  on public.besa_candidate_documents(driver_id,uploaded_at desc);

alter table public.besa_candidate_invites enable row level security;
alter table public.besa_candidate_documents enable row level security;
revoke all on public.besa_candidate_invites from public,anon,authenticated;
revoke all on public.besa_candidate_documents from public,anon,authenticated;
grant select on public.besa_candidate_invites to authenticated;
grant select on public.besa_candidate_documents to authenticated;

create policy besa_candidate_invites_admin_read
  on public.besa_candidate_invites for select to authenticated
  using((select public.besa_is_admin()));
create policy besa_candidate_documents_admin_read
  on public.besa_candidate_documents for select to authenticated
  using((select public.besa_is_admin()));

-- Protected images, never public paths. No policies granting storage access to
-- anonymous or ordinary authenticated clients: only the private Edge Function
-- can upload and sign short-lived review links via server-side service auth.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'besa-candidate-private','besa-candidate-private',false,
  8388608,array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=false,file_size_limit=8388608,
  allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

commit;
-- Operational checks: expired/revoked tokens denied, no anonymous table access,
-- direct authenticated inserts denied, signed views time-limited, strict upload
-- size/MIME and magic-byte validation, admin/non-admin segregated.
-- Right-to-work verification must be completed by a human reviewer.
