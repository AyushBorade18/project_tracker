-- ProjectTrack: deadlines that lock, a Start button with a log, and progress updates ---------------
-- Run after 004_notifications_weights.sql. Safe to run again.
--
--  * When a deliverable or task is past its deadline, the assigned member can no longer upload,
--    edit or submit it. They see "deadline is over, ask your leader for more time" and can send an
--    extension request. The leader extends the date and the member is notified.
--  * "Start working" records when someone began (started_at) and shows in the activity log.
--  * Progress updates: a member picks one of their assigned deliverables and posts a status
--    (on track / almost done / need help / blocked), a self-estimate, details, and optionally a
--    GitHub link, another link and files. The leader is notified.
--
-- "Today" is calculated in Asia/Kolkata. Change private.today_local() if your group is elsewhere.

-- Helpers -------------------------------------------------------------------------------------
create or replace function private.today_local() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

create or replace function private.deliverable_overdue(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.deliverables d
      join public.subjects s on s.id = d.subject_id
     where d.id = p
       and d.status <> 'approved'
       and coalesce(d.due_date, s.deadline) < private.today_local()
  );
$$;

revoke all on function private.today_local(), private.deliverable_overdue(uuid) from public, anon;
grant execute on function private.today_local(), private.deliverable_overdue(uuid) to authenticated;

-- Start log -------------------------------------------------------------------------------------
alter table public.deliverables add column if not exists started_at timestamptz;
-- people who already began before this upgrade get a start time too
update public.deliverables set started_at = coalesce(started_at, created_at) where started_at is null and status <> 'todo';

-- Progress updates -----------------------------------------------------------------------------
create table if not exists public.progress_updates (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  semester_id    uuid not null references public.semesters(id) on delete cascade,
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  author_id      uuid references public.profiles(id) on delete set null,
  mood           text not null default 'on_track' check (mood in ('on_track','almost_done','need_help','blocked')),
  percent        smallint check (percent between 0 and 100),
  body           text not null check (char_length(trim(body)) between 1 and 4000),
  github_url     text not null default '' check (github_url = '' or github_url ~* '^https?://'),
  link_url       text not null default '' check (link_url = '' or link_url ~* '^https?://'),
  created_at     timestamptz not null default now()
);
create index if not exists progress_updates_deliverable_idx on public.progress_updates (deliverable_id, created_at desc);
create index if not exists progress_updates_group_idx on public.progress_updates (group_id, semester_id);

-- Files can belong to a progress update instead of the final submission.
alter table public.attachments add column if not exists update_id uuid references public.progress_updates(id) on delete cascade;
create index if not exists attachments_update_idx on public.attachments (update_id);

-- Deliverable rules: now also locks members out after the deadline and stamps started_at.
create or replace function private.enforce_deliverable_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_adm boolean;
  mode text;
  has_file boolean;
begin
  new.group_id := old.group_id;
  new.semester_id := old.semester_id;
  is_adm := auth.uid() is null or private.is_leader(old.group_id);

  if not is_adm then
    if old.assignee_id is distinct from auth.uid() then
      raise exception 'Only the assigned member can update this deliverable.';
    end if;
    if old.status = 'approved' then
      raise exception 'Approved work is locked. Ask the group leader to revert the approval first.';
    end if;
    if private.deliverable_overdue(old.id) then
      raise exception 'The deadline is over. Ask your group leader for more time.';
    end if;
    if new.status not in ('todo','in_progress','pending') then
      raise exception 'Only the group leader can confirm work.';
    end if;
    new.subject_id  := old.subject_id;
    new.type        := old.type;
    new.title       := old.title;
    new.weight      := old.weight;
    new.assignee_id := old.assignee_id;
    new.due_date    := old.due_date;
    new.feedback    := old.feedback;
    new.sort_order  := old.sort_order;
    new.started_at  := old.started_at;
  end if;

  -- Review workflow: nothing is confirmed unless it was submitted first.
  if new.status = 'approved' and old.status not in ('approved','pending') then
    raise exception 'Work must be submitted for review before it can be confirmed.';
  end if;

  if new.status = 'pending' and old.status <> 'pending' then
    mode := private.submission_mode(new.type);
    select exists (select 1 from public.attachments where deliverable_id = new.id and update_id is null) into has_file;
    if mode = 'link' and new.live_url = '' and new.repo_url = '' then
      raise exception 'Add the deployed link or the GitHub repository before submitting.';
    elsif mode = 'file' and not has_file then
      raise exception 'Upload the file before submitting.';
    elsif mode = 'any' and not has_file and new.proof_url = '' and new.live_url = '' and new.repo_url = '' then
      raise exception 'Add a link or upload a file before submitting.';
    end if;
    new.submitted_at := now();
    new.feedback := '';
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_at := now();
    new.feedback := '';
  end if;
  if new.status <> 'approved' then
    new.approved_at := null;
  end if;
  if new.status = 'todo' and (new.work_made <> '' or new.proof_url <> '' or new.live_url <> '' or new.repo_url <> '') then
    new.status := 'in_progress';
  end if;
  if new.status <> 'todo' and new.started_at is null then
    new.started_at := coalesce(old.started_at, now());
  end if;

  new.updated_at := now();
  return new;
end $$;

-- Activity log: adds "started working".
create or replace function private.log_deliverable_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'created', 'added "' || new.title || '"');
    return new;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.subjects where id = old.subject_id) then
      insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
      values (old.group_id, old.semester_id, actor, old.subject_id, null, 'deleted', 'removed "' || old.title || '"');
    end if;
    return old;
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'approved', 'confirmed "' || new.title || '"');
  elsif old.status = 'approved' and new.status <> 'approved' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'revoked', 'reverted the approval of "' || new.title || '"');
  elsif new.status = 'pending' and old.status <> 'pending' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'submitted', 'submitted "' || new.title || '" for review');
  elsif old.status = 'pending' and new.status = 'in_progress' and new.feedback <> old.feedback then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'rejected', 'asked for changes on "' || new.title || '"');
  elsif old.status = 'todo' and new.status = 'in_progress' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'started', 'started working on "' || new.title || '"');
  elsif new.assignee_id is distinct from old.assignee_id then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'assigned', 'reassigned "' || new.title || '"');
  elsif new.due_date is distinct from old.due_date then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'deadline', 'changed the deadline of "' || new.title || '"');
  elsif new.work_made is distinct from old.work_made or new.proof_url is distinct from old.proof_url
     or new.live_url is distinct from old.live_url or new.repo_url is distinct from old.repo_url then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'progress', 'saved progress on "' || new.title || '"');
  end if;
  return new;
end $$;

-- Tasks: members are locked out after the deadline too.
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
    if old.due_date is not null and old.due_date < private.today_local() then
      raise exception 'The deadline is over. Ask your group leader for more time.';
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

-- Attachments: group/semester come from the deliverable; members cannot add or remove files after the deadline.
create or replace function private.attachment_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select group_id, semester_id into new.group_id, new.semester_id from public.deliverables where id = new.deliverable_id;
  if new.group_id is null then raise exception 'Unknown deliverable.'; end if;
  if auth.uid() is not null and not private.is_leader(new.group_id) and private.deliverable_overdue(new.deliverable_id) then
    raise exception 'The deadline is over. Ask your group leader for more time.';
  end if;
  return new;
end $$;

create or replace function private.attachment_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not private.is_leader(old.group_id) and private.deliverable_overdue(old.deliverable_id) then
    raise exception 'The deadline is over. Ask your group leader for more time.';
  end if;
  return old;
end $$;
drop trigger if exists attachment_before_delete on public.attachments;
create trigger attachment_before_delete before delete on public.attachments
  for each row execute function private.attachment_before_delete();

-- Storage uploads obey the same lock.
drop policy if exists deliverable_files_insert on storage.objects;
create policy deliverable_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deliverables' and exists (
      select 1 from public.deliverables d
       where d.id::text = (storage.foldername(name))[1]
         and (select private.is_member(d.group_id))
         and (select private.semester_is_open(d.semester_id))
         and ((select private.is_leader(d.group_id))
              or (d.assignee_id = (select auth.uid()) and d.status in ('todo','in_progress') and not private.deliverable_overdue(d.id)))
    )
  );

-- Progress updates: rules, log, notifications ---------------------------------------------------
create or replace function private.progress_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select group_id, semester_id, assignee_id, status into d from public.deliverables where id = new.deliverable_id;
  if d.group_id is null then raise exception 'Unknown deliverable.'; end if;
  new.group_id := d.group_id;
  new.semester_id := d.semester_id;
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  if auth.uid() is not null and not private.is_leader(d.group_id) then
    if d.assignee_id is distinct from auth.uid() then
      raise exception 'You can only post updates on work assigned to you.';
    end if;
    if d.status = 'approved' then
      raise exception 'This work is already approved.';
    end if;
    if private.deliverable_overdue(new.deliverable_id) then
      raise exception 'The deadline is over. Ask your group leader for more time.';
    end if;
  end if;
  new.github_url := trim(new.github_url);
  new.link_url := trim(new.link_url);
  return new;
end $$;
drop trigger if exists progress_before_insert on public.progress_updates;
create trigger progress_before_insert before insert on public.progress_updates
  for each row execute function private.progress_before_insert();

create or replace function private.progress_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record; who text; scode text;
begin
  select title, status, subject_id into d from public.deliverables where id = new.deliverable_id;
  select coalesce(full_name, 'Someone') into who from public.profiles where id = new.author_id;
  select code into scode from public.subjects where id = d.subject_id;
  -- posting an update means the work has started
  if d.status = 'todo' then
    update public.deliverables set status = 'in_progress' where id = new.deliverable_id;
  end if;
  insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
  values (new.group_id, new.semester_id, new.author_id, d.subject_id, new.deliverable_id, 'update', 'posted a progress update on "' || d.title || '"');
  perform private.notify_leaders(new.group_id, new.semester_id, 'deliverable_update', 'Progress update',
    coalesce(who, 'Someone') || ' on "' || d.title || '" (' || coalesce(scode, '') || '): ' || left(new.body, 140), new.deliverable_id, null);
  return new;
end $$;
drop trigger if exists progress_after_insert on public.progress_updates;
create trigger progress_after_insert after insert on public.progress_updates
  for each row execute function private.progress_after_insert();

alter table public.progress_updates enable row level security;

drop policy if exists progress_select on public.progress_updates;
create policy progress_select on public.progress_updates for select to authenticated
  using ((select private.is_member(group_id)));

drop policy if exists progress_insert on public.progress_updates;
create policy progress_insert on public.progress_updates for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.is_member((select group_id from public.deliverables where id = deliverable_id)))
    and (select private.semester_is_open((select semester_id from public.deliverables where id = deliverable_id)))
  );

drop policy if exists progress_delete on public.progress_updates;
create policy progress_delete on public.progress_updates for delete to authenticated
  using ((select private.semester_is_open(semester_id))
         and (author_id = (select auth.uid()) or (select private.is_leader(group_id))));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'progress_updates') then
    alter publication supabase_realtime add table public.progress_updates;
  end if;
end $$;

-- Notifications: started, deadline changes; old read ones are tidied away ------------------------
create or replace function private.notify_user(
  p_user uuid, p_group uuid, p_sem uuid, p_kind text, p_title text, p_body text, p_deliverable uuid, p_task uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user is not distinct from auth.uid() then return; end if;
  if not exists (select 1 from public.memberships where group_id = p_group and user_id = p_user and active) then return; end if;
  delete from public.notifications where user_id = p_user and read_at is not null and read_at < now() - interval '30 days';
  insert into public.notifications (group_id, semester_id, user_id, kind, title, body, deliverable_id, task_id)
  values (p_group, p_sem, p_user, p_kind, p_title, p_body, p_deliverable, p_task);
end $$;

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
  elsif old.status = 'todo' and new.status = 'in_progress' then
    perform private.notify_leaders(new.group_id, new.semester_id, 'deliverable_started', 'Work started', who || ' started working on ' || label, new.id, null);
  elsif new.due_date is distinct from old.due_date and new.due_date is not null then
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'deadline_changed', 'Deadline updated', label || ' is now due ' || to_char(new.due_date, 'DD Mon YYYY') || '.', new.id, null);
  end if;
  return new;
end $$;

-- Task deadline changes notify the assignee too.
create or replace function private.notify_task_deadline() returns trigger
language plpgsql security definer set search_path = public as $$
declare scode text;
begin
  if new.due_date is distinct from old.due_date and new.due_date is not null and new.status <> 'done' then
    select code into scode from public.subjects where id = new.subject_id;
    perform private.notify_user(new.assignee_id, new.group_id, new.semester_id, 'deadline_changed', 'Deadline updated',
      '"' || new.title || '" (' || coalesce(scode, '') || ') is now due ' || to_char(new.due_date, 'DD Mon YYYY') || '.', null, new.id);
  end if;
  return new;
end $$;
drop trigger if exists notify_task_deadline on public.tasks;
create trigger notify_task_deadline after update on public.tasks
  for each row execute function private.notify_task_deadline();

-- Ask the leader for more time (members only, for their own work) -------------------------------
create or replace function public.request_more_time(p_deliverable uuid default null, p_task uuid default null, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); who text; g uuid; s uuid; t text; scode text; assignee uuid; subj uuid; due date;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if p_deliverable is not null then
    select d.group_id, d.semester_id, d.title, d.assignee_id, d.subject_id, coalesce(d.due_date, sb.deadline)
      into g, s, t, assignee, subj, due
      from public.deliverables d join public.subjects sb on sb.id = d.subject_id where d.id = p_deliverable;
  elsif p_task is not null then
    select group_id, semester_id, title, assignee_id, subject_id, due_date into g, s, t, assignee, subj, due from public.tasks where id = p_task;
  else
    raise exception 'Choose the deliverable or task you need more time for.';
  end if;
  if g is null then raise exception 'Not found.'; end if;
  if assignee is distinct from uid then raise exception 'You can only ask for more time on your own work.'; end if;
  select code into scode from public.subjects where id = subj;
  select coalesce(full_name, 'Someone') into who from public.profiles where id = uid;
  perform private.notify_leaders(g, s, 'extension_requested', 'More time requested',
    who || ' asks for more time on "' || t || '" (' || coalesce(scode, '') || ')'
      || case when due is not null then ', due ' || to_char(due, 'DD Mon') else '' end
      || case when trim(coalesce(p_note, '')) <> '' then ': ' || left(trim(p_note), 300) else '.' end,
    p_deliverable, p_task);
  insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
  values (g, s, uid, subj, p_deliverable, 'deadline', 'asked for more time on "' || t || '"');
end $$;
revoke all on function public.request_more_time(uuid, uuid, text) from public, anon;
grant execute on function public.request_more_time(uuid, uuid, text) to authenticated;

select 'progress and deadlines ready' as result,
       (select count(*) from public.deliverables where started_at is not null) as started_deliverables;
