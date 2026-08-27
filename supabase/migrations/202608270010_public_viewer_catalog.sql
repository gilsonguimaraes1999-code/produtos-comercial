-- O catálogo é deliberadamente público no modo Visualizador. Escritas continuam autenticadas.
create policy cities_public_viewer_read on public.cities for select to anon using (true);
create policy categories_public_viewer_read on public.categories for select to anon using (true);
create policy category_translations_public_viewer_read on public.category_translations for select to anon using (true);
create policy products_public_viewer_read on public.products for select to anon using (true);
create policy product_translations_public_viewer_read on public.product_translations for select to anon using (true);
create policy product_prices_public_viewer_read on public.product_prices for select to anon using (true);
create policy product_media_public_viewer_read on public.product_media for select to anon using (true);
create policy description_templates_public_viewer_read on public.description_templates for select to anon using (true);
create policy description_template_translations_public_viewer_read on public.description_template_translations for select to anon using (true);
