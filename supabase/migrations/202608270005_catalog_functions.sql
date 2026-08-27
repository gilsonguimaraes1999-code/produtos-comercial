create or replace function public.reorder_cities(requested_order uuid[])
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  previous_order jsonb;
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  if requested_order is null
    or cardinality(requested_order) <> (select count(*) from public.cities)
    or cardinality(requested_order) <> (select count(distinct ids.id) from unnest(requested_order) as ids(id))
    or exists (select 1 from unnest(requested_order) as ids(id) where not exists (select 1 from public.cities where id = ids.id))
  then
    raise exception using errcode = '22023', message = 'INVALID_CITY_ORDER';
  end if;

  select jsonb_agg(id order by position) into previous_order from public.cities;
  update public.cities
  set position = position + cardinality(requested_order) + 1000000;
  update public.cities city
  set position = ordered.position - 1
  from unnest(requested_order) with ordinality ordered(id, position)
  where city.id = ordered.id;

  insert into public.audit_events(actor_profile_id, action, entity_type, before_data, after_data)
  values (
    public.current_profile_id(),
    'reorder',
    'cities',
    jsonb_build_object('order', previous_order),
    jsonb_build_object('order', to_jsonb(requested_order))
  );
end;
$$;

create or replace function public.reorder_categories(target_city_id uuid, requested_order uuid[])
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  previous_order jsonb;
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  if requested_order is null
    or cardinality(requested_order) <> (select count(*) from public.categories where city_id = target_city_id)
    or cardinality(requested_order) <> (select count(distinct ids.id) from unnest(requested_order) as ids(id))
    or exists (
      select 1 from unnest(requested_order) as ids(id)
      where not exists (
        select 1 from public.categories where id = ids.id and city_id = target_city_id
      )
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_CATEGORY_ORDER';
  end if;

  select jsonb_agg(id order by position) into previous_order
  from public.categories where city_id = target_city_id;
  update public.categories
  set position = position + cardinality(requested_order) + 1000000
  where city_id = target_city_id;
  update public.categories category
  set position = ordered.position - 1
  from unnest(requested_order) with ordinality ordered(id, position)
  where category.id = ordered.id and category.city_id = target_city_id;

  insert into public.audit_events(actor_profile_id, action, entity_type, city_id, before_data, after_data)
  values (
    public.current_profile_id(),
    'reorder',
    'categories',
    target_city_id,
    jsonb_build_object('order', previous_order),
    jsonb_build_object('order', to_jsonb(requested_order))
  );
end;
$$;

create or replace function public.reorder_products(target_category_id uuid, requested_order uuid[])
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_city_id uuid;
  previous_order jsonb;
begin
  select city_id into target_city_id
  from public.categories
  where id = target_category_id;

  if target_city_id is null then
    raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND';
  end if;

  if not public.has_product_permission('move_product', target_city_id) then
    raise exception using errcode = '42501', message = 'MOVE_PRODUCT_PERMISSION_REQUIRED';
  end if;

  if requested_order is null
    or cardinality(requested_order) <> (select count(*) from public.products where category_id = target_category_id)
    or cardinality(requested_order) <> (select count(distinct ids.id) from unnest(requested_order) as ids(id))
    or exists (
      select 1 from unnest(requested_order) as ids(id)
      where not exists (
        select 1 from public.products where id = ids.id and category_id = target_category_id
      )
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_PRODUCT_ORDER';
  end if;

  select jsonb_agg(id order by position) into previous_order
  from public.products where category_id = target_category_id;
  update public.products
  set position = position + cardinality(requested_order) + 1000000
  where category_id = target_category_id;
  update public.products product
  set position = ordered.position - 1
  from unnest(requested_order) with ordinality ordered(id, position)
  where product.id = ordered.id and product.category_id = target_category_id;

  insert into public.audit_events(actor_profile_id, action, entity_type, city_id, before_data, after_data)
  values (
    public.current_profile_id(),
    'reorder',
    'products',
    target_city_id,
    jsonb_build_object('category_id', target_category_id, 'order', previous_order),
    jsonb_build_object('category_id', target_category_id, 'order', to_jsonb(requested_order))
  );
end;
$$;

revoke all on function public.reorder_cities(uuid[]) from public;
revoke all on function public.reorder_categories(uuid, uuid[]) from public;
revoke all on function public.reorder_products(uuid, uuid[]) from public;
grant execute on function public.reorder_cities(uuid[]) to authenticated;
grant execute on function public.reorder_categories(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_products(uuid, uuid[]) to authenticated;
