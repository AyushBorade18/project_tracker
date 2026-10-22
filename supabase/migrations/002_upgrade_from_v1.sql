-- ProjectTrack: upgrade an EXISTING database (first version) to groups + semesters ---------
-- Use this instead of 001_init.sql when your project already has data.
--
--  * Every existing row is kept: members, subjects, deliverables, files, activity.
--  * Everything that exists today is placed in ONE group ("My group") and ONE current semester
--    ("Semester 1"). Rename both inside the app afterwards.
--  * Existing members keep their role and approval. The existing leader becomes the group leader.
--  * It runs as a single transaction: if anything fails, nothing changes.
--  * Old "proof" links move to the right place for each deliverable type (see step 4).

begin;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'groups') then
    raise exception 'This database already has groups, so the upgrade was already applied.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'deliverables') then
    raise exception 'No ProjectTrack tables found. Run 001_init.sql on a fresh project instead.';
  end if;
end $$;

-- 1. Remove the old rules (rows are not touched) ---------------------------------------
drop trigger if exists log_deliverable_activity on public.deliverables;
drop trigger if exists enforce_deliverable_rules on public.deliverables;
drop trigger if exists guard_profile on public.profiles;
drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists subjects_select on public.subjects;
drop policy if exists subjects_admin_write on public.subjects;
drop policy if exists deliverables_select on public.deliverables;
drop policy if exists deliverables_admin_write on public.deliverables;
drop policy if exists deliverables_member_update on public.deliverables;
drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_delete on public.attachments;
drop policy if exists activity_select on public.activity;
drop policy if exists deliverable_files_read on storage.objects;
drop policy if exists deliverable_files_insert on storage.objects;
drop policy if exists deliverable_files_delete on storage.objects;

drop function if exists private.guard_profile();
drop function if exists private.is_active();
drop function if exists private.is_admin();

-- 2. New tables --------------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 80),
  join_code   text not null unique,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.memberships (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('admin','member')),
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.memberships (user_id);

create table public.semesters (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 80),
  status      text not null default 'current' check (status in ('current','archived')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create unique index one_current_semester on public.semesters (group_id) where status = 'current';


-- 3. Put everything that exists today into one group and one current semester ------------
create temp table _pt (gid uuid, sid uuid) on commit drop;

do $$
declare gid uuid; sid uuid; leader uuid; new_code text;
begin
  select id into leader from public.profiles where role = 'admin' and active order by created_at limit 1;
  if leader is null then select id into leader from public.profiles order by created_at limit 1; end if;
  if leader is null then return; end if;

  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.groups (name, join_code, created_by) values ('My group', new_code, leader) returning id into gid;
  insert into public.semesters (group_id, name, status, started_at)
    values (gid, 'Semester 1', 'current', coalesce((select min(created_at) from public.deliverables), now()))
    returning id into sid;

  insert into public.memberships (group_id, user_id, role, active, created_at)
    select gid, id, role, active, created_at from public.profiles;
  update public.memberships set role = 'admin', active = true where group_id = gid and user_id = leader;

  insert into _pt values (gid, sid);
end $$;

-- 4. Reshape the existing tables ---------------------------------------------------------
-- subjects
alter table public.subjects
  add column group_id uuid references public.groups(id) on delete cascade,
  add column semester_id uuid references public.semesters(id) on delete cascade;
update public.subjects set group_id = (select gid from _pt), semester_id = (select sid from _pt);
alter table public.subjects alter column group_id set not null, alter column semester_id set not null;
alter table public.subjects drop constraint if exists subjects_code_key;
alter table public.subjects add constraint subjects_semester_code_key unique (semester_id, code);
create index on public.subjects (group_id, semester_id);

-- deliverables (old single "proof" link becomes the right field for each type)
alter table public.deliverables
  add column group_id uuid references public.groups(id) on delete cascade,
  add column semester_id uuid references public.semesters(id) on delete cascade,
  add column live_url text not null default '',
  add column repo_url text not null default '';
update public.deliverables set group_id = (select gid from _pt), semester_id = (select sid from _pt);

update public.deliverables d set
  repo_url = case when lower(trim(d.type)) in ('app','website') and d.proof_url ~* '^https?://\S+$'
                       and d.proof_url ~* '(github|gitlab|bitbucket)\.' then d.proof_url else '' end,
  live_url = case when lower(trim(d.type)) in ('app','website') and d.proof_url ~* '^https?://\S+$'
                       and d.proof_url !~* '(github|gitlab|bitbucket)\.' then d.proof_url else '' end,
  work_made = case
      when d.proof_url = '' then d.work_made
      when d.proof_url ~* '^https?://\S+$' and lower(trim(d.type)) not in ('ppt','report','research paper','logisim project') then d.work_made
      else trim(both from d.work_made || case when d.work_made <> '' then E'\n\n' else '' end || 'Link: ' || d.proof_url)
    end,
  proof_url = case when d.proof_url ~* '^https?://\S+$'
                        and lower(trim(d.type)) not in ('app','website','ppt','report','research paper','logisim project')
                   then d.proof_url else '' end
where d.proof_url <> '';

alter table public.deliverables alter column group_id set not null, alter column semester_id set not null;
alter table public.deliverables
  add constraint deliverables_live_url_check  check (live_url  = '' or live_url  ~* '^https?://'),
  add constraint deliverables_repo_url_check  check (repo_url  = '' or repo_url  ~* '^https?://'),
  add constraint deliverables_proof_url_check check (proof_url = '' or proof_url ~* '^https?://');
create index on public.deliverables (group_id, semester_id);

-- attachments
alter table public.attachments
  add column group_id uuid references public.groups(id) on delete cascade,
  add column semester_id uuid references public.semesters(id) on delete cascade;
update public.attachments a set group_id = d.group_id, semester_id = d.semester_id
  from public.deliverables d where d.id = a.deliverable_id;
alter table public.attachments alter column group_id set not null, alter column semester_id set not null;
create index on public.attachments (group_id, semester_id);

-- activity
alter table public.activity
  add column group_id uuid references public.groups(id) on delete cascade,
  add column semester_id uuid references public.semesters(id) on delete cascade;
update public.activity set group_id = (select gid from _pt), semester_id = (select sid from _pt);
alter table public.activity alter column group_id set not null;
drop index if exists public.activity_created_at_idx;
create index on public.activity (group_id, semester_id, created_at desc);

-- profiles: role and approval now live in memberships, per group
alter table public.profiles drop column role, drop column active;

-- 5. New rules: helper functions, triggers, functions and security policies ---------------
-- Helper functions (private schema, not exposed through the API) --------------
create or replace function private.has_membership(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where group_id = gid and user_id = auth.uid());
$$;

create or replace function private.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where group_id = gid and user_id = auth.uid() and active);
$$;

create or replace function private.is_leader(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where group_id = gid and user_id = auth.uid() and active and role = 'admin');
$$;

create or replace function private.shares_group(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.group_id = a.group_id
    where a.user_id = auth.uid() and a.active and b.user_id = uid
  );
$$;

create or replace function private.semester_is_open(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.semesters where id = sid and status = 'current');
$$;

-- How a deliverable type must be proven:
--   link  = deployed link or GitHub repo (App, Website)
--   file  = an uploaded file (PPT, Report, Research Paper, Logisim Project)
--   any   = link or file (anything custom)
create or replace function private.submission_mode(t text) returns text
language sql immutable set search_path = public as $$
  select case lower(trim(t))
    when 'app' then 'link'
    when 'website' then 'link'
    when 'ppt' then 'file'
    when 'report' then 'file'
    when 'research paper' then 'file'
    when 'logisim project' then 'file'
    else 'any' end;
$$;

revoke all on function private.has_membership(uuid), private.is_member(uuid), private.is_leader(uuid),
  private.shares_group(uuid), private.semester_is_open(uuid), private.submission_mode(text) from public, anon;
grant execute on function private.has_membership(uuid), private.is_member(uuid), private.is_leader(uuid),
  private.shares_group(uuid), private.semester_is_open(uuid), private.submission_mode(text) to authenticated;

-- New auth user -> profile ----------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Memberships guard: only leaders change roles/approval; a group always keeps a leader.
create or replace function private.guard_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.group_id := old.group_id;
  new.user_id  := old.user_id;
  if auth.uid() is not null and not private.is_leader(old.group_id) then
    new.role := old.role;
    new.active := old.active;
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (
      select 1 from public.memberships
      where group_id = old.group_id and role = 'admin' and active and user_id <> old.user_id
    ) then
      raise exception 'A group must always have one active leader.';
    end if;
  end if;
  return new;
end $$;

create trigger guard_membership before update on public.memberships
  for each row execute function private.guard_membership();

-- Groups / semesters: protect fields that only the RPCs may change.
create or replace function private.guard_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('projecttrack.rpc', true), '') <> '1' then
    new.join_code := old.join_code;
  end if;
  new.created_by := old.created_by;
  return new;
end $$;
create trigger guard_group before update on public.groups
  for each row execute function private.guard_group();

create or replace function private.guard_semester() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.group_id := old.group_id;
  if auth.uid() is not null and coalesce(current_setting('projecttrack.rpc', true), '') <> '1' then
    new.status := old.status;
    new.started_at := old.started_at;
    new.ended_at := old.ended_at;
  end if;
  return new;
end $$;
create trigger guard_semester before update on public.semesters
  for each row execute function private.guard_semester();

-- Subjects: group is always derived from the semester, never trusted from the client.
create or replace function private.subject_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select group_id into new.group_id from public.semesters where id = new.semester_id;
    if new.group_id is null then raise exception 'Unknown semester.'; end if;
    new.code := upper(trim(new.code));
  else
    new.group_id := old.group_id;
    new.semester_id := old.semester_id;
    new.code := upper(trim(new.code));
  end if;
  return new;
end $$;
create trigger subject_before_write before insert or update on public.subjects
  for each row execute function private.subject_before_write();

-- Deliverables: derive group/semester from the subject; stamp imports.
create or replace function private.deliverable_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select group_id, semester_id into new.group_id, new.semester_id from public.subjects where id = new.subject_id;
  if new.group_id is null then raise exception 'Unknown subject.'; end if;
  if new.status in ('pending','approved') then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end $$;
create trigger deliverable_before_insert before insert on public.deliverables
  for each row execute function private.deliverable_before_insert();

-- Deliverable rules: who can change what, the review workflow, status stamps.
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
      raise exception 'Approved work is locked. Ask the group leader to revoke the approval first.';
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
  end if;

  -- Review workflow: nothing is confirmed unless it was submitted first.
  if new.status = 'approved' and old.status not in ('approved','pending') then
    raise exception 'Work must be submitted for review before it can be confirmed.';
  end if;

  if new.status = 'pending' and old.status <> 'pending' then
    mode := private.submission_mode(new.type);
    select exists (select 1 from public.attachments where deliverable_id = new.id) into has_file;
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

  new.updated_at := now();
  return new;
end $$;

create trigger enforce_deliverable_rules before update on public.deliverables
  for each row execute function private.enforce_deliverable_rules();

-- Attachments inherit group/semester from their deliverable.
create or replace function private.attachment_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select group_id, semester_id into new.group_id, new.semester_id from public.deliverables where id = new.deliverable_id;
  if new.group_id is null then raise exception 'Unknown deliverable.'; end if;
  return new;
end $$;
create trigger attachment_before_insert before insert on public.attachments
  for each row execute function private.attachment_before_insert();

-- Automatic activity log -------------------------------------------------------
create or replace function private.log_deliverable_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'created', 'added "' || new.title || '"');
    return new;
  elsif tg_op = 'DELETE' then
    -- skip when the whole subject is being deleted (cascade): there is nothing left to point at
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
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'revoked', 'revoked the confirmation of "' || new.title || '"');
  elsif new.status = 'pending' and old.status <> 'pending' then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'submitted', 'submitted "' || new.title || '" for review');
  elsif old.status = 'pending' and new.status = 'in_progress' and new.feedback <> old.feedback then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'rejected', 'asked for changes on "' || new.title || '"');
  elsif new.assignee_id is distinct from old.assignee_id then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'assigned', 'reassigned "' || new.title || '"');
  elsif new.work_made is distinct from old.work_made or new.proof_url is distinct from old.proof_url
     or new.live_url is distinct from old.live_url or new.repo_url is distinct from old.repo_url then
    insert into public.activity (group_id, semester_id, actor_id, subject_id, deliverable_id, action, message)
    values (new.group_id, new.semester_id, actor, new.subject_id, new.id, 'progress', 'saved progress on "' || new.title || '"');
  end if;
  return new;
end $$;

create trigger log_deliverable_activity
  after insert or update or delete on public.deliverables
  for each row execute function private.log_deliverable_activity();

-- Public functions (called from the app) -----------------------------------------
-- Equal-split weights for a subject. Runs with the caller's rights, so only leaders can change rows.
create or replace function public.rebalance_subject_weights(p_subject uuid) returns void
language plpgsql set search_path = public as $$
declare n int; base int; rem int;
begin
  select count(*) into n from public.deliverables where subject_id = p_subject;
  if n = 0 then return; end if;
  base := 100 / n;
  rem  := 100 - base * n;
  update public.deliverables d
     set weight = base + case when r.rn = 1 then rem else 0 end
    from (select id, row_number() over (order by sort_order, created_at) as rn
            from public.deliverables where subject_id = p_subject) r
   where d.id = r.id;
end $$;

-- Create a group; the caller becomes its first (active) leader. p_subjects = [{"code":"DM","name":"Discrete Mathematics"}, ...]
create or replace function public.create_group(p_name text, p_semester text, p_subjects jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  sid uuid;
  new_code text;
  s jsonb;
  i int := 0;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.groups where created_by = uid) >= 5 then
    raise exception 'You can create up to 5 groups.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Give the group a name.'; end if;

  loop
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.groups where join_code = new_code);
  end loop;

  insert into public.groups (name, join_code, created_by) values (trim(p_name), new_code, uid) returning id into gid;
  insert into public.memberships (group_id, user_id, role, active) values (gid, uid, 'admin', true);
  insert into public.semesters (group_id, name, status)
    values (gid, coalesce(nullif(trim(p_semester), ''), 'Semester 1'), 'current') returning id into sid;

  for s in select * from jsonb_array_elements(coalesce(p_subjects, '[]'::jsonb)) loop
    exit when i >= 20;
    if nullif(trim(s->>'code'), '') is not null and nullif(trim(s->>'name'), '') is not null then
      i := i + 1;
      insert into public.subjects (semester_id, code, name, sort_order)
      values (sid, s->>'code', trim(s->>'name'), i)
      on conflict (semester_id, code) do nothing;
    end if;
  end loop;
  return gid;
end $$;

-- Ask to join a group by its code; a leader must approve before data is visible.
create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); gid uuid;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select id into gid from public.groups where join_code = upper(trim(p_code));
  if gid is null then raise exception 'No group found with that code. Check it with your group leader.'; end if;
  insert into public.memberships (group_id, user_id, role, active)
  values (gid, uid, 'member', false)
  on conflict (group_id, user_id) do nothing;
  return gid;
end $$;

-- Archive the current semester and start a new one (optionally copying the subject list, not the work).
create or replace function public.start_new_semester(p_group uuid, p_name text, p_copy_subjects boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare old_id uuid; new_id uuid;
begin
  if not private.is_leader(p_group) then raise exception 'Only a group leader can start a new semester.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Give the new semester a name.'; end if;
  perform set_config('projecttrack.rpc', '1', true);
  select id into old_id from public.semesters where group_id = p_group and status = 'current';
  if old_id is not null then
    update public.semesters set status = 'archived', ended_at = now() where id = old_id;
  end if;
  insert into public.semesters (group_id, name, status) values (p_group, trim(p_name), 'current') returning id into new_id;
  if p_copy_subjects and old_id is not null then
    insert into public.subjects (semester_id, code, name, topic, lead_id, sort_order)
    select new_id, code, name, '', lead_id, sort_order from public.subjects where semester_id = old_id;
  end if;
  return new_id;
end $$;

create or replace function public.rotate_join_code(p_group uuid) returns text
language plpgsql security definer set search_path = public as $$
declare new_code text;
begin
  if not private.is_leader(p_group) then raise exception 'Only a group leader can change the join code.'; end if;
  loop
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.groups where join_code = new_code);
  end loop;
  perform set_config('projecttrack.rpc', '1', true);  -- lets the guard trigger accept this one change
  update public.groups set join_code = new_code where id = p_group;
  return new_code;
end $$;

revoke all on function public.rebalance_subject_weights(uuid), public.create_group(text, text, jsonb),
  public.join_group(text), public.start_new_semester(uuid, text, boolean), public.rotate_join_code(uuid)
  from public, anon;
grant execute on function public.rebalance_subject_weights(uuid), public.create_group(text, text, jsonb),
  public.join_group(text), public.start_new_semester(uuid, text, boolean), public.rotate_join_code(uuid)
  to authenticated;

-- Row level security ---------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.groups       enable row level security;
alter table public.memberships  enable row level security;
alter table public.semesters    enable row level security;
alter table public.subjects     enable row level security;
alter table public.deliverables enable row level security;
alter table public.attachments  enable row level security;
alter table public.activity     enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_group(id)));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy groups_select on public.groups for select to authenticated
  using ((select private.has_membership(id)));
create policy groups_update_leader on public.groups for update to authenticated
  using ((select private.is_leader(id))) with check ((select private.is_leader(id)));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_member(group_id)));
create policy memberships_update_leader on public.memberships for update to authenticated
  using ((select private.is_leader(group_id))) with check ((select private.is_leader(group_id)));

create policy semesters_select on public.semesters for select to authenticated
  using ((select private.is_member(group_id)));
create policy semesters_update_leader on public.semesters for update to authenticated
  using ((select private.is_leader(group_id))) with check ((select private.is_leader(group_id)));

create policy subjects_select on public.subjects for select to authenticated
  using ((select private.is_member(group_id)));
create policy subjects_leader_insert on public.subjects for insert to authenticated
  with check ((select private.is_leader((select group_id from public.semesters where id = semester_id)))
              and (select private.semester_is_open(semester_id)));
create policy subjects_leader_update on public.subjects for update to authenticated
  using ((select private.is_leader(group_id)) and (select private.semester_is_open(semester_id)))
  with check ((select private.is_leader(group_id)));
create policy subjects_leader_delete on public.subjects for delete to authenticated
  using ((select private.is_leader(group_id)) and (select private.semester_is_open(semester_id)));

create policy deliverables_select on public.deliverables for select to authenticated
  using ((select private.is_member(group_id)));
create policy deliverables_leader_insert on public.deliverables for insert to authenticated
  with check ((select private.is_leader(group_id)) and (select private.semester_is_open(semester_id)));
create policy deliverables_leader_update on public.deliverables for update to authenticated
  using ((select private.is_leader(group_id)) and (select private.semester_is_open(semester_id)))
  with check ((select private.is_leader(group_id)));
create policy deliverables_leader_delete on public.deliverables for delete to authenticated
  using ((select private.is_leader(group_id)) and (select private.semester_is_open(semester_id)));
create policy deliverables_member_update on public.deliverables for update to authenticated
  using (assignee_id = (select auth.uid()) and (select private.is_member(group_id)) and (select private.semester_is_open(semester_id)))
  with check (assignee_id = (select auth.uid()));

create policy attachments_select on public.attachments for select to authenticated
  using ((select private.is_member(group_id)));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid()) and exists (
      select 1 from public.deliverables d
       where d.id = deliverable_id
         and (select private.is_member(d.group_id))
         and (select private.semester_is_open(d.semester_id))
         and ((select private.is_leader(d.group_id))
              or (d.assignee_id = (select auth.uid()) and d.status in ('todo','in_progress')))
    )
  );
create policy attachments_delete on public.attachments for delete to authenticated
  using (
    (select private.semester_is_open(semester_id)) and (
      (select private.is_leader(group_id))
      or (uploaded_by = (select auth.uid()) and exists (
            select 1 from public.deliverables d where d.id = deliverable_id and d.status in ('todo','in_progress')))
    )
  );

create policy activity_select on public.activity for select to authenticated
  using ((select private.is_member(group_id)));

-- Storage: private bucket, files live under <deliverable_id>/<file> ------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('deliverables', 'deliverables', false, 26214400)
on conflict (id) do nothing;

create policy deliverable_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'deliverables' and exists (
      select 1 from public.deliverables d
       where d.id::text = (storage.foldername(name))[1] and (select private.is_member(d.group_id))
    )
  );

create policy deliverable_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deliverables' and exists (
      select 1 from public.deliverables d
       where d.id::text = (storage.foldername(name))[1]
         and (select private.is_member(d.group_id))
         and (select private.semester_is_open(d.semester_id))
         and ((select private.is_leader(d.group_id))
              or (d.assignee_id = (select auth.uid()) and d.status in ('todo','in_progress')))
    )
  );

create policy deliverable_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'deliverables' and exists (
      select 1 from public.deliverables d
       where d.id::text = (storage.foldername(name))[1]
         and ((select private.is_leader(d.group_id)) or owner = (select auth.uid()))
    )
  );

-- 6. Realtime for the new tables --------------------------------------------------------
alter publication supabase_realtime add table public.groups, public.memberships, public.semesters;

commit;

-- Check: these numbers should match what you had before.
select
  (select count(*) from public.groups)       as groups,
  (select count(*) from public.memberships)  as members,
  (select count(*) from public.subjects)     as subjects,
  (select count(*) from public.deliverables) as deliverables,
  (select count(*) from public.attachments)  as files,
  (select count(*) from public.activity)     as activity;
