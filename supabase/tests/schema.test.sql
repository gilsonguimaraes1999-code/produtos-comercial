begin;

select plan(8);
select has_table('public'::name, 'cities'::name);
select has_table('public'::name, 'products'::name);
select has_table('public'::name, 'product_prices'::name);
select has_table('public'::name, 'profiles'::name);
select has_table('public'::name, 'activation_codes'::name);
select has_table('public'::name, 'access_requests'::name);
select col_type_is('public'::name, 'product_prices'::name, 'amount'::name, 'numeric(14,2)'::text);
select col_is_unique('public'::name, 'profiles'::name, 'username_normalized'::name);
select * from finish();

rollback;
