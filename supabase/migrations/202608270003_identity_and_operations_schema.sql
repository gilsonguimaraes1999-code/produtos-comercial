create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  username extensions.citext not null,
  username_normalized text generated always as (lower(btrim(username::text))) stored,
  display_name text not null,
  role public.user_role not null default 'commercial',
  status public.profile_status not null default 'pending_activation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (username_normalized)
);

create index profiles_role_status_idx on public.profiles(role, status);
create index profiles_created_at_idx on public.profiles(created_at);

create table public.user_cities (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, city_id)
);

create index user_cities_city_id_idx on public.user_cities(city_id, profile_id);

create table public.user_product_permissions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  create_product boolean not null default false,
  edit_product_category boolean not null default false,
  edit_product_name boolean not null default false,
  edit_product_price boolean not null default false,
  edit_product_description boolean not null default false,
  edit_product_media boolean not null default false,
  mark_product_sold boolean not null default false,
  view_owner_discord_id boolean not null default false,
  clone_product boolean not null default false,
  clone_category boolean not null default false,
  delete_product boolean not null default false,
  move_product boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_access_permissions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  manage_requests_for_assigned_cities boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  consumed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index activation_codes_one_live_per_profile_idx
on public.activation_codes(profile_id)
where consumed_at is null;
create index activation_codes_expiry_idx on public.activation_codes(expires_at) where consumed_at is null;

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  username extensions.citext not null,
  username_normalized text generated always as (lower(btrim(username::text))) stored,
  status public.access_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index access_requests_pending_username_idx
on public.access_requests(username_normalized)
where status = 'pending';
create index access_requests_status_created_idx on public.access_requests(status, created_at);

create table public.access_request_cities (
  access_request_id uuid not null references public.access_requests(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (access_request_id, city_id)
);

create index access_request_cities_city_idx on public.access_request_cities(city_id, access_request_id);

create table public.access_history (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid references public.access_requests(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  action public.access_request_status not null,
  display_name_snapshot text not null,
  username_snapshot text not null,
  role_snapshot public.user_role,
  cities_snapshot jsonb not null default '[]'::jsonb,
  permissions_snapshot jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index access_history_profile_created_idx on public.access_history(profile_id, created_at desc);
create index access_history_action_created_idx on public.access_history(action, created_at desc);

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  city_id uuid references public.cities(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);
create index audit_events_actor_idx on public.audit_events(actor_profile_id, created_at desc);
create index audit_events_city_idx on public.audit_events(city_id, created_at desc);

create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  stage text not null,
  status public.job_status not null default 'pending',
  counts jsonb not null default '{}'::jsonb,
  checksums jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  entity_type text not null,
  entity_id uuid not null,
  source_language public.content_language not null,
  target_language public.content_language not null,
  status public.job_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_language <> target_language)
);

create index translation_jobs_status_created_idx on public.translation_jobs(status, created_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'user_product_permissions', 'user_access_permissions',
    'access_requests', 'site_settings', 'migration_runs', 'translation_jobs'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;
