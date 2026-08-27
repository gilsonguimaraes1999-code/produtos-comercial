begin;

set search_path = public, extensions;
select plan(7);

select has_function('public'::name, 'reorder_cities'::name, array['uuid[]'::name]);
select has_function('public'::name, 'reorder_categories'::name, array['uuid'::name, 'uuid[]'::name]);
select has_function('public'::name, 'reorder_products'::name, array['uuid'::name, 'uuid[]'::name]);
select function_returns('public'::name, 'reorder_cities'::name, array['uuid[]'::name], 'void'::name);
select function_returns('public'::name, 'reorder_products'::name, array['uuid'::name, 'uuid[]'::name], 'void'::name);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'schema-owner@example.invalid', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (auth_user_id, username, display_name, role, status)
values (
  '10000000-0000-0000-0000-000000000001',
  'schema_owner', 'Schema Owner', 'owner', 'active'
);

insert into public.cities (id, name, position) values
  ('20000000-0000-0000-0000-000000000001', 'First test city', 0),
  ('20000000-0000-0000-0000-000000000002', 'Second test city', 1);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.reorder_cities(array[
    '20000000-0000-0000-0000-000000000002'::uuid,
    '20000000-0000-0000-0000-000000000001'::uuid
  ]) $$,
  'owner can reorder all cities transactionally'
);

select is(
  (select string_agg(name::text, ',' order by position) from public.cities),
  'Second test city,First test city',
  'city order persists with contiguous positions'
);

select * from finish();
rollback;
