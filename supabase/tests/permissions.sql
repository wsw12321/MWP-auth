-- Run against a DISPOSABLE development Supabase database, as postgres.
-- psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/permissions.sql
-- All fixtures and mutations are rolled back. No Storage API bytes are written.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-a000-000000000001', 'rls-a@example.invalid',
   '{"display_name":"用户甲","name":"用户甲","full_name":"用户甲"}'),
  ('00000000-0000-4000-a000-000000000002', 'rls-b@example.invalid',
   '{"display_name":"用户乙"}');

do $$
begin
  if (select display_name from public.profiles where id = '00000000-0000-4000-a000-000000000001') <> '用户甲' then
    raise exception 'FAIL: insert trigger did not create profile';
  end if;
end $$;

update auth.users set raw_user_meta_data =
  '{"display_name":"新昵称","name":"新昵称","full_name":"新昵称","avatar_url":"https://example.invalid/avatar.png","picture":"https://example.invalid/avatar.png"}'
where id = '00000000-0000-4000-a000-000000000001';
do $$
begin
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-000000000001'
    and display_name = '新昵称' and avatar_url = 'https://example.invalid/avatar.png') then
    raise exception 'FAIL: metadata update did not synchronize';
  end if;
  begin
    update auth.users set raw_user_meta_data = '{"avatar_url":"javascript:alert(1)"}'
    where id = '00000000-0000-4000-a000-000000000001';
    raise exception 'FAIL: invalid metadata was accepted';
  exception when check_violation then null;
  end;
  begin
    update auth.users set raw_user_meta_data = '{"display_name":123}'
    where id = '00000000-0000-4000-a000-000000000001';
    raise exception 'FAIL: non-string display metadata was accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select raw_user_meta_data ->> 'display_name' from auth.users
      where id = '00000000-0000-4000-a000-000000000001') <> '新昵称' then
    raise exception 'FAIL: failed profile sync did not roll back auth metadata';
  end if;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.profiles;
    raise exception 'FAIL: anonymous profile read succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', '00000000-0000-4000-a000-000000000001/anonymous.png');
    raise exception 'FAIL: anonymous avatar insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FAIL: authenticated user can read other users or cannot read self';
  end if;
  begin
    update public.profiles set display_name = '绕过 metadata';
    raise exception 'FAIL: direct profile write succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.profiles (id, display_name)
    values ('00000000-0000-4000-a000-000000000001', '直接写入');
    raise exception 'FAIL: direct profile insert succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.profiles;
    raise exception 'FAIL: direct profile delete succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', '00000000-0000-4000-a000-000000000002/forbidden.png');
    raise exception 'FAIL: cross-user avatar insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into storage.objects (bucket_id, name)
values ('avatars', '00000000-0000-4000-a000-000000000001/own.png');

do $$
begin
  begin
    update storage.objects set name = '00000000-0000-4000-a000-000000000002/stolen.png'
    where bucket_id = 'avatars' and name = '00000000-0000-4000-a000-000000000001/own.png';
    raise exception 'FAIL: moving avatar to other user folder succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
do $$
declare affected integer;
begin
  delete from storage.objects where bucket_id = 'avatars'
    and name = '00000000-0000-4000-a000-000000000001/own.png';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: cross-user delete succeeded'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated","client_id":"test-oauth-client"}', true);
do $$
declare affected integer;
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('avatars', '00000000-0000-4000-a000-000000000001/oauth.png');
    raise exception 'FAIL: OAuth avatar insert succeeded';
  exception when insufficient_privilege then null;
  end;
  delete from storage.objects where bucket_id = 'avatars'
    and name = '00000000-0000-4000-a000-000000000001/own.png';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: OAuth avatar delete succeeded'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
do $$
declare affected integer;
begin
  delete from storage.objects where bucket_id = 'avatars'
    and name = '00000000-0000-4000-a000-000000000001/own.png';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner avatar delete failed'; end if;
end $$;

reset role;
rollback;
-- Reaching this line with ON_ERROR_STOP means every assertion passed.
