-- BESA office rota / scheduling foundation. STAGING ONLY until verified.
-- Requires 001_driver_portal.sql because it defines besa_portal_is_admin().
-- Existing public.besa_drivers and public.besa_vehicles must have UUID primary keys.
-- Does NOT change existing driver/vehicle records or live Google Sheets.
begin;

create table if not exists public.besa_rota_shifts (
  driver_id uuid not null references public.besa_drivers(id) on delete restrict,
  shift_date date not null,
  shift_code text not null check (shift_code in (
    'W', 'RA', 'NL1', 'NL2', 'NL3', 'C1', 'C2', 'EW',
    'R', 'SB', 'NOT R', 'Office', 'OFF'
  )),
  vehicle_id uuid references public.besa_vehicles(id) on delete set null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (driver_id, shift_date)
);
create index if not exists besa_rota_date_idx on public.besa_rota_shifts
  (shift_date, shift_code);
create index if not exists besa_rota_vehicle_date_idx on public.besa_rota_shifts
  (vehicle_id, shift_date) where vehicle_id is not null;

create table if not exists public.besa_rota_targets (
  shift_date date primary key,
  target_c1 integer not null default 0 check (target_c1 between 0 and 999),
  target_c2 integer not null default 0 check (target_c2 between 0 and 999),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
comment on table public.besa_rota_targets is
  'Daily C1 and C2 targets. Total target is target_c1 + target_c2, as in the source Google rota.';


-- Server-controlled audit fields so clients cannot falsify timestamps
-- or the identity of the last person editing a shift/target.
create or replace function public.besa_rota_set_audit()
returns trigger language plpgsql
set search_path = ''
as $
begin
  if TG_OP = 'UPDATE' and TG_TABLE_NAME = 'besa_rota_shifts' then
    new.created_at = old.created_at;
  end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$;
drop trigger if exists besa_rota_shift_audit on public.besa_rota_shifts;
create trigger besa_rota_shift_audit before insert or update on public.besa_rota_shifts
  for each row execute function public.besa_rota_set_audit();
drop trigger if exists besa_rota_target_audit on public.besa_rota_targets;
create trigger besa_rota_target_audit before insert or update on public.besa_rota_targets
  for each row execute function public.besa_rota_set_audit();

alter table public.besa_rota_shifts enable row level security;
alter table public.besa_rota_targets enable row level security;

drop policy if exists "besa_rota_admin_select" on public.besa_rota_shifts;
create policy "besa_rota_admin_select" on public.besa_rota_shifts
for select to authenticated using ((select public.besa_portal_is_admin()));
drop policy if exists "besa_rota_admin_insert" on public.besa_rota_shifts;
create policy "besa_rota_admin_insert" on public.besa_rota_shifts
for insert to authenticated with check ((select public.besa_portal_is_admin()));
drop policy if exists "besa_rota_admin_update" on public.besa_rota_shifts;
create policy "besa_rota_admin_update" on public.besa_rota_shifts
for update to authenticated using ((select public.besa_portal_is_admin()))
with check ((select public.besa_portal_is_admin()));
drop policy if exists "besa_rota_admin_delete" on public.besa_rota_shifts;
create policy "besa_rota_admin_delete" on public.besa_rota_shifts
for delete to authenticated using ((select public.besa_portal_is_admin()));

drop policy if exists "besa_rota_targets_admin_select" on public.besa_rota_targets;
create policy "besa_rota_targets_admin_select" on public.besa_rota_targets
for select to authenticated using ((select public.besa_portal_is_admin()));
drop policy if exists "besa_rota_targets_admin_insert" on public.besa_rota_targets;
create policy "besa_rota_targets_admin_insert" on public.besa_rota_targets
for insert to authenticated with check ((select public.besa_portal_is_admin()));
drop policy if exists "besa_rota_targets_admin_update" on public.besa_rota_targets;
create policy "besa_rota_targets_admin_update" on public.besa_rota_targets
for update to authenticated using ((select public.besa_portal_is_admin()))
with check ((select public.besa_portal_is_admin()));

grant select, insert, update, delete on public.besa_rota_shifts to authenticated;
grant select, insert, update on public.besa_rota_targets to authenticated;
commit;
