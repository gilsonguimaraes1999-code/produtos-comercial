insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy product_media_storage_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-media');

create policy product_media_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-media'
  and (storage.foldername(name))[1] = 'products'
  and exists (
    select 1
    from public.products product
    join public.categories category on category.id = product.category_id
    where product.id = ((storage.foldername(name))[2])::uuid
      and public.has_product_permission('edit_product_media', category.city_id)
  )
);

create policy product_media_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'product-media'
  and exists (
    select 1
    from public.products product
    join public.categories category on category.id = product.category_id
    where product.id = ((storage.foldername(name))[2])::uuid
      and public.has_product_permission('edit_product_media', category.city_id)
  )
)
with check (bucket_id = 'product-media');

create policy product_media_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-media'
  and exists (
    select 1
    from public.products product
    join public.categories category on category.id = product.category_id
    where product.id = ((storage.foldername(name))[2])::uuid
      and public.has_product_permission('edit_product_media', category.city_id)
  )
);
