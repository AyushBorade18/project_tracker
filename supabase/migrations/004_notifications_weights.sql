-- ProjectTrack: notifications + weight rebalancing -------------------------------------------
-- Run after 003_tasks.sql. Safe to run again.
--
-- Notifications (shown in the bell inside the app, live):
--   member  <- a task or deliverable is assigned / reassigned to them
--   member  <- their work is approved, sent back with changes, or an approval is reverted
--   leader  <- a member submits a task or deliverable for review
-- Nobody is notified about their own actions.

create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  semester_id    uuid references public.semesters(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null,
  title          text not null,
  body           text not null default '',
  deliverable_id uuid references public.deliverables(id) on delete cascade,
  task_id        uuid references public.tasks(id) on delete cascade,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create or replace function private.notify_user(
  p_user uuid, p_group uuid, p_sem uuid, p_kind text, p_title text, p_body text, p_deliverable uuid, p_task uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user is not distinct from auth.uid() then return; end if;
  if not exists (select 1 from public.memberships where group_id = p_group and user_id = p_user and active) then return; end if;
  insert into public.notifications (group_id, semester_id, user_id, kind, title, body, deliverable_id, task_id)
  values (p_group, p_sem, p_user, p_kind, p_title, p_body, p_deliverable, p_task);
end $$;

create or replace function private.notify_leaders(
  p_group uuid, p_sem uuid, p_kind text, p_title text, p_body text, p_deliverable uuid, p_task uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  for l in select user_id from public.memberships where group_id = p_group and role = 'admin' and active loop
    perform private.notify_user(l, p_group, p_sem, p_kind, p_title, p_body, p_deliverable, p_task);
  end loop;
end $$;

-- Tasks ------------------------------------------------------------------------------------------
create or replace function private.notify_task_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; scode text; label text;
begin
  select coalesce(full_name, 'Someone') into who from public.profiles where id = auth.uid();
  who := coalesce(who, 'Your group leader');
  select code into scode from public.subjects where id = new.subject_id;
  label := '"' || new.title || '" (' || coalesce(scode, '') || ')';

  if tg_op = 'INSERT' then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'task_assigned', 'New task for you', who || ' assigned ' || label, null, new.id);
    return new;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'task_assigned', 'Task assigned to you', who || ' assigned ' || label, null, new.id);
  elsif new.status = 'review' and old.status <> 'review' then
    perform private.notify_leaders(new.group_id, new.semester_id, 'task_submitted', 'Task ready for review', who || ' submitted ' || label, null, new.id);
  elsif new.status = 'done' and old.status <> 'done' then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'task_approved', 'Task approved', who || ' approved ' || label, null, new.id);
  elsif old.status = 'done' and new.status = 'open' then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'task_reverted', 'Task reassigned to you', 'Approval reverted on ' || label || '. Please redo it and submit again.', null, new.id);
  elsif old.status = 'review' and new.status = 'open' and new.feedback <> '' then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'task_changes', 'Changes requested', label || ': ' || new.feedback, null, new.id);
  end if;
  return new;
end $$;

drop trigger if exists notify_task_changes on public.tasks;
create trigger notify_task_changes after insert or update on public.tasks
  for each row execute function private.notify_task_changes();

-- Deliverables (updates only, so bulk imports do not flood anyone) -------------------------------
create or replace function private.notify_deliverable_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; scode text; label text;
begin
  select coalesce(full_name, 'Someone') into who from public.profiles where id = auth.uid();
  who := coalesce(who, 'Your group leader');
  select code into scode from public.subjects where id = new.subject_id;
  label := '"' || new.title || '" (' || coalesce(scode, '') || ')';

  if new.assignee_id is distinct from old.assignee_id then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'deliverable_assigned', 'Deliverable assigned to you', who || ' assigned ' || label, new.id, null);
  elsif new.status = 'pending' and old.status <> 'pending' then
    perform private.notify_leaders(new.group_id, new.semester_id, 'deliverable_submitted', 'Ready for review', who || ' submitted ' || label, new.id, null);
  elsif new.status = 'approved' and old.status <> 'approved' then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'deliverable_approved', 'Approved', who || ' approved ' || label, new.id, null);
  elsif old.status = 'approved' and new.status <> 'approved' then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'deliverable_reverted', 'Reassigned to you', 'Approval reverted on ' || label || '. Please update it and submit again.', new.id, null);
  elsif old.status = 'pending' and new.status = 'in_progress' and new.feedback <> old.feedback then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'deliverable_changes', 'Changes requested', label || ': ' || new.feedback, new.id, null);
  end if;
  return new;
end $$;

drop trigger if exists notify_deliverable_changes on public.deliverables;
create trigger notify_deliverable_changes after update on public.deliverables
  for each row execute function private.notify_deliverable_changes();

-- Security: people only ever see and change their own notifications, and only the read flag ----
create or replace function private.guard_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.group_id := old.group_id; new.semester_id := old.semester_id; new.user_id := old.user_id;
  new.kind := old.kind; new.title := old.title; new.body := old.body;
  new.deliverable_id := old.deliverable_id; new.task_id := old.task_id; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists guard_notification on public.notifications;
create trigger guard_notification before update on public.notifications
  for each row execute function private.guard_notification();

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Weights: set several deliverable weights in one go (used by the rebalance dialog). ------------
-- Runs with the caller's rights, so only the group leader's changes actually apply.
create or replace function public.set_weights(p_changes jsonb) returns void
language plpgsql set search_path = public as $$
declare c jsonb;
begin
  for c in select * from jsonb_array_elements(p_changes) loop
    update public.deliverables
       set weight = greatest(0, least(100, (c->>'weight')::int))
     where id = (c->>'id')::uuid;
  end loop;
end $$;
revoke all on function public.set_weights(jsonb) from public, anon;
grant execute on function public.set_weights(jsonb) to authenticated;

select 'notifications ready' as result, (select count(*) from public.notifications) as existing;
