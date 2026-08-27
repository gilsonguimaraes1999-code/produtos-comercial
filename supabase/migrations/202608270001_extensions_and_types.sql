create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.content_language as enum ('pt', 'en', 'es');
create type public.currency_code as enum ('BRL', 'USD', 'EUR');
create type public.user_role as enum ('owner', 'commercial');
create type public.profile_status as enum ('pending_activation', 'active', 'disabled');
create type public.access_request_status as enum ('pending', 'approved', 'rejected', 'removed');
create type public.translation_status as enum ('source', 'pending', 'translated', 'failed', 'reviewed');
create type public.media_type as enum ('image', 'video');
create type public.job_status as enum ('pending', 'running', 'completed', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
