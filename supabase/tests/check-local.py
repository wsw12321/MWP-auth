#!/usr/bin/env python3
"""Run SQL/RLS assertions in disposable PostgreSQL; this is not Supabase integration."""
import subprocess
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGE = "postgres:17.6-alpine3.22"
NAME = "water5-auth-rls-" + uuid.uuid4().hex[:12]

# Only the interfaces consumed by the migration are modeled. Storage MIME/size
# checks, Auth HTTP, email delivery and real Supabase schema remain integration tests.
SCHEMA = """
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
grant usage on schema auth, storage to anon, authenticated;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
 select (auth.jwt()->>'sub')::uuid
$$;
create table storage.buckets (
 id text primary key, name text not null, public boolean not null default false,
 file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
 id uuid primary key default gen_random_uuid(),
 bucket_id text references storage.buckets(id), name text not null
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
$$;
"""


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, capture_output=True, **kwargs)


def sql(statement):
    return run(["docker", "exec", "-i", NAME, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], input=statement)


def main():
    try:
        # No published port, host mounts, network, persistent volume or image pull.
        run(["docker", "run", "--pull=never", "--rm", "-d", "--name", NAME,
             "--network", "none", "-e", "POSTGRES_PASSWORD=local-disposable-validation",
             "--tmpfs", "/var/lib/postgresql/data", IMAGE])
        for _ in range(80):
            ready = subprocess.run(["docker", "exec", NAME, "pg_isready", "-U", "postgres"], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("PostgreSQL did not become ready within 20 seconds")
        sql(SCHEMA)
        sql((ROOT / "supabase/migrations/202610020001_accounts.sql").read_text())
        assertions = (ROOT / "supabase/tests/permissions.sql").read_text()
        sql(assertions)
        print("Migration and permission assertions: PASS")
        sql("create policy unrelated_broad_policy on storage.objects for all to anon, authenticated using (true) with check (true);")
        sql(assertions)
        print("Restrictive guards with a broad existing permissive policy: PASS")
    except subprocess.CalledProcessError as error:
        print(error.stdout or "", file=sys.stderr)
        print(error.stderr or "", file=sys.stderr)
        raise
    finally:
        subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)


if __name__ == "__main__":
    main()
