begin;

update public.product_media
set public_url = 'https://kfhuzqohwtvcmybguvrs.supabase.co/storage/v1/object/public/product-media/' || storage_path
where storage_path is not null;

commit;
