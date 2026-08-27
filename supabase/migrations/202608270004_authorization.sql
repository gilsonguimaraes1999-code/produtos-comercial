create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from public.profiles
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select role = 'owner' from public.profiles where id = public.current_profile_id()),
    false
  );
$$;

create or replace function public.jwt_viewer_city_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  raw_city_id text;
begin
  raw_city_id := auth.jwt() -> 'app_metadata' ->> 'viewer_city_id';
  if raw_city_id is null or raw_city_id = '' then
    return null;
  end if;
  return raw_city_id::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.can_access_city(target_city_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_owner()
    or public.jwt_viewer_city_id() = target_city_id
    or exists (
      select 1
      from public.user_cities
      where profile_id = public.current_profile_id()
        and city_id = target_city_id
    );
$$;

create or replace function public.has_product_permission(permission_name text, target_city_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_owner() or (
    public.can_access_city(target_city_id)
    and exists (
      select 1
      from public.user_product_permissions permissions
      where permissions.profile_id = public.current_profile_id()
        and case permission_name
          when 'create_product' then permissions.create_product
          when 'edit_product_category' then permissions.edit_product_category
          when 'edit_product_name' then permissions.edit_product_name
          when 'edit_product_price' then permissions.edit_product_price
          when 'edit_product_description' then permissions.edit_product_description
          when 'edit_product_media' then permissions.edit_product_media
          when 'mark_product_sold' then permissions.mark_product_sold
          when 'view_owner_discord_id' then permissions.view_owner_discord_id
          when 'clone_product' then permissions.clone_product
          when 'clone_category' then permissions.clone_category
          when 'delete_product' then permissions.delete_product
          when 'move_product' then permissions.move_product
          else false
        end
    )
  );
$$;

create or replace function public.can_manage_access_requests(target_city_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_owner() or (
    public.can_access_city(target_city_id)
    and exists (
      select 1
      from public.user_access_permissions
      where profile_id = public.current_profile_id()
        and manage_requests_for_assigned_cities
    )
  );
$$;

revoke all on function public.current_profile_id() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.jwt_viewer_city_id() from public;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.jwt_viewer_city_id() to anon, authenticated;
grant execute on function public.can_access_city(uuid) to anon, authenticated;
grant execute on function public.has_product_permission(text, uuid) to authenticated;
grant execute on function public.can_manage_access_requests(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cities', 'categories', 'category_translations', 'products',
    'product_translations', 'product_prices', 'product_media',
    'description_templates', 'description_template_translations',
    'profiles', 'user_cities', 'user_product_permissions',
    'user_access_permissions', 'activation_codes', 'access_requests',
    'access_request_cities', 'access_history', 'site_settings',
    'audit_events', 'migration_runs', 'translation_jobs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy cities_read on public.cities
for select to anon, authenticated
using (public.can_access_city(id));
create policy cities_owner_write on public.cities
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy categories_read on public.categories
for select to anon, authenticated
using (public.can_access_city(city_id));
create policy categories_owner_write on public.categories
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy category_translations_read on public.category_translations
for select to anon, authenticated
using (exists (
  select 1 from public.categories category
  where category.id = category_id and public.can_access_city(category.city_id)
));
create policy category_translations_owner_write on public.category_translations
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy products_read on public.products
for select to anon, authenticated
using (exists (
  select 1 from public.categories category
  where category.id = category_id and public.can_access_city(category.city_id)
));
create policy products_insert on public.products
for insert to authenticated
with check (exists (
  select 1 from public.categories category
  where category.id = category_id
    and (
      public.has_product_permission('create_product', category.city_id)
      or public.has_product_permission('clone_product', category.city_id)
    )
));
create policy products_update on public.products
for update to authenticated
using (exists (
  select 1 from public.categories category
  where category.id = category_id
    and public.can_access_city(category.city_id)
))
with check (exists (
  select 1 from public.categories category
  where category.id = category_id
    and public.can_access_city(category.city_id)
));
create policy products_delete on public.products
for delete to authenticated
using (exists (
  select 1 from public.categories category
  where category.id = category_id
    and public.has_product_permission('delete_product', category.city_id)
));

create policy product_translations_read on public.product_translations
for select to anon, authenticated
using (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id and public.can_access_city(category.city_id)
));
create policy product_translations_write on public.product_translations
for all to authenticated
using (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id
    and (
      public.has_product_permission('edit_product_name', category.city_id)
      or public.has_product_permission('edit_product_description', category.city_id)
    )
))
with check (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id
    and (
      public.has_product_permission('edit_product_name', category.city_id)
      or public.has_product_permission('edit_product_description', category.city_id)
    )
));

create policy product_prices_read on public.product_prices
for select to anon, authenticated
using (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id and public.can_access_city(category.city_id)
));
create policy product_prices_write on public.product_prices
for all to authenticated
using (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id and public.has_product_permission('edit_product_price', category.city_id)
))
with check (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id and public.has_product_permission('edit_product_price', category.city_id)
));

create policy product_media_read on public.product_media
for select to anon, authenticated
using (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id and public.can_access_city(category.city_id)
));
create policy product_media_write on public.product_media
for all to authenticated
using (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id and public.has_product_permission('edit_product_media', category.city_id)
))
with check (exists (
  select 1 from public.products product
  join public.categories category on category.id = product.category_id
  where product.id = product_id and public.has_product_permission('edit_product_media', category.city_id)
));

create policy description_templates_read on public.description_templates
for select to authenticated
using (exists (
  select 1 from public.categories category
  where category.id = category_id and public.can_access_city(category.city_id)
));
create policy description_templates_owner_write on public.description_templates
for all to authenticated
using (public.is_owner()) with check (public.is_owner());
create policy description_template_translations_read on public.description_template_translations
for select to authenticated
using (exists (
  select 1 from public.description_templates template
  join public.categories category on category.id = template.category_id
  where template.id = template_id and public.can_access_city(category.city_id)
));
create policy description_template_translations_owner_write on public.description_template_translations
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy profiles_read on public.profiles
for select to authenticated
using (public.is_owner() or id = public.current_profile_id());
create policy profiles_owner_write on public.profiles
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy user_cities_read on public.user_cities
for select to authenticated
using (public.is_owner() or profile_id = public.current_profile_id());
create policy user_cities_owner_write on public.user_cities
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy user_product_permissions_read on public.user_product_permissions
for select to authenticated
using (public.is_owner() or profile_id = public.current_profile_id());
create policy user_product_permissions_owner_write on public.user_product_permissions
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy user_access_permissions_read on public.user_access_permissions
for select to authenticated
using (public.is_owner() or profile_id = public.current_profile_id());
create policy user_access_permissions_owner_write on public.user_access_permissions
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy access_requests_read on public.access_requests
for select to authenticated
using (
  public.is_owner()
  or exists (
    select 1 from public.access_request_cities requested_city
    where requested_city.access_request_id = id
      and public.can_manage_access_requests(requested_city.city_id)
  )
);
create policy access_requests_update on public.access_requests
for update to authenticated
using (
  public.is_owner()
  or exists (
    select 1 from public.access_request_cities requested_city
    where requested_city.access_request_id = id
      and public.can_manage_access_requests(requested_city.city_id)
  )
);

create policy access_request_cities_read on public.access_request_cities
for select to authenticated
using (public.is_owner() or public.can_manage_access_requests(city_id));

create policy access_history_read on public.access_history
for select to authenticated
using (
  public.is_owner()
  or exists (
    select 1
    from jsonb_array_elements(cities_snapshot) city
    where public.can_manage_access_requests((city ->> 'id')::uuid)
  )
);

create policy site_settings_read on public.site_settings
for select to anon, authenticated
using (true);
create policy site_settings_owner_write on public.site_settings
for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy audit_events_owner_read on public.audit_events
for select to authenticated
using (public.is_owner());
create policy migration_runs_owner_read on public.migration_runs
for select to authenticated
using (public.is_owner());
create policy translation_jobs_owner_read on public.translation_jobs
for select to authenticated
using (public.is_owner());

create policy activation_codes_owner_read on public.activation_codes
for select to authenticated
using (public.is_owner());
