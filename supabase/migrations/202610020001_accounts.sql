-- Apply once through Supabase migrations or the SQL editor as the project owner.
-- Auth metadata is the only write source for display-only profile data.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 64),
  avatar_url text check (
    avatar_url is null or (
      char_length(avatar_url) <= 2048 and avatar_url ~ '^https?://[^[:space:]]+$'
    )
  ),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Display-only projection of auth.users metadata; never use for authorization.';
alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
create policy profiles_read_self on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create function public.sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  field_name text;
  profile_name text;
  profile_avatar text;
begin
  -- Reject malformed display fields instead of silently reporting success.
  foreach field_name in array array['display_name', 'name', 'full_name', 'avatar_url', 'picture']
  loop
    if metadata ? field_name
      and jsonb_typeof(metadata -> field_name) not in ('string', 'null') then
      raise exception 'Invalid display metadata field: %', field_name
        using errcode = '22023';
    end if;
  end loop;

  profile_name := coalesce(
    nullif(btrim(metadata ->> 'display_name'), ''),
    nullif(btrim(metadata ->> 'name'), ''),
    nullif(btrim(metadata ->> 'full_name'), ''),
    ''
  );
  profile_avatar := coalesce(
    nullif(btrim(metadata ->> 'avatar_url'), ''),
    nullif(btrim(metadata ->> 'picture'), '')
  );

  insert into public.profiles (id, display_name, avatar_url, updated_at)
  values (new.id, profile_name, profile_avatar, pg_catalog.now())
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = excluded.updated_at;
  -- No exception handler: constraint / write failure must roll back Auth update.
  return new;
end;
$$;

-- No browser role may call or replace this privileged trigger function.
revoke all on function public.sync_auth_profile() from public, anon, authenticated;
create trigger sync_profile_on_auth_insert
  after insert on auth.users
  for each row execute function public.sync_auth_profile();
create trigger sync_profile_on_auth_metadata_update
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.sync_auth_profile();

-- Existing accounts are validated by the same table constraints during backfill.
insert into public.profiles (id, display_name, avatar_url)
select id,
  coalesce(
    nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(raw_user_meta_data ->> 'full_name'), ''), ''
  ),
  coalesce(
    nullif(btrim(raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(raw_user_meta_data ->> 'picture'), '')
  )
from auth.users;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket downloads do not need a SELECT policy. This permits owner-only
-- listing / mutation checks. OAuth access tokens cannot mutate account avatars.
create policy avatars_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy avatars_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy avatars_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt() ->> 'client_id') is null
  ) with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy avatars_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt() ->> 'client_id') is null
  );

-- Restrictive guards prevent a broader existing permissive Storage policy from
-- accidentally bypassing the avatar write rules. Other buckets are unaffected.
create policy avatars_insert_guard on storage.objects as restrictive
  for insert to public with check (
    bucket_id <> 'avatars' or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and (select auth.jwt() ->> 'client_id') is null
    )
  );
create policy avatars_update_guard on storage.objects as restrictive
  for update to public using (
    bucket_id <> 'avatars' or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and (select auth.jwt() ->> 'client_id') is null
    )
  ) with check (
    bucket_id <> 'avatars' or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and (select auth.jwt() ->> 'client_id') is null
    )
  );
create policy avatars_delete_guard on storage.objects as restrictive
  for delete to public using (
    bucket_id <> 'avatars' or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and (select auth.jwt() ->> 'client_id') is null
    )
  );

commit;
