do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cities', 'categories', 'category_translations', 'products',
    'product_translations', 'product_prices', 'product_media',
    'description_templates', 'description_template_translations',
    'profiles', 'user_cities', 'user_product_permissions',
    'user_access_permissions', 'access_requests', 'access_request_cities',
    'access_history', 'site_settings', 'translation_jobs'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
