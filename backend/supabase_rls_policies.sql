-- Run this in Supabase SQL Editor.
-- It enables RLS only on shifts and allows authenticated officers
-- to read only their own shift rows.

alter table public.shifts enable row level security;

-- Officers can read only their own shift rows.
drop policy if exists "officer_can_read_own_shifts" on public.shifts;
create policy "officer_can_read_own_shifts"
on public.shifts
for select
to authenticated
using (officer_id = auth.uid());


