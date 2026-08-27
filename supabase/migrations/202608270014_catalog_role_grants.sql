-- RLS policies do not replace PostgreSQL object privileges. Grant only read access here; row visibility remains controlled by RLS.

grant usage on schema public to anon, authenticated;

grant select on table
  public.cities,
  public.categories,
  public.category_translations,
  public.products,
  public.product_translations,
  public.product_prices,
  public.product_media,
  public.description_templates,
  public.description_template_translations,
  public.site_settings
to anon, authenticated;

grant select on table
  public.profiles,
  public.user_cities,
  public.user_product_permissions,
  public.user_access_permissions,
  public.access_requests,
  public.access_request_cities,
  public.access_history,
  public.translation_jobs,
  public.backups
to authenticated;
