alter table public.access_requests
  add column if not exists pending_auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists access_requests_pending_auth_user_id_idx
  on public.access_requests(pending_auth_user_id)
  where pending_auth_user_id is not null;

create or replace function public.submit_access_request_v3(
  request_display_name text,
  request_username text,
  requested_city_ids uuid[],
  tracking_secret text,
  request_submission_key uuid,
  new_pending_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid;
begin
  request_display_name := btrim(request_display_name);
  request_username := lower(btrim(request_username));

  if char_length(request_display_name) < 2 then raise exception 'DISPLAY_NAME_INVALID'; end if;
  if request_username !~ '^[a-z0-9._-]{2,64}$' then raise exception 'USERNAME_INVALID'; end if;
  if coalesce(array_length(requested_city_ids, 1), 0) = 0 then raise exception 'CITY_REQUIRED'; end if;
  if tracking_secret is null or char_length(tracking_secret) < 32 then raise exception 'TRACKING_SECRET_INVALID'; end if;
  if request_submission_key is null then raise exception 'SUBMISSION_KEY_REQUIRED'; end if;
  if new_pending_auth_user_id is null then raise exception 'AUTH_USER_REQUIRED'; end if;

  select request.id into new_id
  from public.access_requests request
  where request.submission_key = request_submission_key;
  if found then return new_id; end if;

  if exists(select 1 from public.profiles where username_normalized = request_username) then
    raise exception 'ACCOUNT_ALREADY_EXISTS';
  end if;
  if exists(
    select 1 from public.access_requests request
    where request.username_normalized = request_username and request.status = 'pending'
  ) then
    raise exception 'ACCESS_REQUEST_PENDING';
  end if;
  if (select count(*) from public.cities where id = any(requested_city_ids)) <>
     (select count(distinct value) from unnest(requested_city_ids) value) then
    raise exception 'CITY_INVALID';
  end if;

  insert into public.access_requests(
    display_name,
    username,
    tracking_token_hash,
    submission_key,
    pending_auth_user_id
  ) values (
    request_display_name,
    request_username,
    encode(digest(tracking_secret, 'sha256'), 'hex'),
    request_submission_key,
    new_pending_auth_user_id
  ) returning id into new_id;

  insert into public.access_request_cities(access_request_id, city_id)
  select new_id, value from unnest(requested_city_ids) value
  on conflict do nothing;

  return new_id;
exception
  when unique_violation then
    select request.id into new_id
    from public.access_requests request
    where request.submission_key = request_submission_key;
    if found then return new_id; end if;
    raise exception 'ACCESS_REQUEST_PENDING';
end;
$$;

create or replace function public.review_access_request_v3(
  target_request_id uuid,
  decision public.access_request_status,
  approved_city_ids uuid[] default '{}',
  request_review_key uuid default null,
  rejection_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  reviewer uuid := public.current_profile_id();
  request_row public.access_requests%rowtype;
  target_profile uuid;
begin
  if reviewer is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'DECISION_INVALID'; end if;
  if request_review_key is null then raise exception 'REVIEW_KEY_REQUIRED'; end if;

  select * into request_row
  from public.access_requests
  where id = target_request_id
  for update;

  if not found then raise exception 'REQUEST_NOT_PENDING'; end if;

  if request_row.review_key = request_review_key and request_row.status = decision then
    select event.profile_id into target_profile
    from public.access_history event
    where event.access_request_id = target_request_id
    order by event.created_at desc
    limit 1;
    return target_profile;
  end if;

  if request_row.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  if exists(
    select 1 from public.access_request_cities arc
    where arc.access_request_id = target_request_id
      and not public.can_manage_access_requests(arc.city_id)
  ) then
    raise exception 'REQUEST_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if decision = 'approved' then
    if request_row.pending_auth_user_id is null or coalesce(array_length(approved_city_ids, 1), 0) = 0 then
      raise exception 'APPROVAL_DATA_REQUIRED';
    end if;
    if exists(
      select 1 from unnest(approved_city_ids) value
      where not exists(
        select 1 from public.access_request_cities arc
        where arc.access_request_id = target_request_id and arc.city_id = value
      )
    ) then
      raise exception 'CITY_NOT_REQUESTED';
    end if;

    insert into public.profiles(auth_user_id, username, display_name, role, status)
    values(request_row.pending_auth_user_id, request_row.username, request_row.display_name, 'commercial', 'active')
    returning id into target_profile;

    insert into public.user_cities(profile_id, city_id)
    select target_profile, value from unnest(approved_city_ids) value;
    insert into public.user_product_permissions(profile_id) values(target_profile);
    insert into public.user_access_permissions(profile_id) values(target_profile);
  end if;

  update public.access_requests
  set status = decision,
      reviewed_by = reviewer,
      reviewed_at = now(),
      rejection_reason = case when decision = 'rejected' then nullif(btrim(rejection_reason), '') else null end,
      review_key = request_review_key
  where id = target_request_id;

  insert into public.access_history(
    access_request_id,
    profile_id,
    action,
    display_name_snapshot,
    username_snapshot,
    role_snapshot,
    cities_snapshot,
    permissions_snapshot,
    reviewer_id
  ) values (
    target_request_id,
    target_profile,
    decision,
    request_row.display_name,
    request_row.username::text,
    case when decision = 'approved' then 'commercial'::public.user_role else null end,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', city.id, 'name', city.name) order by city.position, city.id)
      from public.cities city
      where city.id = any(approved_city_ids)
    ), '[]'::jsonb),
    '{}'::jsonb,
    reviewer
  );

  return target_profile;
end;
$$;

revoke all on function public.submit_access_request_v3(text, text, uuid[], text, uuid, uuid) from public;
revoke all on function public.review_access_request_v3(uuid, public.access_request_status, uuid[], uuid, text) from public;
grant execute on function public.submit_access_request_v3(text, text, uuid[], text, uuid, uuid) to service_role;
grant execute on function public.review_access_request_v3(uuid, public.access_request_status, uuid[], uuid, text) to authenticated;
