-- Squadlore_Travel_Proj — core MVP schema
-- Run this in the Supabase SQL editor, or via `supabase db push`.
-- Written in plain Postgres/PostGIS so it stays portable if we ever
-- migrate off Supabase to self-hosted Postgres.

create extension if not exists postgis;
create extension if not exists "uuid-ossp";

create table users (
  id uuid primary key default uuid_generate_v4(),
  phone_number text unique not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table packs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  icon text,
  color text,
  creator_id uuid not null references users(id),
  is_persistent boolean not null default true,
  created_at timestamptz not null default now()
);

create table pack_members (
  pack_id uuid not null references packs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'paused', 'offline')),
  joined_at timestamptz not null default now(),
  primary key (pack_id, user_id)
);

-- MVP soft cap: enforced in the API layer (PackService), not the DB,
-- so the limit is easy to change without a migration.

create table trips (
  id uuid primary key default uuid_generate_v4(),
  pack_id uuid not null references packs(id) on delete cascade,
  name text not null,
  discussion_location text,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table location_pings (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  geom geography(Point, 4326) not null,
  captured_at timestamptz not null,
  synced_at timestamptz not null default now(),
  source text not null default 'live' check (source in ('live', 'store_and_forward'))
);

-- This will be the highest write-volume table by far.
-- Index for route reconstruction queries (by trip, ordered by time):
create index idx_location_pings_trip_time on location_pings (trip_id, captured_at);
-- Spatial index, useful later for "who's near who" queries:
create index idx_location_pings_geom on location_pings using gist (geom);

create table media (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  url text not null,
  original_url text not null,
  is_private boolean not null default false,
  edited boolean not null default false,
  lat double precision,
  lng double precision,
  captured_at timestamptz not null,
  uploaded_at timestamptz not null default now()
);

create table media_reactions (
  id uuid primary key default uuid_generate_v4(),
  media_id uuid not null references media(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (media_id, user_id)
);

create table media_tags (
  media_id uuid not null references media(id) on delete cascade,
  tagged_user_id uuid references users(id) on delete cascade,
  place_name text,
  place_lat double precision,
  place_lng double precision
);

create table comments (
  id uuid primary key default uuid_generate_v4(),
  media_id uuid not null references media(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  reactivated_from_memory boolean not null default false,
  created_at timestamptz not null default now()
);

-- Helper functions: these return plain lat/lng doubles instead of
-- PostGIS geometry objects, so the API layer never has to deal with
-- WKB/GeoJSON parsing quirks. Keep the geometry math in the database,
-- keep the API layer simple.

create or replace function get_route_for_trip(p_trip_id uuid)
returns table (user_id uuid, lat double precision, lng double precision, captured_at timestamptz, source text)
language sql stable as $$
  select user_id, st_y(geom::geometry) as lat, st_x(geom::geometry) as lng, captured_at, source
  from location_pings
  where trip_id = p_trip_id
  order by captured_at asc;
$$;

create or replace function latest_ping_per_user(p_trip_id uuid)
returns table (user_id uuid, lat double precision, lng double precision, captured_at timestamptz)
language sql stable as $$
  select distinct on (user_id) user_id, st_y(geom::geometry) as lat, st_x(geom::geometry) as lng, captured_at
  from location_pings
  where trip_id = p_trip_id
  order by user_id, captured_at desc;
$$;

-- MVP version: exact member-set match only. Can be made fuzzier
-- (majority overlap) once real usage shows what "the same group" means in practice.
create or replace function find_pack_by_exact_members(member_ids uuid[])
returns table (id uuid, name text)
language sql stable as $$
  select p.id, p.name
  from packs p
  where (
    select array_agg(pm.user_id order by pm.user_id)
    from pack_members pm
    where pm.pack_id = p.id
  ) = (select array_agg(x order by x) from unnest(member_ids) as x)
  limit 1;
$$;
