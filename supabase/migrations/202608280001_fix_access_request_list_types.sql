create or replace function public.list_access_requests_for_management()
returns table (
  id uuid, display_name text, username text, status public.access_request_status,
  city_ids jsonb, city_names jsonb, primary_city_name text, approved_city_ids jsonb,
  reviewed_at timestamptz, reviewed_by_name text, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if public.current_profile_id() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    request.display_name,
    request.username::text,
    request.status,
    coalesce(city_data.ids, '[]'::jsonb),
    coalesce(city_data.names, '[]'::jsonb),
    city_data.primary_name::text,
    coalesce(history.cities, '[]'::jsonb),
    request.reviewed_at,
    reviewer.display_name,
    request.created_at,
    request.updated_at
  from public.access_requests request
  left join public.profiles reviewer on reviewer.id = request.reviewed_by
  left join lateral (
    select
      jsonb_agg(city.id order by city.position, city.id) ids,
      jsonb_agg(city.name order by city.position, city.id) names,
      (array_agg(city.name order by city.position, city.id))[1] primary_name,
      bool_or(public.can_manage_access_requests(city.id)) manageable
    from public.access_request_cities arc
    join public.cities city on city.id = arc.city_id
    where arc.access_request_id = request.id
  ) city_data on true
  left join lateral (
    select event.cities_snapshot cities
    from public.access_history event
    where event.access_request_id = request.id
    order by event.created_at desc
    limit 1
  ) history on true
  where public.is_owner() or coalesce(city_data.manageable, false)
  order by request.created_at desc, request.id;
end;
$$;

revoke all on function public.list_access_requests_for_management() from public;
grant execute on function public.list_access_requests_for_management() to authenticated;
