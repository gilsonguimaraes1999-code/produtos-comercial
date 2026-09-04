begin;

set search_path = public, extensions;
select plan(67);

select has_column('public', 'cities', 'version');
select has_column('public', 'categories', 'version');
select has_column('public', 'products', 'version');
select has_column('public', 'description_templates', 'version');

select has_function('public'::name, 'save_city_v2'::name, array['uuid'::name, 'text'::name, 'bigint'::name]);
select has_function('public'::name, 'save_category_v2'::name, array['uuid'::name, 'uuid'::name, 'text'::name, 'jsonb'::name, 'bigint'::name]);
select has_function('public'::name, 'save_product_v2'::name, array['uuid'::name, 'uuid'::name, 'jsonb'::name, 'jsonb'::name, 'jsonb'::name, 'jsonb'::name, 'bigint'::name]);
select has_function('public'::name, 'save_description_template_v2'::name, array['uuid'::name, 'uuid'::name, 'text'::name, 'integer'::name, 'boolean'::name, 'jsonb'::name, 'bigint'::name]);
select has_function('public'::name, 'reorder_cities_v2'::name, array['uuid[]'::name, 'uuid[]'::name]);
select has_function('public'::name, 'reorder_categories_v2'::name, array['uuid'::name, 'uuid[]'::name, 'uuid[]'::name]);
select has_function('public'::name, 'reorder_products_v2'::name, array['uuid'::name, 'uuid[]'::name, 'uuid[]'::name]);
select has_function('public'::name, 'lock_catalog_order_scope'::name, array['text'::name, 'uuid'::name]);
select has_function('public'::name, 'try_lock_catalog_order_scope'::name, array['text'::name, 'uuid'::name]);
select has_trigger('public', 'cities', 'cities_order_scope_lock');
select has_trigger('public', 'categories', 'categories_order_scope_lock');
select has_trigger('public', 'products', 'products_order_scope_lock');
select has_trigger('public', 'categories', 'categories_move_scope_lock');
select has_trigger('public', 'products', 'products_move_scope_lock');

select ok(
  has_function_privilege('authenticated', 'public.save_city_v2(uuid,text,bigint)', 'EXECUTE'),
  'authenticated executes save_city_v2'
);

select ok(
  not has_function_privilege('anon', 'public.save_city_v2(uuid,text,bigint)', 'EXECUTE'),
  'anonymous cannot execute save_city_v2'
);

select ok(
  has_function_privilege('authenticated', 'public.save_category_v2(uuid,uuid,text,jsonb,bigint)', 'EXECUTE'),
  'authenticated executes save_category_v2'
);

select ok(
  not has_function_privilege('anon', 'public.save_category_v2(uuid,uuid,text,jsonb,bigint)', 'EXECUTE'),
  'anonymous cannot execute save_category_v2'
);

select ok(
  has_function_privilege('authenticated', 'public.save_product_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)', 'EXECUTE'),
  'authenticated executes save_product_v2'
);

select ok(
  not has_function_privilege('anon', 'public.save_product_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint)', 'EXECUTE'),
  'anonymous cannot execute save_product_v2'
);

select ok(
  has_function_privilege('authenticated', 'public.save_description_template_v2(uuid,uuid,text,integer,boolean,jsonb,bigint)', 'EXECUTE'),
  'authenticated executes save_description_template_v2'
);

select ok(
  not has_function_privilege('anon', 'public.save_description_template_v2(uuid,uuid,text,integer,boolean,jsonb,bigint)', 'EXECUTE'),
  'anonymous cannot execute save_description_template_v2'
);

select ok(
  has_function_privilege('authenticated', 'public.reorder_cities_v2(uuid[],uuid[])', 'EXECUTE'),
  'authenticated executes reorder_cities_v2'
);

select ok(
  not has_function_privilege('anon', 'public.reorder_cities_v2(uuid[],uuid[])', 'EXECUTE'),
  'anonymous cannot execute reorder_cities_v2'
);

select ok(
  has_function_privilege('authenticated', 'public.reorder_categories_v2(uuid,uuid[],uuid[])', 'EXECUTE'),
  'authenticated executes reorder_categories_v2'
);

select ok(
  not has_function_privilege('anon', 'public.reorder_categories_v2(uuid,uuid[],uuid[])', 'EXECUTE'),
  'anonymous cannot execute reorder_categories_v2'
);

select ok(
  has_function_privilege('authenticated', 'public.reorder_products_v2(uuid,uuid[],uuid[])', 'EXECUTE'),
  'authenticated executes reorder_products_v2'
);

select ok(
  not has_function_privilege('anon', 'public.reorder_products_v2(uuid,uuid[],uuid[])', 'EXECUTE'),
  'anonymous cannot execute reorder_products_v2'
);

select ok(
  position(
    'lock_catalog_order_scope(''cities''' in
    pg_get_functiondef('public.save_city_v2(uuid,text,bigint)'::regprocedure)
  ) > 0
  and position(
    'lock_catalog_order_scope(''cities''' in
    pg_get_functiondef('public.reorder_cities_v2(uuid[],uuid[])'::regprocedure)
  ) > 0,
  'insert and reorder use the same transaction order-scope mutex'
);

select ok(
  position(
    'pg_try_advisory_xact_lock' in
    pg_get_functiondef('public.try_lock_catalog_order_scope(text,uuid)'::regprocedure)
  ) > 0,
  'legacy move mutex fails fast instead of waiting after a row lock'
);

select ok(
  position('old.city_id is distinct from new.city_id' in lower(pg_get_triggerdef(
    (select oid from pg_trigger where tgrelid = 'public.categories'::regclass and tgname = 'categories_move_scope_lock')
  ))) > 0
  and position('old.category_id is distinct from new.category_id' in lower(pg_get_triggerdef(
    (select oid from pg_trigger where tgrelid = 'public.products'::regclass and tgname = 'products_move_scope_lock')
  ))) > 0,
  'legacy move locks do not run for ordinary same-scope edits'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '61000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'catalog-concurrency@example.invalid', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (auth_user_id, username, display_name, role, status)
values ('61000000-0000-0000-0000-000000000001', 'catalog_concurrency_owner', 'Catalog concurrency owner', 'owner', 'active');

insert into public.cities (id, name, position) values
  ('62000000-0000-0000-0000-000000000001', 'Concurrency city one', 0),
  ('62000000-0000-0000-0000-000000000002', 'Concurrency city two', 1);

select set_config('app.skip_catalog_version_trigger', 'on', true);

insert into public.categories (id, city_id, icon, position) values
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'Box', 0),
  ('63000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', 'Box', 1);

insert into public.category_translations(category_id, language, title, is_source) values
  ('63000000-0000-0000-0000-000000000001', 'pt', 'Categoria um', true),
  ('63000000-0000-0000-0000-000000000002', 'pt', 'Categoria dois', true);

insert into public.products(id, category_id, position) values
  ('64000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', 0),
  ('64000000-0000-0000-0000-000000000002', '63000000-0000-0000-0000-000000000001', 1);

insert into public.product_translations(product_id, language, name, is_source) values
  ('64000000-0000-0000-0000-000000000001', 'pt', 'Produto um', true),
  ('64000000-0000-0000-0000-000000000002', 'pt', 'Produto dois', true);

select set_config('app.skip_catalog_version_trigger', 'off', true);

select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  public.save_city_v2('62000000-0000-0000-0000-000000000001', 'Primeiro salvamento', 1),
  jsonb_build_object('id', '62000000-0000-0000-0000-000000000001'::uuid, 'version', 2),
  'the first editor saves and receives the next version'
);

select throws_ok(
  $$ select public.save_city_v2('62000000-0000-0000-0000-000000000001', 'Salvamento obsoleto', 1) $$,
  '40001', 'EDIT_CONFLICT',
  'the second editor cannot overwrite with the stale opened version'
);

select is(
  (select name::text from public.cities where id = '62000000-0000-0000-0000-000000000001'),
  'Primeiro salvamento',
  'a rejected stale save changes no city data'
);

select is(
  (select metadata ->> 'previous_version' from public.audit_events where entity_id = '62000000-0000-0000-0000-000000000001' order by created_at desc, id desc limit 1),
  '1',
  'audit metadata records the previous version'
);

select is(
  (select metadata ->> 'new_version' from public.audit_events where entity_id = '62000000-0000-0000-0000-000000000001' order by created_at desc, id desc limit 1),
  '2',
  'audit metadata records the new version'
);

select is(
  public.save_category_v2(
    '63000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001',
    'Crown',
    '{"language":"pt","title":"Categoria atualizada","translate_missing":false}'::jsonb,
    1
  ) ->> 'version',
  '2',
  'category writes are versioned'
);

select is(
  public.save_product_v2(
    '64000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    '{"language":"pt","name":"Produto atualizado","description_html":"","translate_missing":false}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    1
  ) ->> 'version',
  '2',
  'product writes are versioned once despite child writes'
);

update public.product_translations
set name = 'Mudança externa'
where product_id = '64000000-0000-0000-0000-000000000001' and language = 'pt';

select is(
  (select version from public.products where id = '64000000-0000-0000-0000-000000000001'),
  3::bigint,
  'a child-table write outside the RPC increments its parent version'
);

select lives_ok(
  $$ select public.reorder_cities_v2(
    array['62000000-0000-0000-0000-000000000002'::uuid, '62000000-0000-0000-0000-000000000001'::uuid],
    array['62000000-0000-0000-0000-000000000001'::uuid, '62000000-0000-0000-0000-000000000002'::uuid]
  ) $$,
  'reorder accepts the exact order that the editor opened'
);

select is(
  (select jsonb_typeof(before_data -> 'versions') from public.audit_events where action = 'reorder' and entity_type = 'cities' order by created_at desc, id desc limit 1),
  'object',
  'reorder audit records versions before the change'
);

select is(
  (select jsonb_typeof(after_data -> 'versions') from public.audit_events where action = 'reorder' and entity_type = 'cities' order by created_at desc, id desc limit 1),
  'object',
  'reorder audit records versions after the change'
);

select is(
  (select before_data -> 'versions' ->> '62000000-0000-0000-0000-000000000001' from public.audit_events where action = 'reorder' and entity_type = 'cities' order by created_at desc, id desc limit 1),
  '2',
  'city reorder audit stores the exact version before for the edited city'
);

select is(
  (select before_data -> 'versions' ->> '62000000-0000-0000-0000-000000000002' from public.audit_events where action = 'reorder' and entity_type = 'cities' order by created_at desc, id desc limit 1),
  '1',
  'city reorder audit stores the exact version before for the peer city'
);

select is(
  (select after_data -> 'versions' ->> '62000000-0000-0000-0000-000000000001' from public.audit_events where action = 'reorder' and entity_type = 'cities' order by created_at desc, id desc limit 1),
  '3',
  'city reorder audit stores the exact version after for the edited city'
);

select is(
  (select after_data -> 'versions' ->> '62000000-0000-0000-0000-000000000002' from public.audit_events where action = 'reorder' and entity_type = 'cities' order by created_at desc, id desc limit 1),
  '2',
  'city reorder audit stores the exact version after for the peer city'
);

select throws_ok(
  $$ select public.reorder_cities_v2(
    array['62000000-0000-0000-0000-000000000001'::uuid, '62000000-0000-0000-0000-000000000002'::uuid],
    array['62000000-0000-0000-0000-000000000001'::uuid, '62000000-0000-0000-0000-000000000002'::uuid]
  ) $$,
  '40001', 'ORDER_CONFLICT',
  'reorder rejects an order opened before another editor changed it'
);

select lives_ok(
  $$ select public.reorder_categories_v2(
    '62000000-0000-0000-0000-000000000001',
    array['63000000-0000-0000-0000-000000000002'::uuid, '63000000-0000-0000-0000-000000000001'::uuid],
    array['63000000-0000-0000-0000-000000000001'::uuid, '63000000-0000-0000-0000-000000000002'::uuid]
  ) $$,
  'category reorder is scoped to one city'
);

select is(
  (select jsonb_typeof(before_data -> 'versions') from public.audit_events where action = 'reorder' and entity_type = 'categories' order by created_at desc, id desc limit 1),
  'object',
  'category reorder audit records versions before the change'
);

select is(
  (select jsonb_typeof(after_data -> 'versions') from public.audit_events where action = 'reorder' and entity_type = 'categories' order by created_at desc, id desc limit 1),
  'object',
  'category reorder audit records versions after the change'
);

select is(
  (select before_data -> 'versions' ->> '63000000-0000-0000-0000-000000000001' from public.audit_events where action = 'reorder' and entity_type = 'categories' order by created_at desc, id desc limit 1),
  '2',
  'category reorder audit stores the exact version before for the edited category'
);

select is(
  (select before_data -> 'versions' ->> '63000000-0000-0000-0000-000000000002' from public.audit_events where action = 'reorder' and entity_type = 'categories' order by created_at desc, id desc limit 1),
  '1',
  'category reorder audit stores the exact version before for the peer category'
);

select is(
  (select after_data -> 'versions' ->> '63000000-0000-0000-0000-000000000001' from public.audit_events where action = 'reorder' and entity_type = 'categories' order by created_at desc, id desc limit 1),
  '3',
  'category reorder audit stores the exact version after for the edited category'
);

select is(
  (select after_data -> 'versions' ->> '63000000-0000-0000-0000-000000000002' from public.audit_events where action = 'reorder' and entity_type = 'categories' order by created_at desc, id desc limit 1),
  '2',
  'category reorder audit stores the exact version after for the peer category'
);

select lives_ok(
  $$ select public.reorder_products_v2(
    '63000000-0000-0000-0000-000000000001',
    array['64000000-0000-0000-0000-000000000002'::uuid, '64000000-0000-0000-0000-000000000001'::uuid],
    array['64000000-0000-0000-0000-000000000001'::uuid, '64000000-0000-0000-0000-000000000002'::uuid]
  ) $$,
  'product reorder is scoped to one category'
);

select is(
  (select jsonb_typeof(before_data -> 'versions') from public.audit_events where action = 'reorder' and entity_type = 'products' order by created_at desc, id desc limit 1),
  'object',
  'product reorder audit records versions before the change'
);

select is(
  (select jsonb_typeof(after_data -> 'versions') from public.audit_events where action = 'reorder' and entity_type = 'products' order by created_at desc, id desc limit 1),
  'object',
  'product reorder audit records versions after the change'
);

select is(
  (select before_data -> 'versions' ->> '64000000-0000-0000-0000-000000000001' from public.audit_events where action = 'reorder' and entity_type = 'products' order by created_at desc, id desc limit 1),
  '3',
  'product reorder audit stores the exact version before for the edited product'
);

select is(
  (select before_data -> 'versions' ->> '64000000-0000-0000-0000-000000000002' from public.audit_events where action = 'reorder' and entity_type = 'products' order by created_at desc, id desc limit 1),
  '1',
  'product reorder audit stores the exact version before for the peer product'
);

select is(
  (select after_data -> 'versions' ->> '64000000-0000-0000-0000-000000000001' from public.audit_events where action = 'reorder' and entity_type = 'products' order by created_at desc, id desc limit 1),
  '4',
  'product reorder audit stores the exact version after for the edited product'
);

select is(
  (select after_data -> 'versions' ->> '64000000-0000-0000-0000-000000000002' from public.audit_events where action = 'reorder' and entity_type = 'products' order by created_at desc, id desc limit 1),
  '2',
  'product reorder audit stores the exact version after for the peer product'
);

select is(
  public.save_city_v2(null, 'Inserted after baseline capture', null) ->> 'version',
  '1',
  'a city insert succeeds while holding the shared order scope'
);

select throws_ok(
  $$ select public.reorder_cities_v2(
    array['62000000-0000-0000-0000-000000000002'::uuid, '62000000-0000-0000-0000-000000000001'::uuid],
    array['62000000-0000-0000-0000-000000000002'::uuid, '62000000-0000-0000-0000-000000000001'::uuid]
  ) $$,
  '40001', 'ORDER_CONFLICT',
  'insert invalidates an older reorder baseline'
);

select * from finish();
rollback;
