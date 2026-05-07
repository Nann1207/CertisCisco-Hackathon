-- Run this in the Supabase SQL editor.
-- reject_assignment stores the assignment rejection, while assignment-linked
-- ids are copied from incident_assignments by assignment_id.

create table if not exists public.reject_assignment (
  assignment_id uuid primary key references public.incident_assignments(assignment_id) on delete cascade,
  shift_id uuid references public.shifts(shift_id) on delete set null,
  incident_id uuid references public.incidents(incident_id) on delete cascade,
  officer_id uuid references public.employees(id) on delete set null,
  supervisor_id uuid references public.employees(id) on delete set null,
  rejection_reason text,
  rejection_status text not null default 'Unseen',
  created_at timestamptz not null default now()
);

alter table public.reject_assignment
alter column rejection_status drop default;

alter table public.reject_assignment
alter column rejection_status type text
using case
  when rejection_status::text in ('true', 'Unseen') then 'Unseen'
  when rejection_status::text in ('false', 'Acknowledged') then 'Acknowledged'
  else coalesce(rejection_status::text, 'Unseen')
end;

alter table public.reject_assignment
alter column rejection_status set default 'Unseen';

alter table public.reject_assignment
alter column rejection_status set not null;

create or replace function public.populate_reject_assignment_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.incident_assignments%rowtype;
begin
  select *
  into assignment_row
  from public.incident_assignments
  where assignment_id = new.assignment_id;

  if not found then
    raise exception 'incident_assignments row not found for assignment_id %', new.assignment_id;
  end if;

  new.shift_id := assignment_row.shift_id;
  new.incident_id := assignment_row.incident_id;
  new.officer_id := assignment_row.officer_id;
  new.supervisor_id := assignment_row.supervisor_id;

  return new;
end;
$$;

drop trigger if exists populate_reject_assignment_from_assignment
on public.reject_assignment;

create trigger populate_reject_assignment_from_assignment
before insert
on public.reject_assignment
for each row
execute function public.populate_reject_assignment_from_assignment();

alter table public.reject_assignment enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reject_assignment'
  ) then
    alter publication supabase_realtime add table public.reject_assignment;
  end if;
end;
$$;

drop policy if exists "Assigned officers can insert rejection" on public.reject_assignment;
drop policy if exists "Assigned officers can update own rejection" on public.reject_assignment;
drop policy if exists "Supervisors can acknowledge rejection" on public.reject_assignment;
drop policy if exists "Related users can view rejection" on public.reject_assignment;

create policy "Assigned officers can insert rejection"
on public.reject_assignment
for insert
to authenticated
with check (
  officer_id = auth.uid()
  and exists (
    select 1
    from public.incident_assignments ia
    where ia.assignment_id = reject_assignment.assignment_id
      and ia.officer_id = auth.uid()
  )
);

create policy "Assigned officers can update own rejection"
on public.reject_assignment
for update
to authenticated
using (
  officer_id = auth.uid()
)
with check (
  officer_id = auth.uid()
);

create policy "Supervisors can acknowledge rejection"
on public.reject_assignment
for update
to authenticated
using (
  supervisor_id = auth.uid()
)
with check (
  supervisor_id = auth.uid()
  and rejection_status = 'Acknowledged'
);

create policy "Related users can view rejection"
on public.reject_assignment
for select
to authenticated
using (
  officer_id = auth.uid()
  or supervisor_id = auth.uid()
);

drop policy if exists "Assigned officers can decline assignment" on public.incident_assignments;

create policy "Assigned officers can decline assignment"
on public.incident_assignments
for update
to authenticated
using (
  officer_id = auth.uid()
)
with check (
  active_status = false
  and officer_id = auth.uid()
  and exists (
    select 1
    from public.reject_assignment ra
    where ra.assignment_id = incident_assignments.assignment_id
      and ra.officer_id = auth.uid()
  )
);
