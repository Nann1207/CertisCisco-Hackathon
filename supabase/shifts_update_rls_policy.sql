-- Run this in the Supabase SQL editor.
-- It lets an authenticated employee update only their own shift rows.
-- For SSO shift clock-in/out, ownership is shifts.officer_id, not shifts.supervisor_id.

alter table public.shifts enable row level security;

drop policy if exists "Authenticated users can update own shifts" on public.shifts;

create policy "Authenticated users can update own shifts"
on public.shifts
for update
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and public.shifts.officer_id = e.id
  )
)
with check (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and public.shifts.officer_id = e.id
  )
);
