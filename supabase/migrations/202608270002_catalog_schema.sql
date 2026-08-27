create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name extensions.citext not null unique,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (position)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  icon text,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, position)
);

create index categories_city_id_idx on public.categories(city_id);

create table public.category_translations (
  category_id uuid not null references public.categories(id) on delete cascade,
  language public.content_language not null,
  title text not null check (btrim(title) <> ''),
  is_source boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_id, language)
);

create index category_translations_title_idx on public.category_translations(language, title);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  coordinates text,
  storage_weight text,
  import_key text,
  sold boolean not null default false,
  buyer_name text,
  buyer_discord_id text,
  sold_at timestamptz,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, position),
  unique (category_id, import_key)
);

create index products_category_id_idx on public.products(category_id);
create index products_sold_idx on public.products(category_id, sold);
create index products_created_at_idx on public.products(created_at);

create table public.product_translations (
  product_id uuid not null references public.products(id) on delete cascade,
  language public.content_language not null,
  name text not null check (btrim(name) <> ''),
  description_html text not null default '',
  is_source boolean not null default false,
  translation_status public.translation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, language)
);

create index product_translations_name_idx on public.product_translations(language, name);
create index product_translations_status_idx on public.product_translations(translation_status);

create table public.product_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  currency public.currency_code not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, currency)
);

create index product_prices_currency_amount_idx on public.product_prices(currency, amount);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  media_type public.media_type not null,
  storage_path text,
  public_url text,
  thumbnail_path text,
  video_provider text,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, position),
  check (storage_path is not null or public_url is not null)
);

create index product_media_product_id_idx on public.product_media(product_id);

create table public.description_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  position integer not null check (position >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, position),
  unique (category_id, name)
);

create index description_templates_category_id_idx on public.description_templates(category_id);

create table public.description_template_translations (
  template_id uuid not null references public.description_templates(id) on delete cascade,
  language public.content_language not null,
  html text not null default '',
  is_source boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (template_id, language)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cities', 'categories', 'category_translations', 'products',
    'product_translations', 'product_prices', 'product_media',
    'description_templates', 'description_template_translations'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;
