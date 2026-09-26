-- =============================================================================
--  AI SYSTEM ARCHITECT  -  Database Schema
--  Target: Supabase (PostgreSQL 15+)
--
--  HOW TO APPLY
--    1. Open  Supabase Dashboard -> SQL Editor -> New query
--    2. Paste this entire file
--    3. Press Run
--
--  This script is IDEMPOTENT: it is safe to run more than once.
--  It drops and recreates all policies, so re-running refreshes RLS rules.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Enumerated types
--    Created through DO blocks so the script stays re-runnable.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'editor', 'viewer');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum ('draft', 'review', 'approved', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'diagram_kind') then
    create type public.diagram_kind as enum (
      'c4_context', 'c4_container', 'c4_component',
      'infrastructure', 'data_flow', 'deployment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'node_kind') then
    create type public.node_kind as enum (
      'person', 'client_web', 'client_mobile', 'client_cli',
      'gateway', 'service', 'worker', 'queue',
      'database', 'cache', 'object_storage', 'search',
      'serverless', 'container', 'vm',
      'cicd', 'external', 'note'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'node_layer') then
    create type public.node_layer as enum (
      'presentation', 'application', 'domain', 'data', 'infrastructure', 'external'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'http_method') then
    create type public.http_method as enum (
      'get', 'post', 'put', 'patch', 'delete', 'head', 'options'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'api_auth_type') then
    create type public.api_auth_type as enum (
      'none', 'bearer', 'basic', 'apikey', 'oauth2', 'mtls'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'adr_status') then
    create type public.adr_status as enum ('proposed', 'accepted', 'rejected', 'superseded');
  end if;

  if not exists (select 1 from pg_type where typname = 'service_category') then
    create type public.service_category as enum (
      'compute', 'database', 'storage', 'cache', 'network',
      'observability', 'cicd', 'auth', 'ai', 'serverless', 'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'review_severity') then
    create type public.review_severity as enum ('critical', 'high', 'medium', 'low', 'info');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Utility: role hierarchy
--    admin > editor > viewer. Used by every "can this user do X" check.
-- -----------------------------------------------------------------------------
create or replace function public.role_rank(r public.app_role)
returns int
language sql
immutable
as $$
  select case r
    when 'admin'  then 3
    when 'editor' then 2
    when 'viewer' then 1
    else 0
  end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------

-- 3.1 profiles ---------------------------------------------------------------
-- One row per auth user, created automatically on first sign-up.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null default '',
  full_name   text,
  avatar_url  text,
  -- Global platform role. Promoted to 'admin' by trigger on email confirmation.
  role        public.app_role not null default 'viewer',
  job_title   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for each authenticated user.';

-- 3.2 projects ---------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null check (char_length(btrim(name)) between 1 and 120),
  slug          text        not null unique,
  description   text        not null default '',
  status        public.project_status not null default 'draft',
  -- C4 system context: { goal, scope, users[], constraints[] }
  context       jsonb       not null default '{}'::jsonb,
  owner_id      uuid        not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create index if not exists projects_owner_id_idx   on public.projects (owner_id);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);

-- 3.3 project_members --------------------------------------------------------
create table if not exists public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles  (id) on delete cascade,
  -- Per-project role. Falls back to the profile role when the row is absent.
  role        public.app_role not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx on public.project_members (user_id);

-- 3.4 diagrams ---------------------------------------------------------------
create table if not exists public.diagrams (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  name             text        not null default 'Untitled diagram',
  kind             public.diagram_kind not null default 'c4_container',
  description      text        not null default '',
  current_version  int         not null default 0,
  created_by       uuid        not null references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists diagrams_project_id_idx on public.diagrams (project_id, updated_at desc);

-- 3.5 diagram_versions -------------------------------------------------------
-- Append-only snapshots. A save always inserts a new version row.
create table if not exists public.diagram_versions (
  id          uuid primary key default gen_random_uuid(),
  diagram_id  uuid not null references public.diagrams (id) on delete cascade,
  version     int  not null,
  nodes       jsonb not null default '[]'::jsonb,
  edges       jsonb not null default '[]'::jsonb,
  viewport    jsonb not null default '{}'::jsonb,
  notes       text not null default '',
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (diagram_id, version)
);

create index if not exists diagram_versions_diagram_id_idx
  on public.diagram_versions (diagram_id, version desc);

-- 3.6 api_specs --------------------------------------------------------------
create table if not exists public.api_specs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text        not null default 'Default API',
  version      text        not null default '1.0.0',
  base_url     text        not null default 'https://api.example.com/v1',
  description  text        not null default '',
  -- Extra OpenAPI server variables, e.g. { "env": { "enum": ["dev","prod"] } }
  servers      jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists api_specs_project_id_idx on public.api_specs (project_id);

-- 3.7 api_endpoints ----------------------------------------------------------
create table if not exists public.api_endpoints (
  id             uuid primary key default gen_random_uuid(),
  api_spec_id    uuid not null references public.api_specs (id) on delete cascade,
  group_name     text        not null default 'default',
  method         public.http_method not null default 'get',
  path           text        not null check (char_length(btrim(path)) > 0),
  operation_id   text        not null default '',
  summary        text        not null default '',
  description    text        not null default '',
  auth_type      public.api_auth_type not null default 'bearer',
  tags           text[]      not null default '{}',
  -- JSON Schema fragments
  params         jsonb       not null default '[]'::jsonb,
  request_body   jsonb,
  responses      jsonb       not null default '{}'::jsonb,
  errors         jsonb       not null default '[]'::jsonb,
  rate_limit     text,
  is_deprecated  boolean     not null default false,
  sort_order     int         not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists api_endpoints_spec_id_idx on public.api_endpoints (api_spec_id, sort_order);

-- 3.8 service_catalog --------------------------------------------------------
-- Reference pricing data for the tech-stack / cost-model module.
create table if not exists public.service_catalog (
  id                uuid primary key default gen_random_uuid(),
  key               text        not null unique,
  name              text        not null,
  vendor            text        not null default '',
  category          public.service_category not null default 'other',
  -- unit: 'month', 'request', 'gb-month', 'hour', 'vCPU-month', 'build-minute'
  unit              text        not null default 'month',
  unit_price_usd    numeric(14,6) not null default 0,
  pricing_note      text        not null default '',
  description       text        not null default '',
  tags              text[]      not null default '{}',
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists service_catalog_category_idx on public.service_catalog (category);

-- 3.9 service_selections -----------------------------------------------------
create table if not exists public.service_selections (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid        not null references public.projects (id) on delete cascade,
  service_id  uuid        not null references public.service_catalog (id) on delete restrict,
  quantity    numeric(14,4) not null default 1 check (quantity >= 0),
  notes       text        not null default '',
  -- Optional overrides, e.g. { "region": "ap-southeast-1", "tier": "db.t3.medium" }
  config      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, service_id)
);

create index if not exists service_selections_project_id_idx on public.service_selections (project_id);

-- 3.10 adrs ------------------------------------------------------------------
create table if not exists public.adrs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  number        int  not null check (number > 0),
  title         text not null check (char_length(btrim(title)) > 0),
  status        public.adr_status not null default 'proposed',
  context       text not null default '',
  decision      text not null default '',
  consequences  text not null default '',
  alternatives  text not null default '',
  tags          text[] not null default '{}',
  created_by    uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, number)
);

create index if not exists adrs_project_id_idx on public.adrs (project_id, number desc);

-- 3.11 ai_reviews ------------------------------------------------------------
create table if not exists public.ai_reviews (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  diagram_id    uuid references public.diagrams (id) on delete set null,
  -- 'llm' when an OpenAI-compatible key was configured, 'rules' for the offline analyser
  engine        text        not null default 'rules',
  model         text        not null default '',
  score         int         not null default 0 check (score between 0 and 100),
  summary       text        not null default '',
  -- [{ severity, title, detail, suggestion, category }]
  findings      jsonb       not null default '[]'::jsonb,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now()
);

create index if not exists ai_reviews_project_id_idx on public.ai_reviews (project_id, created_at desc);

-- 3.12 documents -------------------------------------------------------------
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  title             text        not null default 'Architecture Documentation',
  -- 'architecture' | 'api' | 'adr' | 'cost' | 'custom'
  kind              text        not null default 'architecture',
  content_markdown  text        not null default '',
  created_by        uuid not null references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists documents_project_id_idx on public.documents (project_id, updated_at desc);

-- 3.13 activity_logs ---------------------------------------------------------
create table if not exists public.activity_logs (
  id           bigint generated always as identity primary key,
  project_id   uuid references public.projects (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text not null default '',
  entity_id    text not null default '',
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists activity_logs_project_id_idx on public.activity_logs (project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

-- 4.1 updated_at -------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'projects', 'diagrams', 'api_specs', 'api_endpoints',
    'service_catalog', 'service_selections', 'adrs', 'documents'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end
$$;

-- 4.1a immutable columns -----------------------------------------------------
-- RLS policies cannot compare OLD and NEW, so owner transfer is blocked here.
-- Ownership changes must go through an explicit, audited action.
-- -----------------------------------------------------------------------------
create or replace function public.protect_project_owner()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Project ownership cannot be changed directly. Use the transfer action.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_protect_owner on public.projects;
create trigger projects_protect_owner
  before update on public.projects
  for each row execute function public.protect_project_owner();

-- 4.2 new auth user -> profile row -------------------------------------------
-- Also promotes the very first account on the platform to 'admin'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_name text;
begin
  derived_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1)
  );

  -- Signup yields 'viewer' unless the address is already confirmed at insert
  -- (email confirmation disabled), in which case the first account bootstraps
  -- the platform admin role. When confirmations are enabled, promotion happens
  -- on confirmation via public.promote_first_confirmed_admin(), so an address
  -- that never confirms can never end up holding admin.
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    derived_name,
    case
      when new.email_confirmed_at is not null
       and not exists (select 1 from public.profiles)
        then 'admin'::public.app_role
      else 'viewer'::public.app_role
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  return new;
end;
$$;

-- Platform bootstrap: the first account with a confirmed address becomes admin.
create or replace function public.promote_first_confirmed_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and old.email_confirmed_at is null
     and not exists (select 1 from public.profiles where role = 'admin') then
    update public.profiles
       set role = 'admin'
     where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.promote_first_confirmed_admin();

-- 4.3 project owner becomes admin member ------------------------------------
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'admin')
  on conflict (project_id, user_id) do update set role = 'admin';

  insert into public.activity_logs (project_id, actor_id, action, entity_type, entity_id)
  values (new.id, new.owner_id, 'project.created', 'project', new.id::text);

  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- 4.4 next ADR number --------------------------------------------------------
create or replace function public.next_adr_number(target_project uuid)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(max(number), 0) + 1 from public.adrs where project_id = target_project;
$$;

-- 4.5 activity log helper ----------------------------------------------------
create or replace function public.log_activity(
  target_project uuid,
  action_name    text,
  entity_type    text default '',
  entity_id      text default '',
  meta           jsonb   default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity_logs (project_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_project, auth.uid(), action_name, entity_type, entity_id, meta);
$$;

-- -----------------------------------------------------------------------------
-- 5. Access-control helper functions
--    SECURITY DEFINER so RLS policies can read profiles without recursing.
-- -----------------------------------------------------------------------------

-- Platform role of the current user ('admin' sees everything).
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Effective role inside a project:
--   explicit membership row -> else owner -> else platform admin.
-- A platform role of viewer/editor is NOT inherited into projects: without a
-- membership row the caller has no access at all, otherwise every registered
-- user would see every project.
create or replace function public.project_role(target_project uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pm.role
       from public.project_members pm
      where pm.project_id = target_project
        and pm.user_id = auth.uid()),
    (select 'admin'::public.app_role
       from public.projects p
      where p.id = target_project
        and p.owner_id = auth.uid()),
    (select 'admin'::public.app_role
       from public.profiles pr
      where pr.id = auth.uid()
        and pr.role = 'admin')
  );
$$;

create or replace function public.has_project_access(
  target_project uuid,
  min_role       public.app_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_rank(public.project_role(target_project)) >= public.role_rank(min_role);
$$;

-- Read-only list of projects the caller can see, ordered for the dashboard.
create or replace function public.my_projects()
returns table (
  id          uuid,
  name        text,
  slug        text,
  description text,
  status      public.project_status,
  context     jsonb,
  owner_id    uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  my_role     public.app_role
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.slug, p.description, p.status, p.context, p.owner_id,
         p.created_at, p.updated_at,
         public.project_role(p.id) as my_role
    from public.projects p
   where p.archived_at is null
     and (public.is_platform_admin() or public.project_role(p.id) is not null)
   order by p.updated_at desc;
$$;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.diagrams          enable row level security;
alter table public.diagram_versions  enable row level security;
alter table public.api_specs         enable row level security;
alter table public.api_endpoints     enable row level security;
alter table public.service_catalog   enable row level security;
alter table public.service_selections enable row level security;
alter table public.adrs              enable row level security;
alter table public.ai_reviews        enable row level security;
alter table public.documents         enable row level security;
alter table public.activity_logs     enable row level security;

-- 6.1 profiles ---------------------------------------------------------------
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() or public.is_platform_admin());

-- users must be able to discover teammates they share a project with
drop policy if exists profiles_select_project_peers on public.profiles;
create policy profiles_select_project_peers on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
        from public.project_members mine
        join public.project_members theirs on theirs.project_id = mine.project_id
       where mine.user_id = auth.uid()
         and theirs.user_id = profiles.id
    )
  );

-- 6.2 projects ---------------------------------------------------------------
drop policy if exists projects_select_members on public.projects;
create policy projects_select_members on public.projects
  for select to authenticated
  using (public.project_role(id) is not null or public.is_platform_admin());

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_platform_admin());

drop policy if exists projects_update_editor on public.projects;
create policy projects_update_editor on public.projects
  for update to authenticated
  using (public.has_project_access(id, 'editor'))
  with check (public.has_project_access(id, 'editor'));

-- only an owner or platform admin may delete a project
drop policy if exists projects_delete_owner on public.projects;
create policy projects_delete_owner on public.projects
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_platform_admin());

-- 6.3 project_members --------------------------------------------------------
drop policy if exists project_members_select_members on public.project_members;
create policy project_members_select_members on public.project_members
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists project_members_insert_admin on public.project_members;
create policy project_members_insert_admin on public.project_members
  for insert to authenticated
  with check (
    public.has_project_access(project_id, 'admin')
    or (user_id = auth.uid() and public.has_project_access(project_id, 'admin'))
  );

drop policy if exists project_members_update_admin on public.project_members;
create policy project_members_update_admin on public.project_members
  for update to authenticated
  using (public.has_project_access(project_id, 'admin'))
  with check (public.has_project_access(project_id, 'admin'));

drop policy if exists project_members_delete_admin on public.project_members;
create policy project_members_delete_admin on public.project_members
  for delete to authenticated
  using (
    public.has_project_access(project_id, 'admin')
    and user_id <> auth.uid()
  );

-- 6.4 diagrams ---------------------------------------------------------------
drop policy if exists diagrams_select_members on public.diagrams;
create policy diagrams_select_members on public.diagrams
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists diagrams_insert_editor on public.diagrams;
create policy diagrams_insert_editor on public.diagrams
  for insert to authenticated
  with check (
    public.has_project_access(project_id, 'editor')
    and created_by = auth.uid()
  );

drop policy if exists diagrams_update_editor on public.diagrams;
create policy diagrams_update_editor on public.diagrams
  for update to authenticated
  using (public.has_project_access(project_id, 'editor'))
  with check (public.has_project_access(project_id, 'editor'));

drop policy if exists diagrams_delete_editor on public.diagrams;
create policy diagrams_delete_editor on public.diagrams
  for delete to authenticated
  using (public.has_project_access(project_id, 'editor'));

-- 6.5 diagram_versions -------------------------------------------------------
drop policy if exists diagram_versions_select_members on public.diagram_versions;
create policy diagram_versions_select_members on public.diagram_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.diagrams d
       where d.id = diagram_versions.diagram_id
         and public.project_role(d.project_id) is not null
    )
    or public.is_platform_admin()
  );

drop policy if exists diagram_versions_insert_editor on public.diagram_versions;
create policy diagram_versions_insert_editor on public.diagram_versions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.diagrams d
       where d.id = diagram_versions.diagram_id
         and public.has_project_access(d.project_id, 'editor')
    )
  );

-- versions are immutable: no update / delete policy on purpose.

-- 6.6 api_specs / api_endpoints ---------------------------------------------
drop policy if exists api_specs_select_members on public.api_specs;
create policy api_specs_select_members on public.api_specs
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists api_specs_insert_editor on public.api_specs;
create policy api_specs_insert_editor on public.api_specs
  for insert to authenticated
  with check (public.has_project_access(project_id, 'editor'));

drop policy if exists api_specs_update_editor on public.api_specs;
create policy api_specs_update_editor on public.api_specs
  for update to authenticated
  using (public.has_project_access(project_id, 'editor'))
  with check (public.has_project_access(project_id, 'editor'));

drop policy if exists api_specs_delete_editor on public.api_specs;
create policy api_specs_delete_editor on public.api_specs
  for delete to authenticated
  using (public.has_project_access(project_id, 'admin'));

drop policy if exists api_endpoints_select_members on public.api_endpoints;
create policy api_endpoints_select_members on public.api_endpoints
  for select to authenticated
  using (
    exists (
      select 1 from public.api_specs s
       where s.id = api_endpoints.api_spec_id
         and public.project_role(s.project_id) is not null
    )
    or public.is_platform_admin()
  );

drop policy if exists api_endpoints_insert_editor on public.api_endpoints;
create policy api_endpoints_insert_editor on public.api_endpoints
  for insert to authenticated
  with check (
    exists (
      select 1 from public.api_specs s
       where s.id = api_endpoints.api_spec_id
         and public.has_project_access(s.project_id, 'editor')
    )
  );

drop policy if exists api_endpoints_update_editor on public.api_endpoints;
create policy api_endpoints_update_editor on public.api_endpoints
  for update to authenticated
  using (
    exists (
      select 1 from public.api_specs s
       where s.id = api_endpoints.api_spec_id
         and public.has_project_access(s.project_id, 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.api_specs s
       where s.id = api_endpoints.api_spec_id
         and public.has_project_access(s.project_id, 'editor')
    )
  );

drop policy if exists api_endpoints_delete_editor on public.api_endpoints;
create policy api_endpoints_delete_editor on public.api_endpoints
  for delete to authenticated
  using (
    exists (
      select 1 from public.api_specs s
       where s.id = api_endpoints.api_spec_id
         and public.has_project_access(s.project_id, 'editor')
    )
  );

-- 6.7 service_catalog --------------------------------------------------------
-- Shared reference data: readable by anyone signed in, writable by admins only.
drop policy if exists service_catalog_select_authenticated on public.service_catalog;
create policy service_catalog_select_authenticated on public.service_catalog
  for select to authenticated
  using (true);

drop policy if exists service_catalog_write_admin on public.service_catalog;
create policy service_catalog_write_admin on public.service_catalog
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- 6.8 service_selections -----------------------------------------------------
drop policy if exists service_selections_select_members on public.service_selections;
create policy service_selections_select_members on public.service_selections
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists service_selections_insert_editor on public.service_selections;
create policy service_selections_insert_editor on public.service_selections
  for insert to authenticated
  with check (public.has_project_access(project_id, 'editor'));

drop policy if exists service_selections_update_editor on public.service_selections;
create policy service_selections_update_editor on public.service_selections
  for update to authenticated
  using (public.has_project_access(project_id, 'editor'))
  with check (public.has_project_access(project_id, 'editor'));

drop policy if exists service_selections_delete_editor on public.service_selections;
create policy service_selections_delete_editor on public.service_selections
  for delete to authenticated
  using (public.has_project_access(project_id, 'editor'));

-- 6.9 adrs -------------------------------------------------------------------
drop policy if exists adrs_select_members on public.adrs;
create policy adrs_select_members on public.adrs
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists adrs_insert_editor on public.adrs;
create policy adrs_insert_editor on public.adrs
  for insert to authenticated
  with check (public.has_project_access(project_id, 'editor') and created_by = auth.uid());

drop policy if exists adrs_update_editor on public.adrs;
create policy adrs_update_editor on public.adrs
  for update to authenticated
  using (public.has_project_access(project_id, 'editor'))
  with check (public.has_project_access(project_id, 'editor'));

drop policy if exists adrs_delete_admin on public.adrs;
create policy adrs_delete_admin on public.adrs
  for delete to authenticated
  using (public.has_project_access(project_id, 'admin'));

-- 6.10 ai_reviews ------------------------------------------------------------
drop policy if exists ai_reviews_select_members on public.ai_reviews;
create policy ai_reviews_select_members on public.ai_reviews
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists ai_reviews_insert_editor on public.ai_reviews;
create policy ai_reviews_insert_editor on public.ai_reviews
  for insert to authenticated
  with check (public.has_project_access(project_id, 'editor') and created_by = auth.uid());

drop policy if exists ai_reviews_delete_admin on public.ai_reviews;
create policy ai_reviews_delete_admin on public.ai_reviews
  for delete to authenticated
  using (public.has_project_access(project_id, 'editor'));

-- 6.11 documents -------------------------------------------------------------
drop policy if exists documents_select_members on public.documents;
create policy documents_select_members on public.documents
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists documents_insert_editor on public.documents;
create policy documents_insert_editor on public.documents
  for insert to authenticated
  with check (public.has_project_access(project_id, 'editor') and created_by = auth.uid());

drop policy if exists documents_update_editor on public.documents;
create policy documents_update_editor on public.documents
  for update to authenticated
  using (public.has_project_access(project_id, 'editor'))
  with check (public.has_project_access(project_id, 'editor'));

drop policy if exists documents_delete_editor on public.documents;
create policy documents_delete_editor on public.documents
  for delete to authenticated
  using (public.has_project_access(project_id, 'editor'));

-- 6.12 activity_logs ---------------------------------------------------------
drop policy if exists activity_logs_select_members on public.activity_logs;
create policy activity_logs_select_members on public.activity_logs
  for select to authenticated
  using (public.project_role(project_id) is not null or public.is_platform_admin());

drop policy if exists activity_logs_insert_members on public.activity_logs;
create policy activity_logs_insert_members on public.activity_logs
  for insert to authenticated
  with check (actor_id = auth.uid() and public.project_role(project_id) is not null);

-- -----------------------------------------------------------------------------
-- 7. Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.service_catalog to anon, authenticated;
grant execute on function public.my_projects() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.project_role(uuid) to authenticated;
grant execute on function public.has_project_access(uuid, public.app_role) to authenticated;
grant execute on function public.next_adr_number(uuid) to authenticated;
grant execute on function public.log_activity(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.role_rank(public.app_role) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Seed data - cloud service catalog for the cost model
-- -----------------------------------------------------------------------------
insert into public.service_catalog
  (key, name, vendor, category, unit, unit_price_usd, pricing_note, description, tags)
values
  -- compute
  ('ec2.t3.micro',      'EC2 t3.micro',            'AWS',          'compute',    'hour',        0.0104, '1 vCPU / 1 GiB, on-demand Linux',        'General purpose virtual machine',            '{compute,aws,vm}'),
  ('ec2.t3.medium',     'EC2 t3.medium',           'AWS',          'compute',    'hour',        0.0416, '2 vCPU / 4 GiB, on-demand Linux',        'General purpose virtual machine',            '{compute,aws,vm}'),
  ('ecs.fargate',       'ECS Fargate',             'AWS',          'compute',    'vCPU-month',  73.00,  '0.04048 USD per vCPU-hour',               'Serverless container compute',               '{compute,aws,container}'),
  ('cloud-run',         'Cloud Run',               'Google',       'serverless', 'request',     0.0000004, 'First 2M requests/month included',        'Fully managed container service',           '{compute,google,serverless}'),
  ('vercel.pro',        'Vercel Pro',              'Vercel',       'serverless', 'month',       20.00,  'Per seat',                                'Frontend + serverless functions hosting',   '{compute,vercel,serverless}'),
  ('lambda',            'AWS Lambda',              'AWS',          'serverless', 'request',     0.0000002, '$0.20 per 1M requests',                 'Function-as-a-service runtime',             '{compute,aws,serverless}'),
  -- database
  ('rds.t3.micro',      'RDS PostgreSQL t3.micro', 'AWS',          'database',   'month',       12.28,  '1 vCPU / 1 GiB storage extra',           'Managed relational database',               '{database,aws,sql}'),
  ('rds.t3.medium',     'RDS PostgreSQL t3.medium','AWS',          'database',   'month',       49.14,  '2 vCPU / 4 GiB storage extra',           'Managed relational database',               '{database,aws,sql}'),
  ('supabase.pro',      'Supabase Pro',            'Supabase',     'database',   'month',       25.00,  '$25 base + usage',                       'Postgres, auth, storage, realtime',         '{database,supabase,sql,auth}'),
  ('planetscale',       'PlanetScale',             'PlanetScale',  'database',   'month',       0.00,   'Free Hobby tier available',              'Managed MySQL with Vitess',                 '{database,mysql}'),
  ('neon',              'Neon',                    'Neon',         'database',   'month',       19.00,  'Compute + storage billed separately',    'Serverless Postgres with branching',       '{database,postgres,serverless}'),
  ('dynamodb',          'DynamoDB',                'AWS',          'database',   'request',     0.00000013, 'On-demand write request',              'NoSQL key-value database',                  '{database,aws,nosql}'),
  ('firestore',         'Cloud Firestore',         'Google',       'database',   'request',     0.0000004, 'Document write request',                 'Managed document database',                 '{database,google,nosql}'),
  -- cache / queue
  ('elasticache',       'ElastiCache Redis',      'AWS',          'cache',      'node-hour',   0.146,  'cache.t4g.micro',                        'In-memory data store',                      '{cache,aws,redis}'),
  ('upstash',           'Upstash Redis',           'Upstash',      'cache',      'request',     0.0000002, 'Per request + storage',                  'Serverless Redis over REST',                '{cache,redis,serverless}'),
  ('sqs',               'Amazon SQS',              'AWS',          'network',    'request',     0.0000004, 'First 1M free per month',               'Managed message queue',                    '{queue,aws,messaging}'),
  -- storage
  ('s3.standard',       'S3 Standard',             'AWS',          'storage',    'gb-month',    0.023,   'First 5 TB tier',                        'Object storage',                            '{storage,aws}'),
  ('gcs.standard',      'Cloud Storage',           'Google',       'storage',    'gb-month',    0.020,   'Standard regional',                      'Object storage',                            '{storage,google}'),
  ('cloudflare.r2',     'Cloudflare R2',           'Cloudflare',   'storage',    'gb-month',    0.015,   'No egress fees',                         'S3-compatible object storage',              '{storage,cloudflare}'),
  -- network
  ('cloudflare.pro',    'Cloudflare Pro',          'Cloudflare',   'network',    'month',       20.00,  'Plan fee, usage extra',                  'CDN, WAF and DNS',                          '{network,cdn,cloudflare}'),
  ('cloudflare.dns',    'Cloudflare DNS (free)',   'Cloudflare',   'network',    'month',       0.00,   'Free tier',                              'Authoritative DNS',                         '{network,dns,cloudflare}'),
  ('alb',               'Application Load Balancer','AWS',         'network',    'month',       16.50,  'LCU billed hourly',                      'Layer 7 load balancing',                    '{network,aws,loadbalancer}'),
  ('nat.gateway',       'NAT Gateway',             'AWS',          'network',    'hour',        0.045,   'Plus data processing',                   'Outbound internet for private subnets',     '{network,aws}'),
  ('vpn.gateway',       'Site-to-Site VPN',        'AWS',          'network',    'hour',        0.050,   'Standard endpoint',                      'Encrypted hybrid connectivity',             '{network,aws,hybrid}'),
  -- auth
  ('auth0',             'Auth0',                   'Auth0',        'auth',       'month',       0.00,   'Free up to 25k MAU',                     'Identity provider',                         '{auth,oidc,identity}'),
  ('clerk',             'Clerk',                   'Clerk',        'auth',       'month',       25.00,  '10k MAU included',                       'Authentication and user management',        '{auth,identity}'),
  ('cognito',           'Amazon Cognito',          'AWS',          'auth',       'month',       0.00,   'Free up to 50k MAU',                     'Managed user pools',                        '{auth,aws,identity}'),
  -- observability
  ('datadog',           'Datadog',                 'Datadog',      'observability','month',     0.00,   'From $15/host + usage',                  'Metrics, traces, logs and APM',             '{observability,monitoring,apm}'),
  ('sentry',            'Sentry',                  'Sentry',       'observability','month',     26.00,  'Team plan',                              'Error tracking and performance',            '{observability,errors}'),
  ('grafana.cloud',     'Grafana Cloud',           'Grafana Labs', 'observability','month',     19.00,  'Pro plan, 3k metrics',                   'Metrics, logs, traces and dashboards',      '{observability,metrics}'),
  -- ci/cd
  ('github.actions',    'GitHub Actions',          'GitHub',       'cicd',       'build-minute',0.008,  'Public repos free',                       'CI/CD pipelines',                           '{cicd,github}'),
  ('circleci',          'CircleCI',                'CircleCI',     'cicd',       'month',       30.00,  'Performance plan',                       'CI/CD pipelines',                           '{cicd}'),
  -- ai
  ('openai.api',        'OpenAI API',              'OpenAI',       'ai',         'request',     0.000005, 'GPT-4o mini input token share',        'LLM inference API',                         '{ai,llm,openai}'),
  ('pinecone',          'Pinecone',                'Pinecone',     'ai',         'month',       0.00,   'Free serverless tier',                   'Managed vector database',                   '{ai,vector,rag}')
on conflict (key) do update
  set name             = excluded.name,
      vendor           = excluded.vendor,
      category         = excluded.category,
      unit             = excluded.unit,
      unit_price_usd   = excluded.unit_price_usd,
      pricing_note     = excluded.pricing_note,
      description      = excluded.description,
      tags             = excluded.tags;

commit;

-- =============================================================================
--  Verification queries (run these in the SQL editor after applying)
-- =============================================================================
--  select count(*) as tables from information_schema.tables
--    where table_schema = 'public' and table_type = 'BASE TABLE';
--
--  select count(*) as policies from pg_policies where schemaname = 'public';
--
--  select count(*) as services from public.service_catalog;
-- =============================================================================
