create table public.backups (
  id uuid primary key default gen_random_uuid(),
  file_path text not null unique,
  categories_count integer not null default 0,
  products_count integer not null default 0,
  users_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.backups enable row level security;
create policy backups_owner_read on public.backups for select to authenticated using (public.is_owner());
create policy backups_owner_write on public.backups for all to authenticated using (public.is_owner()) with check (public.is_owner());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy backup_objects_owner_read on storage.objects for select to authenticated
using (bucket_id = 'backups' and public.is_owner());
create policy backup_objects_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'backups' and public.is_owner());
