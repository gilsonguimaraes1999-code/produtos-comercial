create or replace function public.list_users_for_management()
returns table (
  id uuid, display_name text, username text, role public.user_role,
  status public.profile_status, city_ids jsonb, product_permissions jsonb,
  manage_requests boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_owner() then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
  return query
  select profile.id, profile.display_name, profile.username::text, profile.role, profile.status,
    coalesce((select jsonb_agg(uc.city_id order by city.position, city.id) from public.user_cities uc join public.cities city on city.id = uc.city_id where uc.profile_id = profile.id), '[]'::jsonb),
    coalesce(to_jsonb(permission) - 'profile_id' - 'created_at' - 'updated_at', '{}'::jsonb),
    coalesce(access_permission.manage_requests_for_assigned_cities, false),
    profile.created_at, profile.updated_at
  from public.profiles profile
  left join public.user_product_permissions permission on permission.profile_id = profile.id
  left join public.user_access_permissions access_permission on access_permission.profile_id = profile.id
  order by lower(profile.display_name), profile.id;
end;
$$;

create or replace function public.list_access_requests_for_management()
returns table (
  id uuid, display_name text, username text, status public.access_request_status,
  city_ids jsonb, city_names jsonb, primary_city_name text, approved_city_ids jsonb,
  reviewed_at timestamptz, reviewed_by_name text, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if public.current_profile_id() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  return query
  select request.id, request.display_name, request.username::text, request.status,
    coalesce(city_data.ids, '[]'::jsonb), coalesce(city_data.names, '[]'::jsonb), city_data.primary_name,
    coalesce(history.cities, '[]'::jsonb), request.reviewed_at, reviewer.display_name,
    request.created_at, request.updated_at
  from public.access_requests request
  left join public.profiles reviewer on reviewer.id = request.reviewed_by
  left join lateral (
    select jsonb_agg(city.id order by city.position, city.id) ids,
      jsonb_agg(city.name order by city.position, city.id) names,
      (array_agg(city.name order by city.position, city.id))[1] primary_name,
      bool_or(public.can_manage_access_requests(city.id)) manageable
    from public.access_request_cities arc join public.cities city on city.id = arc.city_id
    where arc.access_request_id = request.id
  ) city_data on true
  left join lateral (
    select event.cities_snapshot cities from public.access_history event
    where event.access_request_id = request.id order by event.created_at desc limit 1
  ) history on true
  where public.is_owner() or coalesce(city_data.manageable, false)
  order by request.created_at desc, request.id;
end;
$$;

create or replace function public.submit_access_request(request_display_name text, request_username text, requested_city_ids uuid[])
returns uuid language plpgsql security definer set search_path = public, auth, extensions
as $$
declare new_id uuid;
begin
  request_display_name := btrim(request_display_name);
  request_username := lower(btrim(request_username));
  if char_length(request_display_name) < 2 then raise exception 'DISPLAY_NAME_INVALID'; end if;
  if request_username !~ '^[a-z0-9._-]{2,64}$' then raise exception 'USERNAME_INVALID'; end if;
  if coalesce(array_length(requested_city_ids, 1), 0) = 0 then raise exception 'CITY_REQUIRED'; end if;
  if exists(select 1 from public.profiles where username_normalized = request_username) then raise exception 'ACCOUNT_ALREADY_EXISTS'; end if;
  if (select count(*) from public.cities where id = any(requested_city_ids)) <> (select count(distinct value) from unnest(requested_city_ids) value) then raise exception 'CITY_INVALID'; end if;
  insert into public.access_requests(display_name, username) values(request_display_name, request_username) returning id into new_id;
  insert into public.access_request_cities(access_request_id, city_id) select new_id, value from unnest(requested_city_ids) value on conflict do nothing;
  return new_id;
exception when unique_violation then raise exception 'ACCESS_REQUEST_PENDING';
end;
$$;

create or replace function public.review_access_request(
  target_request_id uuid, decision public.access_request_status, approved_city_ids uuid[] default '{}', new_auth_user_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public, auth
as $$
declare reviewer uuid := public.current_profile_id(); request_row public.access_requests%rowtype; target_profile uuid;
begin
  if reviewer is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'DECISION_INVALID'; end if;
  select * into request_row from public.access_requests where id = target_request_id and status = 'pending' for update;
  if not found then raise exception 'REQUEST_NOT_PENDING'; end if;
  if exists(select 1 from public.access_request_cities arc where arc.access_request_id = target_request_id and not public.can_manage_access_requests(arc.city_id)) then raise exception 'REQUEST_PERMISSION_DENIED' using errcode = '42501'; end if;
  if decision = 'approved' then
    if new_auth_user_id is null or coalesce(array_length(approved_city_ids, 1), 0) = 0 then raise exception 'APPROVAL_DATA_REQUIRED'; end if;
    if exists(select 1 from unnest(approved_city_ids) value where not exists(select 1 from public.access_request_cities arc where arc.access_request_id = target_request_id and arc.city_id = value)) then raise exception 'CITY_NOT_REQUESTED'; end if;
    insert into public.profiles(auth_user_id, username, display_name, role, status) values(new_auth_user_id, request_row.username, request_row.display_name, 'commercial', 'pending_activation') returning id into target_profile;
    insert into public.user_cities(profile_id, city_id) select target_profile, value from unnest(approved_city_ids) value;
    insert into public.user_product_permissions(profile_id) values(target_profile);
    insert into public.user_access_permissions(profile_id) values(target_profile);
  end if;
  update public.access_requests set status = decision, reviewed_by = reviewer, reviewed_at = now() where id = target_request_id;
  insert into public.access_history(access_request_id, profile_id, action, display_name_snapshot, username_snapshot, role_snapshot, cities_snapshot, permissions_snapshot, reviewer_id)
  values(target_request_id, target_profile, decision, request_row.display_name, request_row.username::text,
    case when decision = 'approved' then 'commercial'::public.user_role else null end,
    coalesce((select jsonb_agg(jsonb_build_object('id', city.id, 'name', city.name) order by city.position, city.id) from public.cities city where city.id = any(approved_city_ids)), '[]'::jsonb),
    '{}'::jsonb, reviewer);
  return target_profile;
end;
$$;

revoke all on function public.list_users_for_management() from public;
revoke all on function public.list_access_requests_for_management() from public;
revoke all on function public.submit_access_request(text, text, uuid[]) from public;
revoke all on function public.review_access_request(uuid, public.access_request_status, uuid[], uuid) from public;
grant execute on function public.list_users_for_management() to authenticated;
grant execute on function public.list_access_requests_for_management() to authenticated;
grant execute on function public.submit_access_request(text, text, uuid[]) to anon, authenticated;
grant execute on function public.review_access_request(uuid, public.access_request_status, uuid[], uuid) to authenticated;
