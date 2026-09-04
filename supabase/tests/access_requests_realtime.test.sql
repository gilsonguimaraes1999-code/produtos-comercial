begin;

set search_path = public, extensions;
select plan(24);

select has_column('public'::name, 'access_requests'::name, 'tracking_token_hash'::name);
select has_column('public'::name, 'access_requests'::name, 'submission_key'::name);
select has_column('public'::name, 'access_requests'::name, 'review_key'::name);
select has_function('public'::name, 'submit_access_request_v2'::name, array['text'::name, 'text'::name, 'uuid[]'::name, 'text'::name, 'uuid'::name]);
select has_function('public'::name, 'get_access_request_status'::name, array['uuid'::name, 'text'::name]);
select has_function('public'::name, 'review_access_request_v2'::name, array['uuid'::name, 'access_request_status'::name, 'uuid[]'::name, 'uuid'::name, 'uuid'::name]);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '10000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'access-review-owner@example.invalid', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '10000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'access-review-user@example.invalid', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (auth_user_id, username, display_name, role, status)
values ('10000000-0000-0000-0000-000000000011', 'access_review_owner', 'Access Review Owner', 'owner', 'active');

insert into public.cities (id, name, position)
values ('20000000-0000-0000-0000-000000000011', 'Access realtime test city', 1000);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated"}',
  true
);

create temporary table access_realtime_test_state (
  request_id uuid not null,
  duplicate_request_id uuid not null,
  profile_id uuid,
  replay_profile_id uuid
) on commit drop;

do $$
declare
  first_request_id uuid;
  second_request_id uuid;
  first_profile_id uuid;
  second_profile_id uuid;
begin
  first_request_id := public.submit_access_request_v2(
    'Realtime Requester',
    'realtime_requester',
    array['20000000-0000-0000-0000-000000000011'::uuid],
    'tracking-secret-that-never-appears-in-plaintext',
    '30000000-0000-0000-0000-000000000011'::uuid
  );
  second_request_id := public.submit_access_request_v2(
    'Realtime Requester',
    'realtime_requester',
    array['20000000-0000-0000-0000-000000000011'::uuid],
    'tracking-secret-that-never-appears-in-plaintext',
    '30000000-0000-0000-0000-000000000011'::uuid
  );

  first_profile_id := public.review_access_request_v2(
    first_request_id,
    'approved',
    array['20000000-0000-0000-0000-000000000011'::uuid],
    '10000000-0000-0000-0000-000000000012'::uuid,
    '40000000-0000-0000-0000-000000000011'::uuid
  );
  second_profile_id := public.review_access_request_v2(
    first_request_id,
    'approved',
    array['20000000-0000-0000-0000-000000000011'::uuid],
    null,
    '40000000-0000-0000-0000-000000000011'::uuid
  );

  insert into access_realtime_test_state
  values (first_request_id, second_request_id, first_profile_id, second_profile_id);
end;
$$;

select ok(
  (select tracking_token_hash <> 'tracking-secret-that-never-appears-in-plaintext'
     and char_length(tracking_token_hash) = 64
   from public.access_requests
   where id = (select request_id from access_realtime_test_state)),
  'tracking secret is stored only as a sha256 hash'
);
select is(
  (select duplicate_request_id from access_realtime_test_state),
  (select request_id from access_realtime_test_state),
  'duplicate submission key returns the original request id'
);
select is(
  (select count(*) from public.access_requests where submission_key = '30000000-0000-0000-0000-000000000011'),
  1::bigint,
  'duplicate submission key creates only one request'
);
select is(
  (select count(*) from public.get_access_request_status((select request_id from access_realtime_test_state), 'wrong-secret')),
  0::bigint,
  'wrong tracking secret returns no status row'
);
select is(
  (select status::text from public.get_access_request_status(
    (select request_id from access_realtime_test_state),
    'tracking-secret-that-never-appears-in-plaintext'
  )),
  'approved',
  'correct tracking secret returns only the reviewed request status'
);
select is(
  (select replay_profile_id from access_realtime_test_state),
  (select profile_id from access_realtime_test_state),
  'same review key returns the original profile'
);
select is(
  (select count(*) from public.profiles where username_normalized = 'realtime_requester'),
  1::bigint,
  'same review key does not duplicate the profile'
);
select is(
  (select count(*) from public.access_history where access_request_id = (select request_id from access_realtime_test_state)),
  1::bigint,
  'same review key does not duplicate access history'
);
select lives_ok(
  $$select * from public.list_access_requests_for_management()$$,
  'access request management list preserves its declared result types'
);

select ok(has_function_privilege('anon', 'public.submit_access_request_v2(text,text,uuid[],text,uuid)', 'EXECUTE'), 'anon can submit v2');
select ok(has_function_privilege('authenticated', 'public.submit_access_request_v2(text,text,uuid[],text,uuid)', 'EXECUTE'), 'authenticated can submit v2');
select ok(not exists(
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid = 'public.submit_access_request_v2(text,text,uuid[],text,uuid)'::regprocedure
    and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
), 'submit v2 is not granted to public');

select ok(has_function_privilege('anon', 'public.get_access_request_status(uuid,text)', 'EXECUTE'), 'anon can query tracked status');
select ok(has_function_privilege('authenticated', 'public.get_access_request_status(uuid,text)', 'EXECUTE'), 'authenticated can query tracked status');
select ok(not exists(
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid = 'public.get_access_request_status(uuid,text)'::regprocedure
    and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
), 'tracked status is not granted to public');

select ok(has_function_privilege('authenticated', 'public.review_access_request_v2(uuid,public.access_request_status,uuid[],uuid,uuid)', 'EXECUTE'), 'authenticated can review v2');
select ok(not has_function_privilege('anon', 'public.review_access_request_v2(uuid,public.access_request_status,uuid[],uuid,uuid)', 'EXECUTE'), 'anon cannot review v2');
select ok(not exists(
  select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid = 'public.review_access_request_v2(uuid,public.access_request_status,uuid[],uuid,uuid)'::regprocedure
    and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
), 'review v2 is not granted to public');

select * from finish();
rollback;
