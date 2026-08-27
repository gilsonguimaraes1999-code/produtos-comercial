alter type public.currency_code add value if not exists 'GBP';
alter table public.product_media add column if not exists thumbnail_url text;

create or replace function public.save_city(target_city_id uuid, city_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_id uuid;
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  if btrim(city_name) = '' then raise exception using errcode = '22023', message = 'CITY_NAME_REQUIRED'; end if;

  if target_city_id is null then
    insert into public.cities(name, position)
    values (btrim(city_name), coalesce((select max(position) + 1 from public.cities), 0))
    returning id into saved_id;
  else
    update public.cities set name = btrim(city_name) where id = target_city_id returning id into saved_id;
    if saved_id is null then raise exception using errcode = 'P0002', message = 'CITY_NOT_FOUND'; end if;
  end if;

  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, city_id)
  values (public.current_profile_id(), case when target_city_id is null then 'create' else 'update' end, 'city', saved_id, saved_id);
  return saved_id;
end;
$$;

create or replace function public.delete_city(target_city_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  if exists (select 1 from public.categories where city_id = target_city_id) then
    raise exception using errcode = '23503', message = 'CITY_NOT_EMPTY';
  end if;
  delete from public.cities where id = target_city_id;
  if not found then raise exception using errcode = 'P0002', message = 'CITY_NOT_FOUND'; end if;
  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id)
  values (public.current_profile_id(), 'delete', 'city', target_city_id);
end;
$$;

create or replace function public.save_category(
  target_category_id uuid,
  target_city_id uuid,
  category_icon text,
  translation_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_id uuid;
  source_language public.content_language := (translation_payload ->> 'language')::public.content_language;
  category_title text := btrim(translation_payload ->> 'title');
  target_language public.content_language;
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  if not exists (select 1 from public.cities where id = target_city_id) then
    raise exception using errcode = 'P0002', message = 'CITY_NOT_FOUND';
  end if;
  if category_title = '' then raise exception using errcode = '22023', message = 'CATEGORY_TITLE_REQUIRED'; end if;

  if target_category_id is null then
    insert into public.categories(city_id, icon, position)
    values (
      target_city_id,
      nullif(category_icon, ''),
      coalesce((select max(position) + 1 from public.categories where city_id = target_city_id), 0)
    ) returning id into saved_id;
  else
    update public.categories
    set city_id = target_city_id, icon = nullif(category_icon, '')
    where id = target_category_id returning id into saved_id;
    if saved_id is null then raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND'; end if;
  end if;

  insert into public.category_translations(category_id, language, title, is_source)
  values (saved_id, source_language, category_title, target_category_id is null)
  on conflict (category_id, language) do update set title = excluded.title;

  if target_category_id is null and coalesce((translation_payload ->> 'translate_missing')::boolean, false) then
    foreach target_language in array enum_range(null::public.content_language) loop
      if target_language <> source_language then
        insert into public.translation_jobs(idempotency_key, entity_type, entity_id, source_language, target_language)
        values ('category:' || saved_id || ':' || source_language || ':' || target_language, 'category', saved_id, source_language, target_language)
        on conflict (idempotency_key) do nothing;
      end if;
    end loop;
  end if;

  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, city_id)
  values (public.current_profile_id(), case when target_category_id is null then 'create' else 'update' end, 'category', saved_id, target_city_id);
  return saved_id;
end;
$$;

create or replace function public.delete_category(target_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_city_id uuid;
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  select city_id into target_city_id from public.categories where id = target_category_id;
  if target_city_id is null then raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND'; end if;
  delete from public.categories where id = target_category_id;
  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, city_id)
  values (public.current_profile_id(), 'delete', 'category', target_category_id, target_city_id);
end;
$$;

create or replace function public.save_product(
  target_product_id uuid,
  target_category_id uuid,
  product_payload jsonb,
  translation_payload jsonb,
  price_payload jsonb default '[]'::jsonb,
  media_payload jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_id uuid;
  target_city_id uuid;
  previous_category_id uuid;
  previous_city_id uuid;
  source_language public.content_language := (translation_payload ->> 'language')::public.content_language;
  product_name text := btrim(translation_payload ->> 'name');
  item jsonb;
  target_language public.content_language;
begin
  select city_id into target_city_id from public.categories where id = target_category_id;
  if target_city_id is null then raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND'; end if;
  if product_name = '' then raise exception using errcode = '22023', message = 'PRODUCT_NAME_REQUIRED'; end if;

  if target_product_id is null then
    if not public.has_product_permission('create_product', target_city_id) then
      raise exception using errcode = '42501', message = 'CREATE_PRODUCT_PERMISSION_REQUIRED';
    end if;
    insert into public.products(
      category_id, coordinates, storage_weight, sold, buyer_name, buyer_discord_id, sold_at, position
    ) values (
      target_category_id,
      nullif(product_payload ->> 'coordinates', ''),
      nullif(product_payload ->> 'storage_weight', ''),
      coalesce((product_payload ->> 'sold')::boolean, false),
      nullif(product_payload ->> 'buyer_name', ''),
      nullif(product_payload ->> 'buyer_discord_id', ''),
      case when coalesce((product_payload ->> 'sold')::boolean, false) then now() else null end,
      coalesce((select max(position) + 1 from public.products where category_id = target_category_id), 0)
    ) returning id into saved_id;
  else
    select product.category_id, category.city_id
    into previous_category_id, previous_city_id
    from public.products product
    join public.categories category on category.id = product.category_id
    where product.id = target_product_id;
    if previous_category_id is null then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
    if previous_category_id <> target_category_id
      and not public.has_product_permission('edit_product_category', previous_city_id)
    then raise exception using errcode = '42501', message = 'EDIT_PRODUCT_CATEGORY_PERMISSION_REQUIRED'; end if;
    if not public.has_product_permission('edit_product_name', previous_city_id)
      and not public.has_product_permission('edit_product_description', previous_city_id)
      and not public.has_product_permission('edit_product_price', previous_city_id)
      and not public.has_product_permission('edit_product_media', previous_city_id)
      and not public.has_product_permission('mark_product_sold', previous_city_id)
      and previous_category_id = target_category_id
    then raise exception using errcode = '42501', message = 'PRODUCT_PERMISSION_REQUIRED'; end if;

    update public.products set
      category_id = target_category_id,
      coordinates = nullif(product_payload ->> 'coordinates', ''),
      storage_weight = nullif(product_payload ->> 'storage_weight', ''),
      sold = coalesce((product_payload ->> 'sold')::boolean, sold),
      buyer_name = nullif(product_payload ->> 'buyer_name', ''),
      buyer_discord_id = nullif(product_payload ->> 'buyer_discord_id', ''),
      sold_at = case
        when coalesce((product_payload ->> 'sold')::boolean, sold) and sold_at is null then now()
        when not coalesce((product_payload ->> 'sold')::boolean, sold) then null
        else sold_at
      end
    where id = target_product_id returning id into saved_id;
  end if;

  insert into public.product_translations(product_id, language, name, description_html, is_source, translation_status)
  values (
    saved_id,
    source_language,
    product_name,
    coalesce(translation_payload ->> 'description_html', ''),
    target_product_id is null,
    case when target_product_id is null then 'source' else 'reviewed' end
  )
  on conflict (product_id, language) do update
  set name = excluded.name, description_html = excluded.description_html, translation_status = 'reviewed';

  if target_product_id is null or public.has_product_permission('edit_product_price', target_city_id) then
    delete from public.product_prices where product_id = saved_id;
    for item in select value from jsonb_array_elements(coalesce(price_payload, '[]'::jsonb)) loop
      insert into public.product_prices(product_id, currency, amount)
      values (saved_id, (item ->> 'currency')::public.currency_code, (item ->> 'amount')::numeric(14,2));
    end loop;
  end if;

  if target_product_id is null or public.has_product_permission('edit_product_media', target_city_id) then
    delete from public.product_media where product_id = saved_id;
    for item in select value from jsonb_array_elements(coalesce(media_payload, '[]'::jsonb)) loop
      insert into public.product_media(
        id, product_id, media_type, public_url, thumbnail_url, video_provider, position
      ) values (
        coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
        saved_id,
        coalesce(nullif(item ->> 'media_type', ''), 'image')::public.media_type,
        nullif(item ->> 'public_url', ''),
        nullif(item ->> 'thumbnail_url', ''),
        nullif(item ->> 'video_provider', ''),
        (item ->> 'position')::integer
      );
    end loop;
  end if;

  if target_product_id is null and coalesce((translation_payload ->> 'translate_missing')::boolean, false) then
    foreach target_language in array enum_range(null::public.content_language) loop
      if target_language <> source_language then
        insert into public.translation_jobs(idempotency_key, entity_type, entity_id, source_language, target_language)
        values ('product:' || saved_id || ':' || source_language || ':' || target_language, 'product', saved_id, source_language, target_language)
        on conflict (idempotency_key) do nothing;
      end if;
    end loop;
  end if;

  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, city_id)
  values (public.current_profile_id(), case when target_product_id is null then 'create' else 'update' end, 'product', saved_id, target_city_id);
  return saved_id;
end;
$$;

create or replace function public.delete_product(target_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_city_id uuid;
begin
  select category.city_id into target_city_id
  from public.products product join public.categories category on category.id = product.category_id
  where product.id = target_product_id;
  if target_city_id is null then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
  if not public.has_product_permission('delete_product', target_city_id) then
    raise exception using errcode = '42501', message = 'DELETE_PRODUCT_PERMISSION_REQUIRED';
  end if;
  delete from public.products where id = target_product_id;
  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, city_id)
  values (public.current_profile_id(), 'delete', 'product', target_product_id, target_city_id);
end;
$$;

create or replace function public.clone_product(source_product_id uuid, target_category_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare new_product_id uuid := gen_random_uuid(); target_city_id uuid;
begin
  select city_id into target_city_id from public.categories where id = target_category_id;
  if target_city_id is null then raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND'; end if;
  if not public.has_product_permission('clone_product', target_city_id) then
    raise exception using errcode = '42501', message = 'CLONE_PRODUCT_PERMISSION_REQUIRED';
  end if;
  insert into public.products(id, category_id, coordinates, storage_weight, import_key, sold, buyer_name, buyer_discord_id, sold_at, position)
  select new_product_id, target_category_id, coordinates, storage_weight, null, false, null, null, null,
    coalesce((select max(position) + 1 from public.products where category_id = target_category_id), 0)
  from public.products where id = source_product_id;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
  insert into public.product_translations select new_product_id, language, name, description_html, is_source, translation_status, now(), now() from public.product_translations where product_id = source_product_id;
  insert into public.product_prices select new_product_id, currency, amount, now(), now() from public.product_prices where product_id = source_product_id;
  insert into public.product_media(id, product_id, media_type, storage_path, public_url, thumbnail_path, video_provider, position, created_at, updated_at, thumbnail_url)
  select gen_random_uuid(), new_product_id, media_type, storage_path, public_url, thumbnail_path, video_provider, position, now(), now(), thumbnail_url from public.product_media where product_id = source_product_id;
  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, city_id, metadata)
  values (public.current_profile_id(), 'clone', 'product', new_product_id, target_city_id, jsonb_build_object('source_product_id', source_product_id));
  return new_product_id;
end;
$$;

create or replace function public.clone_category(source_category_id uuid, target_city_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_category_id uuid := gen_random_uuid();
  source_product record;
  new_product_id uuid;
begin
  if not public.has_product_permission('clone_category', target_city_id) then
    raise exception using errcode = '42501', message = 'CLONE_CATEGORY_PERMISSION_REQUIRED';
  end if;
  insert into public.categories(id, city_id, icon, position)
  select new_category_id, target_city_id, icon,
    coalesce((select max(position) + 1 from public.categories where city_id = target_city_id), 0)
  from public.categories where id = source_category_id;
  if not found then raise exception using errcode = 'P0002', message = 'CATEGORY_NOT_FOUND'; end if;
  insert into public.category_translations select new_category_id, language, title, is_source, now(), now() from public.category_translations where category_id = source_category_id;

  for source_product in select * from public.products where category_id = source_category_id order by position loop
    new_product_id := gen_random_uuid();
    insert into public.products(id, category_id, coordinates, storage_weight, sold, position)
    values (new_product_id, new_category_id, source_product.coordinates, source_product.storage_weight, false, source_product.position);
    insert into public.product_translations select new_product_id, language, name, description_html, is_source, translation_status, now(), now() from public.product_translations where product_id = source_product.id;
    insert into public.product_prices select new_product_id, currency, amount, now(), now() from public.product_prices where product_id = source_product.id;
    insert into public.product_media(id, product_id, media_type, storage_path, public_url, thumbnail_path, video_provider, position, created_at, updated_at, thumbnail_url)
    select gen_random_uuid(), new_product_id, media_type, storage_path, public_url, thumbnail_path, video_provider, position, now(), now(), thumbnail_url from public.product_media where product_id = source_product.id;
  end loop;
  insert into public.audit_events(actor_profile_id, action, entity_type, entity_id, city_id, metadata)
  values (public.current_profile_id(), 'clone', 'category', new_category_id, target_city_id, jsonb_build_object('source_category_id', source_category_id));
  return new_category_id;
end;
$$;

create or replace function public.save_description_template(
  target_template_id uuid,
  target_category_id uuid,
  template_name text,
  template_position integer,
  template_active boolean,
  translations_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare saved_id uuid; language_code public.content_language;
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  if target_template_id is null then
    insert into public.description_templates(category_id, name, position, is_active)
    values (target_category_id, btrim(template_name), coalesce(template_position, (select coalesce(max(position) + 1, 0) from public.description_templates where category_id = target_category_id)), template_active)
    returning id into saved_id;
  else
    update public.description_templates set category_id = target_category_id, name = btrim(template_name), position = coalesce(template_position, position), is_active = template_active
    where id = target_template_id returning id into saved_id;
  end if;
  if saved_id is null then raise exception using errcode = 'P0002', message = 'TEMPLATE_NOT_FOUND'; end if;
  foreach language_code in array enum_range(null::public.content_language) loop
    insert into public.description_template_translations(template_id, language, html)
    values (saved_id, language_code, coalesce(translations_payload ->> language_code::text, ''))
    on conflict (template_id, language) do update set html = excluded.html;
  end loop;
  return saved_id;
end;
$$;

create or replace function public.delete_description_template(target_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'OWNER_REQUIRED'; end if;
  delete from public.description_templates where id = target_template_id;
  if not found then raise exception using errcode = 'P0002', message = 'TEMPLATE_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.save_city(uuid, text) from public;
revoke all on function public.delete_city(uuid) from public;
revoke all on function public.save_category(uuid, uuid, text, jsonb) from public;
revoke all on function public.delete_category(uuid) from public;
revoke all on function public.save_product(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.delete_product(uuid) from public;
revoke all on function public.clone_product(uuid, uuid) from public;
revoke all on function public.clone_category(uuid, uuid) from public;
revoke all on function public.save_description_template(uuid, uuid, text, integer, boolean, jsonb) from public;
revoke all on function public.delete_description_template(uuid) from public;
grant execute on function public.save_city(uuid, text) to authenticated;
grant execute on function public.delete_city(uuid) to authenticated;
grant execute on function public.save_category(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.delete_category(uuid) to authenticated;
grant execute on function public.save_product(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function public.clone_product(uuid, uuid) to authenticated;
grant execute on function public.clone_category(uuid, uuid) to authenticated;
grant execute on function public.save_description_template(uuid, uuid, text, integer, boolean, jsonb) to authenticated;
grant execute on function public.delete_description_template(uuid) to authenticated;
