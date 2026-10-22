-- ProjectTrack: tasks the group leader can assign inside a project (subject) -----------------
-- Run once, after 001_init.sql (fresh project) or after 002_upgrade_from_v1.sql (upgrade).
-- Safe to run twice: everything is guarded.
--
-- A task is a small action item: "add login screen", "fix the ER diagram", "write the abstract".
-- The leader creates and assigns them (before the work starts, or later when something needs changing).
-- The assigned person can tick a task done or reopen it. Tasks never change the confirmed percentage;
-- only deliverables do.

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  semester_id    uuid not null references public.semesters(id) on delete cascade,
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  deliverable_id uuid references public.deliverables(id) on delete set null,
  title          text not null check (char_length(trim(title)) between 1 and 200),
  details        text not null default '',
  assignee_id    uuid references public.profiles(id) on delete set null,
  status         text not null default 'open' check (status in ('open','done')),
  due_date       date,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  done_at        timestamptz
);
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
  if new.status = 'done' then new.done_at := coalesce(new.done_at, now()); end if;
  return new;
end $$;

drop trigger if exists task_before_insert on public.tasks;
create trigger task_before_insert before insert on public.tasks
  for each row execute function private.task_before_insert();

-- Leaders can change anything; the assigned member can only tick it done or reopen it.
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
    new.title := old.title;
    new.details := old.details;
    new.assignee_id := old.assignee_id;
    new.due_date := old.due_date;
    new.deliverable_id := old.deliverable_id;
  elsif new.deliverable_id is not null and new.deliverable_id is distinct from old.deliverable_id and not exists (
    select 1 from public.deliverables where id = new.deliverable_id and subject_id = new.subject_id
  ) then
    raise exception 'That deliverable belongs to a different project.';
  end if;
  if new.status = 'done' and old.status <> 'done' then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;

drop trigger if exists task_before_update on public.tasks;
create trigger task_before_update before update on public.tasks
  for each row execute function private.task_before_update();

-- Activity log for tasks.
create or replace function private.log_task_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.deliverable_id, 'task', 'added the task "' || new.title || '"');
  elsif tg_op = 'UPDATE' then
    if new.status = 'done' and old.status <> 'done' then
      insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
      values (new.group_id, new.semester_id, actor, new.subject_id, new.deliverable_id, 'task', 'completed the task "' || new.title || '"');
    elsif new.status = 'open' and old.status = 'done' then
      insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
      values (new.group_id, new.semester_id, actor, new.subject_id, new.deliverable_id, 'task', 'reopened the task "' || new.title || '"');
    elsif new.assignee_id is distinct from old.assignee_id then
      insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
      values (new.group_id, new.semester_id, actor, new.subject_id, new.deliverable_id, 'task', 'reassigned the task "' || new.title || '"');
    end if;
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
