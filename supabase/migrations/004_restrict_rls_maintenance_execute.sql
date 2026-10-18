-- Applied to BESA LOGISTICS Supabase on 2026-10-18.
-- Restrict the database-maintenance event-trigger function from API roles.
-- Does NOT drop the function or event trigger, and does not touch records.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
