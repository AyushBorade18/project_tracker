-- ProjectTrack: tasks the group leader assigns inside a project (subject) --------------------
-- Run after 001_init.sql (fresh) or 002_upgrade_from_v1.sql (upgrade).
-- Safe to run again: if you already ran an earlier version of this file, running it again
-- upgrades the tasks table in place and keeps every task.
--
-- Tasks work like deliverables:
--   open (assigned)  ->  review (member submits)  ->  done (leader approves)
-- The leader can send a task back with a reason, or revert an approval; either puts it back to
-- "open" with a note so the member sees it as reassigned.

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  semester_id    uuid not null references public.semesters(id) on delete cascade,
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  deliverable_id uuid references public.deliverables(id) on delete set null,
  title          text not null check (char_length(trim(title)) between 1 and 200),
  details        text not null default '',
  assignee_id    uuid references public.profiles(id) on delete set null,
  status         text not null default 'open',
  note           text not null default '',
  feedback       text not null default '',
  due_date       date,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  done_at        timestamptz
);

-- Upgrade an earlier version of this table (adds the review fields, widens the status values).
alter table public.tasks add column if not exists note text not null default '';
alter table public.tasks add column if not exists feedback text not null default '';
alter table public.tasks add column if not exists submitted_at timestamptz;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tasks'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.tasks drop constraint %I', c.conname);
  end loop;
  alter table public.tasks add constraint tasks_status_check check (status in ('open','review','done'));
end $$;

create index if not exists tasks_group_semester_idx on public.tasks (group_id, semester_id);
create index if not exists tasks_subject_idx on public.tasks (subject_id);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

-- Group / semester come from the subject, never from the client.
create or replace function private.task_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select group_id, semester_id into new.group_id, new.semester_id from public.subjects where id = new.subject_id;
  if new.group_id is null then raise exception 'Unknown project.'; end if;
  if new.deliverable_id is not null and not exists (
    select 1 from public.deliverables where id = new.deliverable_id and subject_id = new.subject_id
  ) then
    raise exception 'That deliverable belongs to a different project.';
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if new.status = 'review' then new.submitted_at := coalesce(new.submitted_at, now()); end if;
  if new.status = 'done' then
    new.submitted_at := coalesce(new.submitted_at, now());
    new.done_at := coalesce(new.done_at, now());
  end if;
  return new;
end $$;

drop trigger if exists task_before_insert on public.tasks;
create trigger task_before_insert before insert on public.tasks
  for each row execute function private.task_before_insert();

-- Who can change what, and the review workflow.
create or replace function private.task_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_adm boolean;
begin
  new.group_id := old.group_id;
  new.semester_id := old.semester_id;
  new.subject_id := old.subject_id;
  new.created_by := old.created_by;
  is_adm := auth.uid() is null or private.is_leader(old.group_id);

  if not is_adm then
    if old.assignee_id is distinct from auth.uid() then
      raise exception 'Only the person this task is assigned to can update it.';
    end if;
    if old.status = 'done' then
      raise exception 'This task is approved and locked. Ask the group leader to revert the approval.';
    end if;
    if new.status = 'done' then
      raise exception 'Only the group leader can approve a task.';
    end if;
    new.title := old.title;
    new.details := old.details;
    new.assignee_id := old.assignee_id;
    new.due_date := old.due_date;
    new.deliverable_id := old.deliverable_id;
    new.feedback := old.feedback;
  elsif new.deliverable_id is not null and new.deliverable_id is distinct from old.deliverable_id and not exists (
    select 1 from public.deliverables where id = new.deliverable_id and subject_id = new.subject_id
  ) then
    raise exception 'That deliverable belongs to a different project.';
  end if;

  -- Review workflow: nothing is approved unless it was submitted first.
  if new.status = 'done' and old.status not in ('done','review') then
    raise exception 'The task must be submitted for review before it can be approved.';
  end if;

  if new.status = 'review' and old.status <> 'review' then
    new.submitted_at := now();
    new.feedback := '';
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.done_at := now();
    new.feedback := '';
  end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;

drop trigger if exists task_before_update on public.tasks;
create trigger task_before_update before update on public.tasks
  for each row execute function private.task_before_update();

-- Activity log for tasks.
create or replace function private.log_task_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); msg text;
begin
  if tg_op = 'INSERT' then
    msg := 'added the task "' || new.title || '"';
  else
    if new.status = 'review' and old.status <> 'review' then
      msg := 'submitted the task "' || new.title || '" for review';
    elsif new.status = 'done' and old.status <> 'done' then
      msg := 'approved the task "' || new.title || '"';
    elsif old.status = 'done' and new.status = 'open' then
      msg := 'reverted the approval of the task "' || new.title || '"';
    elsif old.status = 'review' and new.status = 'open' and new.feedback <> '' then
      msg := 'asked for changes on the task "' || new.title || '"';
    elsif old.status = 'review' and new.status = 'open' then
      msg := 'withdrew the task "' || new.title || '"';
    elsif new.assignee_id is distinct from old.assignee_id then
      msg := 'reassigned the task "' || new.title || '"';
    end if;
  end if;
  if msg is not null then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.deliverable_id, 'task', msg);
  end if;
  return new;
end $$;

drop trigger if exists log_task_activity on public.tasks;
create trigger log_task_activity after insert or update on public.tasks
  for each row execute function private.log_task_activity();

-- Row level security ----------------------------------------------------------------------
alter table public.tasks enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using ((select private.is_member(group_id)));

drop policy if exists tasks_leader_insert on public.tasks;
create policy tasks_leader_insert on public.tasks for insert to authenticated
  with check (
    (select private.is_leader((select group_id from public.subjects where id = subject_id)))
    and (select private.semester_is_open((select semester_id from public.subjects where id = subject_id)))
  );

drop policy if exists tasks_leader_update on public.tasks;
create policy tasks_leader_update on public.tasks for update to authenticated
  using ((select private.is_leader(group_id)) and (select private.semester_is_open(semester_id)))
  with check ((select private.is_leader(group_id)));

drop policy if exists tasks_member_update on public.tasks;
create policy tasks_member_update on public.tasks for update to authenticated
  using (assignee_id = (select auth.uid()) and (select private.is_member(group_id)) and (select private.semester_is_open(semester_id)))
  with check (assignee_id = (select auth.uid()));

drop policy if exists tasks_leader_delete on public.tasks;
create policy tasks_leader_delete on public.tasks for delete to authenticated
  using ((select private.is_leader(group_id)) and (select private.semester_is_open(semester_id)));

-- Realtime ------------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

select 'tasks ready' as result, (select count(*) from public.tasks) as existing_tasks;
