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


-- Officers can view assignments tied to their own account.
alter table public.incident_assignments enable row level security;

drop policy if exists "officer_can_read_own_incident_assignments" on public.incident_assignments;
create policy "officer_can_read_own_incident_assignments"
on public.incident_assignments
for select
to authenticated
using (officer_id = auth.uid());

drop policy if exists "officer_can_update_own_incident_assignments" on public.incident_assignments;
create policy "officer_can_update_own_incident_assignments"
on public.incident_assignments
for update
to authenticated
using (officer_id = auth.uid())
with check (officer_id = auth.uid());


-- Officers can read and create only their own reports.
alter table public.reports enable row level security;

drop policy if exists "officer_can_read_own_reports" on public.reports;
create policy "officer_can_read_own_reports"
on public.reports
for select
to authenticated
using (officer_id = auth.uid());

drop policy if exists "officer_can_insert_own_reports" on public.reports;
create policy "officer_can_insert_own_reports"
on public.reports
for insert
to authenticated
with check (officer_id = auth.uid());



