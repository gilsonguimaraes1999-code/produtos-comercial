begin;

set search_path = public, extensions;
select plan(7);

select has_function('public'::name, 'can_access_city'::name, array['uuid'::name]);
select has_function('public'::name, 'has_product_permission'::name, array['text'::name, 'uuid'::name]);
select has_function('public'::name, 'can_manage_access_requests'::name, array['uuid'::name]);
select ok((select relrowsecurity from pg_class where oid = 'public.cities'::regclass), 'cities has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.products'::regclass), 'products has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.access_requests'::regclass), 'access requests has RLS enabled');

select * from finish();
rollback;
