alter table public.cities add column if not exists version bigint not null default 1 check (version > 0);
alter table public.categories add column if not exists version bigint not null default 1 check (version > 0);
alter table public.products add column if not exists version bigint not null default 1 check (version > 0);
alter table public.description_templates add column if not exists version bigint not null default 1 check (version > 0);

create or replace function public.bump_catalog_entity_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off') <> 'on'
    and new.version = old.version
  then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['cities', 'categories', 'products', 'description_templates'] loop
    execute format('drop trigger if exists %I_bump_version on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_bump_version before update on public.%I for each row execute function public.bump_catalog_entity_version()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function public.bump_catalog_parent_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_id uuid;
begin
  if coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'category_translations' then
    parent_id := coalesce(new.category_id, old.category_id);
    update public.categories set version = version + 1 where id = parent_id;
  elsif tg_table_name in ('product_translations', 'product_prices', 'product_media') then
    parent_id := coalesce(new.product_id, old.product_id);
    update public.products set version = version + 1 where id = parent_id;
  elsif tg_table_name = 'description_template_translations' then
    parent_id := coalesce(new.template_id, old.template_id);
    update public.description_templates set version = version + 1 where id = parent_id;
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'category_translations',
    'product_translations',
    'product_prices',
    'product_media',
    'description_template_translations'
  ] loop
    execute format('drop trigger if exists %I_bump_parent_version on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_bump_parent_version after insert or update or delete on public.%I for each row execute function public.bump_catalog_parent_version()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function public.lock_catalog_order_scope(
  scope_kind text,
  scope_id uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'catalog-order:' || scope_kind || ':' || coalesce(scope_id::text, 'global'),
      0
    )
  );
$$;

create or replace function public.try_lock_catalog_order_scope(
  scope_kind text,
  scope_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'catalog-order:' || scope_kind || ':' || coalesce(scope_id::text, 'global'),
      0
    )
  );
$$;

create or replace function public.lock_catalog_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'cities' then
    perform public.lock_catalog_order_scope('cities', null);
  elsif tg_table_name = 'categories' then
    perform public.lock_catalog_order_scope('categories', new.city_id);
  elsif tg_table_name = 'products' then
    perform public.lock_catalog_order_scope('products', new.category_id);
  end if;
  return new;
end;
$$;

drop trigger if exists cities_order_scope_lock on public.cities;
create trigger cities_order_scope_lock
before insert on public.cities
for each row execute function public.lock_catalog_order_mutation();

drop trigger if exists categories_order_scope_lock on public.categories;
create trigger categories_order_scope_lock
before insert on public.categories
for each row execute function public.lock_catalog_order_mutation();

drop trigger if exists products_order_scope_lock on public.products;
create trigger products_order_scope_lock
before insert on public.products
for each row execute function public.lock_catalog_order_mutation();

create or replace function public.lock_catalog_legacy_scope_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scope_kind text;
  move_scope_kind text;
  old_scope_id uuid;
  new_scope_id uuid;
  first_scope_id uuid;
  second_scope_id uuid;
begin
  if tg_table_name = 'categories' then
    scope_kind := 'categories';
    move_scope_kind := 'category-moves';
    old_scope_id := old.city_id;
    new_scope_id := new.city_id;
  elsif tg_table_name = 'products' then
    scope_kind := 'products';
    move_scope_kind := 'product-moves';
    old_scope_id := old.category_id;
    new_scope_id := new.category_id;
  else
    return new;
  end if;

  if not public.try_lock_catalog_order_scope(move_scope_kind, null) then
    raise exception using errcode = '40001', message = 'ORDER_CONFLICT';
  end if;
  if old_scope_id::text < new_scope_id::text then
    first_scope_id := old_scope_id;
    second_scope_id := new_scope_id;
  else
    first_scope_id := new_scope_id;
    second_scope_id := old_scope_id;
  end if;
  if not public.try_lock_catalog_order_scope(scope_kind, first_scope_id)
    or not public.try_lock_catalog_order_scope(scope_kind, second_scope_id)
  then
    raise exception using errcode = '40001', message = 'ORDER_CONFLICT';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_move_scope_lock on public.categories;
create trigger categories_move_scope_lock
before update of city_id on public.categories
for each row
when (old.city_id is distinct from new.city_id)
execute function public.lock_catalog_legacy_scope_move();

drop trigger if exists products_move_scope_lock on public.products;
create trigger products_move_scope_lock
before update of category_id on public.products
for each row
when (old.category_id is distinct from new.category_id)
execute function public.lock_catalog_legacy_scope_move();

create or replace function public.save_city_v2(
  target_city_id uuid,
  city_name text,
  expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_id uuid;
  previous_version bigint := 0;
  new_version bigint;
  previous_skip text := coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off');
begin
  if target_city_id is null then
    perform public.lock_catalog_order_scope('cities', null);
    if expected_version is not null then
      raise exception using errcode = '22023', message = 'EXPECTED_VERSION_MUST_BE_NULL';
    end if;
  else
    select version into previous_version from public.cities where id = target_city_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'CITY_NOT_FOUND'; end if;
    if expected_version is distinct from previous_version then
      raise exception using errcode = '40001', message = 'EDIT_CONFLICT';
    end if;
  end if;

  perform set_config('app.skip_catalog_version_trigger', 'on', true);
  saved_id := public.save_city(target_city_id, city_name);
  new_version := case when target_city_id is null then 1 else previous_version + 1 end;
  if target_city_id is not null then
    update public.cities set version = new_version where id = saved_id;
  end if;
  update public.audit_events
  set metadata = metadata || jsonb_build_object('previous_version', previous_version, 'new_version', new_version)
  where id = (
    select id from public.audit_events
    where entity_type = 'city' and entity_id = saved_id
    order by created_at desc, id desc limit 1
  );
  perform set_config('app.skip_catalog_version_trigger', previous_skip, true);
  return jsonb_build_object('id', saved_id, 'version', new_version);
end;
$$;

create or replace function public.save_category_v2(
  target_category_id uuid,
  target_city_id uuid,
  category_icon text,
  translation_payload jsonb,
  expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_id uuid;
  previous_city_id uuid;
  locked_city_id uuid;
  previous_version bigint := 0;
  new_version bigint;
  previous_skip text := coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off');
begin
  if target_category_id is null then
    perform public.lock_catalog_order_scope('categories', target_city_id);
    if expected_version is not null then
      raise exception using errcode = '22023', message = 'EXPECTED_VERSION_MUST_BE_NULL';
    end if;
  else
    select city_id into previous_city_id from public.categories where id = target_category_id;
    if not found then raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND'; end if;
    if previous_city_id is distinct from target_city_id then
      perform public.lock_catalog_order_scope('category-moves', null);
      if previous_city_id::text < target_city_id::text then
        perform public.lock_catalog_order_scope('categories', previous_city_id);
        perform public.lock_catalog_order_scope('categories', target_city_id);
      else
        perform public.lock_catalog_order_scope('categories', target_city_id);
        perform public.lock_catalog_order_scope('categories', previous_city_id);
      end if;
    end if;
    select city_id, version into locked_city_id, previous_version
    from public.categories where id = target_category_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND'; end if;
    if locked_city_id is distinct from previous_city_id then
      raise exception using errcode = '40001', message = 'ORDER_CONFLICT';
    end if;
    if expected_version is distinct from previous_version then
      raise exception using errcode = '40001', message = 'EDIT_CONFLICT';
    end if;
  end if;

  perform set_config('app.skip_catalog_version_trigger', 'on', true);
  saved_id := public.save_category(target_category_id, target_city_id, category_icon, translation_payload);
  new_version := case when target_category_id is null then 1 else previous_version + 1 end;
  if target_category_id is not null then
    update public.categories set version = new_version where id = saved_id;
  end if;
  update public.audit_events
  set metadata = metadata || jsonb_build_object('previous_version', previous_version, 'new_version', new_version)
  where id = (
    select id from public.audit_events
    where entity_type = 'category' and entity_id = saved_id
    order by created_at desc, id desc limit 1
  );
  perform set_config('app.skip_catalog_version_trigger', previous_skip, true);
  return jsonb_build_object('id', saved_id, 'version', new_version);
end;
$$;

create or replace function public.save_product_v2(
  target_product_id uuid,
  target_category_id uuid,
  product_payload jsonb,
  translation_payload jsonb,
  price_payload jsonb default '[]'::jsonb,
  media_payload jsonb default '[]'::jsonb,
  expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_id uuid;
  previous_category_id uuid;
  locked_category_id uuid;
  previous_version bigint := 0;
  new_version bigint;
  previous_skip text := coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off');
begin
  if target_product_id is null then
    perform public.lock_catalog_order_scope('products', target_category_id);
    if expected_version is not null then
      raise exception using errcode = '22023', message = 'EXPECTED_VERSION_MUST_BE_NULL';
    end if;
  else
    select category_id into previous_category_id from public.products where id = target_product_id;
    if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
    if previous_category_id is distinct from target_category_id then
      perform public.lock_catalog_order_scope('product-moves', null);
      if previous_category_id::text < target_category_id::text then
        perform public.lock_catalog_order_scope('products', previous_category_id);
        perform public.lock_catalog_order_scope('products', target_category_id);
      else
        perform public.lock_catalog_order_scope('products', target_category_id);
        perform public.lock_catalog_order_scope('products', previous_category_id);
      end if;
    end if;
    select category_id, version into locked_category_id, previous_version
    from public.products where id = target_product_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
    if locked_category_id is distinct from previous_category_id then
      raise exception using errcode = '40001', message = 'ORDER_CONFLICT';
    end if;
    if expected_version is distinct from previous_version then
      raise exception using errcode = '40001', message = 'EDIT_CONFLICT';
    end if;
  end if;

  perform set_config('app.skip_catalog_version_trigger', 'on', true);
  saved_id := public.save_product(
    target_product_id,
    target_category_id,
    product_payload,
    translation_payload,
    price_payload,
    media_payload
  );
  new_version := case when target_product_id is null then 1 else previous_version + 1 end;
  if target_product_id is not null then
    update public.products set version = new_version where id = saved_id;
  end if;
  update public.audit_events
  set metadata = metadata || jsonb_build_object('previous_version', previous_version, 'new_version', new_version)
  where id = (
    select id from public.audit_events
    where entity_type = 'product' and entity_id = saved_id
    order by created_at desc, id desc limit 1
  );
  perform set_config('app.skip_catalog_version_trigger', previous_skip, true);
  return jsonb_build_object('id', saved_id, 'version', new_version);
end;
$$;

create or replace function public.save_description_template_v2(
  target_template_id uuid,
  target_category_id uuid,
  template_name text,
  template_position integer,
  template_active boolean,
  translations_payload jsonb,
  expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_id uuid;
  target_city_id uuid;
  previous_version bigint := 0;
  new_version bigint;
  previous_skip text := coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off');
begin
  if target_template_id is not null then
    select version into previous_version from public.description_templates where id = target_template_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'TEMPLATE_NOT_FOUND'; end if;
    if expected_version is distinct from previous_version then
      raise exception using errcode = '40001', message = 'EDIT_CONFLICT';
    end if;
  elsif expected_version is not null then
    raise exception using errcode = '22023', message = 'EXPECTED_VERSION_MUST_BE_NULL';
  end if;

  perform set_config('app.skip_catalog_version_trigger', 'on', true);
  saved_id := public.save_description_template(
    target_template_id,
    target_category_id,
    template_name,
    template_position,
    template_active,
    translations_payload
  );
  new_version := case when target_template_id is null then 1 else previous_version + 1 end;
  if target_template_id is not null then
    update public.description_templates set version = new_version where id = saved_id;
  end if;
  select city_id into target_city_id from public.categories where id = target_category_id;
  insert into public.audit_events(
    actor_profile_id, action, entity_type, entity_id, city_id, metadata
  ) values (
    public.current_profile_id(),
    case when target_template_id is null then 'create' else 'update' end,
    'description_template',
    saved_id,
    target_city_id,
    jsonb_build_object('previous_version', previous_version, 'new_version', new_version)
  );
  perform set_config('app.skip_catalog_version_trigger', previous_skip, true);
  return jsonb_build_object('id', saved_id, 'version', new_version);
end;
$$;

create or replace function public.reorder_cities_v2(
  requested_order uuid[],
  expected_order uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_order uuid[];
  previous_versions jsonb;
  new_versions jsonb;
  previous_skip text := coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off');
begin
  perform public.lock_catalog_order_scope('cities', null);
  perform 1 from public.cities order by position, id for update;
  select coalesce(array_agg(id order by position, id), '{}'::uuid[]) into current_order from public.cities;
  select coalesce(jsonb_object_agg(id::text, version order by position, id), '{}'::jsonb)
  into previous_versions from public.cities;
  if current_order is distinct from expected_order then
    raise exception using errcode = '40001', message = 'ORDER_CONFLICT';
  end if;
  perform set_config('app.skip_catalog_version_trigger', 'on', true);
  perform public.reorder_cities(requested_order);
  update public.cities set version = version + 1 where id = any(requested_order);
  select coalesce(jsonb_object_agg(id::text, version order by position, id), '{}'::jsonb)
  into new_versions from public.cities;
  update public.audit_events
  set before_data = coalesce(before_data, '{}'::jsonb) || jsonb_build_object('versions', previous_versions),
      after_data = coalesce(after_data, '{}'::jsonb) || jsonb_build_object('versions', new_versions)
  where id = (
    select id from public.audit_events
    where action = 'reorder' and entity_type = 'cities'
    order by created_at desc, id desc limit 1
  );
  perform set_config('app.skip_catalog_version_trigger', previous_skip, true);
end;
$$;

create or replace function public.reorder_categories_v2(
  target_city_id uuid,
  requested_order uuid[],
  expected_order uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_order uuid[];
  previous_versions jsonb;
  new_versions jsonb;
  previous_skip text := coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off');
begin
  perform public.lock_catalog_order_scope('categories', target_city_id);
  perform 1 from public.categories where city_id = target_city_id order by position, id for update;
  select coalesce(array_agg(id order by position, id), '{}'::uuid[]) into current_order
  from public.categories where city_id = target_city_id;
  select coalesce(jsonb_object_agg(id::text, version order by position, id), '{}'::jsonb)
  into previous_versions from public.categories where city_id = target_city_id;
  if current_order is distinct from expected_order then
    raise exception using errcode = '40001', message = 'ORDER_CONFLICT';
  end if;
  perform set_config('app.skip_catalog_version_trigger', 'on', true);
  perform public.reorder_categories(target_city_id, requested_order);
  update public.categories set version = version + 1
  where city_id = target_city_id and id = any(requested_order);
  select coalesce(jsonb_object_agg(id::text, version order by position, id), '{}'::jsonb)
  into new_versions from public.categories where city_id = target_city_id;
  update public.audit_events
  set before_data = coalesce(before_data, '{}'::jsonb) || jsonb_build_object('versions', previous_versions),
      after_data = coalesce(after_data, '{}'::jsonb) || jsonb_build_object('versions', new_versions)
  where id = (
    select id from public.audit_events
    where action = 'reorder' and entity_type = 'categories' and city_id = $1
    order by created_at desc, id desc limit 1
  );
  perform set_config('app.skip_catalog_version_trigger', previous_skip, true);
end;
$$;

create or replace function public.reorder_products_v2(
  target_category_id uuid,
  requested_order uuid[],
  expected_order uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_order uuid[];
  previous_versions jsonb;
  new_versions jsonb;
  previous_skip text := coalesce(current_setting('app.skip_catalog_version_trigger', true), 'off');
begin
  perform public.lock_catalog_order_scope('products', target_category_id);
  perform 1 from public.products where category_id = target_category_id order by position, id for update;
  select coalesce(array_agg(id order by position, id), '{}'::uuid[]) into current_order
  from public.products where category_id = target_category_id;
  select coalesce(jsonb_object_agg(id::text, version order by position, id), '{}'::jsonb)
  into previous_versions from public.products where category_id = target_category_id;
  if current_order is distinct from expected_order then
    raise exception using errcode = '40001', message = 'ORDER_CONFLICT';
  end if;
  perform set_config('app.skip_catalog_version_trigger', 'on', true);
  perform public.reorder_products(target_category_id, requested_order);
  update public.products set version = version + 1
  where category_id = target_category_id and id = any(requested_order);
  select coalesce(jsonb_object_agg(id::text, version order by position, id), '{}'::jsonb)
  into new_versions from public.products where category_id = target_category_id;
  update public.audit_events
  set before_data = coalesce(before_data, '{}'::jsonb) || jsonb_build_object('versions', previous_versions),
      after_data = coalesce(after_data, '{}'::jsonb) || jsonb_build_object('versions', new_versions)
  where id = (
    select id from public.audit_events
    where action = 'reorder'
      and entity_type = 'products'
      and after_data ->> 'category_id' = $1::text
    order by created_at desc, id desc limit 1
  );
  perform set_config('app.skip_catalog_version_trigger', previous_skip, true);
end;
$$;

revoke all on function public.save_city_v2(uuid, text, bigint) from public;
revoke all on function public.lock_catalog_order_scope(text, uuid) from public;
revoke all on function public.try_lock_catalog_order_scope(text, uuid) from public;
revoke all on function public.lock_catalog_order_mutation() from public;
revoke all on function public.lock_catalog_legacy_scope_move() from public;
revoke all on function public.save_category_v2(uuid, uuid, text, jsonb, bigint) from public;
revoke all on function public.save_product_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, bigint) from public;
revoke all on function public.save_description_template_v2(uuid, uuid, text, integer, boolean, jsonb, bigint) from public;
revoke all on function public.reorder_cities_v2(uuid[], uuid[]) from public;
revoke all on function public.reorder_categories_v2(uuid, uuid[], uuid[]) from public;
revoke all on function public.reorder_products_v2(uuid, uuid[], uuid[]) from public;

grant execute on function public.save_city_v2(uuid, text, bigint) to authenticated;
grant execute on function public.save_category_v2(uuid, uuid, text, jsonb, bigint) to authenticated;
grant execute on function public.save_product_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, bigint) to authenticated;
grant execute on function public.save_description_template_v2(uuid, uuid, text, integer, boolean, jsonb, bigint) to authenticated;
grant execute on function public.reorder_cities_v2(uuid[], uuid[]) to authenticated;
grant execute on function public.reorder_categories_v2(uuid, uuid[], uuid[]) to authenticated;
grant execute on function public.reorder_products_v2(uuid, uuid[], uuid[]) to authenticated;
