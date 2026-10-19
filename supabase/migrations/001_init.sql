-- ProjectTrack schema -------------------------------------------------------
-- Run once on a fresh Supabase project (SQL editor or `supabase db push`).

create schema if not exists private;
grant usage on schema private to authenticated;

-- Tables ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null,
  role        text not null default 'member' check (role in ('admin','member')),
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  topic       text not null default '',
  deadline    date,
  lead_id     uuid references public.profiles(id) on delete set null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.deliverables (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  type         text not null default 'Custom',
  title        text not null,
  weight       int  not null default 0 check (weight between 0 and 100),
  assignee_id  uuid references public.profiles(id) on delete set null,
  status       text not null default 'todo' check (status in ('todo','in_progress','pending','approved')),
  work_made    text not null default '',
  proof_url    text not null default '',
  feedback     text not null default '',
  due_date     date,
  submitted_at timestamptz,
  approved_at  timestamptz,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.deliverables (subject_id);
create index on public.deliverables (assignee_id);

create table public.attachments (
  id             uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  storage_path   text not null,
  file_name      text not null,
  size_bytes     bigint not null default 0,
  mime_type      text not null default 'application/octet-stream',
  uploaded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on public.attachments (deliverable_id);

create table public.activity (
  id             bigint generated always as identity primary key,
  actor_id       uuid references public.profiles(id) on delete set null,
  subject_id     uuid references public.subjects(id) on delete set null,
  deliverable_id uuid references public.deliverables(id) on delete set null,
  action         text not null,
  message        text not null,
  created_at     timestamptz not null default now()
);
create index on public.activity (created_at desc);

-- Helper functions (private schema, not exposed through the API) --------------
create or replace function private.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

revoke all on function private.is_active() from public, anon;
revoke all on function private.is_admin()  from public, anon;
grant execute on function private.is_active() to authenticated;
grant execute on function private.is_admin()  to authenticated;

-- New user -> profile. The very first account becomes the active admin;
-- everyone after that is a member waiting for admin approval.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles where role = 'admin') into first_user;
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    case when first_user then 'admin' else 'member' end,
    first_user
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Profile guard: members cannot change their own role/active flags,
-- and the last admin cannot be demoted or deactivated.
create or replace function private.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    new.role := old.role;
    new.active := old.active;
    new.email := old.email;
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (select 1 from public.profiles where role = 'admin' and active and id <> old.id) then
      raise exception 'There must always be one active admin.';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile before update on public.profiles
  for each row execute function private.guard_profile();

-- Deliverable rules: what a member may change, status timestamps, locking.
create or replace function private.enforce_deliverable_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_adm boolean;
begin
  is_adm := auth.uid() is null or private.is_admin();

  if not is_adm then
    if old.assignee_id is distinct from auth.uid() then
      raise exception 'Only the assigned member can update this deliverable.';
    end if;
    if old.status = 'approved' then
      raise exception 'Approved work is locked. Ask the admin to revoke the approval first.';
    end if;
    if new.status not in ('todo','in_progress','pending') then
      raise exception 'Only the admin can confirm work.';
    end if;
    -- members may only touch the work fields and the status
    new.subject_id  := old.subject_id;
    new.type        := old.type;
    new.title       := old.title;
    new.weight      := old.weight;
    new.assignee_id := old.assignee_id;
    new.due_date    := old.due_date;
    new.feedback    := old.feedback;
    new.sort_order  := old.sort_order;
  end if;

  if new.status = 'pending' and old.status <> 'pending' then
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
  if new.status = 'todo' and (new.work_made <> '' or new.proof_url <> '') then
    new.status := 'in_progress';
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger enforce_deliverable_rules before update on public.deliverables
  for each row execute function private.enforce_deliverable_rules();

-- Automatic activity log.
create or replace function private.log_deliverable_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, new.subject_id, new.id, 'created', 'added "' || new.title || '"');
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, old.subject_id, null, 'deleted', 'removed "' || old.title || '"');
    return old;
  end if;

  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, new.subject_id, new.id, 'approved', 'confirmed "' || new.title || '"');
  elsif old.status = 'approved' and new.status <> 'approved' then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, new.subject_id, new.id, 'revoked', 'revoked the confirmation of "' || new.title || '"');
  elsif new.status = 'pending' and old.status <> 'pending' then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, new.subject_id, new.id, 'submitted', 'submitted "' || new.title || '" for confirmation');
  elsif old.status = 'pending' and new.status = 'in_progress' and new.feedback <> old.feedback then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, new.subject_id, new.id, 'rejected', 'asked for changes on "' || new.title || '"');
  elsif new.assignee_id is distinct from old.assignee_id then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, new.subject_id, new.id, 'assigned', 'reassigned "' || new.title || '"');
  elsif new.work_made is distinct from old.work_made or new.proof_url is distinct from old.proof_url then
    insert into public.activity (actor_id, subject_id, deliverable_id, action, message)
    values (actor, new.subject_id, new.id, 'progress', 'saved progress on "' || new.title || '"');
  end if;
  return new;
end $$;

create trigger log_deliverable_activity
  after insert or update or delete on public.deliverables
  for each row execute function private.log_deliverable_activity();

-- Equal-split weights for a subject (remainder goes to the first deliverable).
-- Runs with the caller's rights, so only admins can actually change rows.
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
revoke all on function public.rebalance_subject_weights(uuid) from public, anon;
grant execute on function public.rebalance_subject_weights(uuid) to authenticated;

-- Row level security ---------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.subjects     enable row level security;
alter table public.deliverables enable row level security;
alter table public.attachments  enable row level security;
alter table public.activity     enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_active()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy subjects_select on public.subjects for select to authenticated
  using ((select private.is_active()));
create policy subjects_admin_write on public.subjects for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy deliverables_select on public.deliverables for select to authenticated
  using ((select private.is_active()));
create policy deliverables_admin_write on public.deliverables for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy deliverables_member_update on public.deliverables for update to authenticated
  using (assignee_id = (select auth.uid()) and (select private.is_active()))
  with check (assignee_id = (select auth.uid()));

create policy attachments_select on public.attachments for select to authenticated
  using ((select private.is_active()));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid()) and (select private.is_active()) and (
      (select private.is_admin())
      or exists (select 1 from public.deliverables d
                  where d.id = deliverable_id and d.assignee_id = (select auth.uid()) and d.status <> 'approved')
    )
  );
create policy attachments_delete on public.attachments for delete to authenticated
  using (
    (select private.is_admin())
    or (uploaded_by = (select auth.uid()) and exists (
          select 1 from public.deliverables d where d.id = deliverable_id and d.status <> 'approved'))
  );

create policy activity_select on public.activity for select to authenticated
  using ((select private.is_active()));

-- Storage: private bucket, files live under <deliverable_id>/<file> ------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('deliverables', 'deliverables', false, 26214400)
on conflict (id) do nothing;

create policy deliverable_files_read on storage.objects for select to authenticated
  using (bucket_id = 'deliverables' and (select private.is_active()));

create policy deliverable_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deliverables' and (select private.is_active()) and (
      (select private.is_admin())
      or exists (select 1 from public.deliverables d
                  where d.id::text = (storage.foldername(name))[1]
                    and d.assignee_id = (select auth.uid()) and d.status <> 'approved')
    )
  );

create policy deliverable_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'deliverables' and (
      (select private.is_admin()) or owner = (select auth.uid())
    )
  );

-- Realtime so everyone sees changes instantly ---------------------------------
alter publication supabase_realtime add table
  public.profiles, public.subjects, public.deliverables, public.attachments, public.activity;

-- Seed the six subjects ------------------------------------------------------
insert into public.subjects (code, name, sort_order) values
  ('EDI',  'Engineering Design & Innovation',     1),
  ('FODS', 'Foundations of Data Science',         2),
  ('DSAM', 'Digital Systems & Microprocessors',   3),
  ('DM',   'Discrete Mathematics',                4),
  ('OOPS', 'Object-Oriented Programming',         5),
  ('DBMS', 'Database Management Systems',         6);
