-- ============================================================================
-- Moview Community Schema (Supabase Auth + Postgres + Row Level Security)
-- Run this entire file once in your Supabase Dashboard -> SQL Editor.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Tables & Constraints
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-zA-Z0-9_]{3,20}$'
  ),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) <= 60
  ),
  constraint profiles_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 500
  ),
  constraint profiles_bio_length check (
    char_length(bio) <= 160
  )
);

create unique index if not exists idx_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.user_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id integer not null check (tmdb_id > 0),
  media_type text not null check (media_type in ('movie', 'tv')),
  rating integer not null check (rating between 1 and 5),
  review_text text,
  has_spoilers boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reviews_text_length check (
    review_text is null or char_length(review_text) <= 2000
  ),
  constraint user_reviews_unique_user_title unique (user_id, tmdb_id, media_type)
);

create index if not exists idx_user_reviews_title
  on public.user_reviews (tmdb_id, media_type, is_hidden, created_at desc);

create index if not exists idx_user_reviews_user_created
  on public.user_reviews (user_id, created_at desc);

create table if not exists public.review_votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_id uuid not null references public.user_reviews(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);

create index if not exists idx_review_votes_review
  on public.review_votes (review_id);

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.user_reviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  constraint review_reports_unique_reporter unique (review_id, reporter_id)
);

create index if not exists idx_review_reports_created
  on public.review_reports (created_at desc);

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id integer not null check (tmdb_id > 0),
  media_type text not null check (media_type in ('movie', 'tv')),
  status text not null check (status in ('watched', 'want_to_watch', 'maybe_later')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  poster_path text check (poster_path is null or char_length(poster_path) <= 200),
  updated_at timestamptz not null default now(),
  constraint watchlist_unique_user_title unique (user_id, tmdb_id, media_type)
);

create index if not exists idx_watchlist_user_status
  on public.watchlist (user_id, status, updated_at desc);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null check (tmdb_id > 0),
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint review_requests_unique_user_title unique (user_id, tmdb_id, media_type)
);

create index if not exists idx_review_requests_title
  on public.review_requests (tmdb_id, media_type, created_at desc);

-- ----------------------------------------------------------------------------
-- 2. Helper Functions & Triggers
-- ----------------------------------------------------------------------------

-- Safe admin check (avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

-- Automatically create a profile row on first sign-in
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_name text;
  raw_avatar text;
begin
  raw_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Moview Reader'
  );
  raw_avatar := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
  );

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    null,
    left(raw_name, 60),
    left(raw_avatar, 500)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent authenticated users from setting or elevating their own is_admin flag
create or replace function public.protect_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_admin = true and auth.uid() is not null then
      raise exception 'You are not permitted to assign admin privileges.';
    end if;
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'You are not permitted to modify admin privileges.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_admin_flag on public.profiles;
create trigger trg_protect_profile_admin_flag
  before insert or update on public.profiles
  for each row execute function public.protect_profile_admin_flag();

-- Enforce max 10 reviews per hour per user
create or replace function public.enforce_review_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  select count(*)
  into recent_count
  from public.user_reviews
  where user_id = new.user_id
    and created_at > now() - interval '1 hour';

  if recent_count >= 10 then
    raise exception 'Rate limit exceeded: you can post at most 10 reviews per hour.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_review_rate_limit on public.user_reviews;
create trigger trg_enforce_review_rate_limit
  before insert on public.user_reviews
  for each row execute function public.enforce_review_rate_limit();

-- Keep updated_at current and restrict is_hidden changes to admins
create or replace function public.protect_and_timestamp_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_hidden = true and not public.is_admin() then
      raise exception 'Only admins can create hidden reviews.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_hidden is distinct from old.is_hidden and not public.is_admin() then
      raise exception 'Only admins can moderate hidden reviews.';
    end if;
    new.updated_at := now();
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_and_timestamp_review on public.user_reviews;
create trigger trg_protect_and_timestamp_review
  before insert or update on public.user_reviews
  for each row execute function public.protect_and_timestamp_review();

-- Keep watchlist.updated_at current
create or replace function public.touch_watchlist_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_watchlist_updated_at on public.watchlist;
create trigger trg_touch_watchlist_updated_at
  before insert or update on public.watchlist
  for each row execute function public.touch_watchlist_updated_at();

-- Paginated & sorted review feed RPC (runs as SECURITY INVOKER so RLS applies)
create or replace function public.get_reviews_page(
  p_tmdb_id integer,
  p_media_type text,
  p_sort text default 'helpful',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  tmdb_id integer,
  media_type text,
  rating integer,
  review_text text,
  has_spoilers boolean,
  created_at timestamptz,
  updated_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  helpful_count integer,
  viewer_has_voted boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.user_id,
    r.tmdb_id,
    r.media_type,
    r.rating,
    r.review_text,
    r.has_spoilers,
    r.created_at,
    r.updated_at,
    p.username,
    p.display_name,
    p.avatar_url,
    (select count(*)::int from public.review_votes rv where rv.review_id = r.id) as helpful_count,
    exists (
      select 1
      from public.review_votes rv2
      where rv2.review_id = r.id
        and rv2.user_id = auth.uid()
    ) as viewer_has_voted
  from public.user_reviews r
  join public.profiles p on p.id = r.user_id
  where r.tmdb_id = p_tmdb_id
    and r.media_type = p_media_type
    and r.is_hidden = false
  order by
    case when p_sort = 'helpful' then (select count(*) from public.review_votes rv3 where rv3.review_id = r.id) else 0 end desc,
    r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- Full self-service account deletion RPC (wipes auth.users and cascades)
create or replace function public.delete_user_self()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users
  where id = auth.uid();
end;
$$;

revoke execute on function public.delete_user_self() from public;
revoke execute on function public.delete_user_self() from anon;
grant execute on function public.delete_user_self() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (RLS)
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_reviews enable row level security;
alter table public.review_votes enable row level security;
alter table public.review_reports enable row level security;
alter table public.watchlist enable row level security;

-- profiles policies
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and is_admin = false);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- user_reviews policies
drop policy if exists "Public can read non-hidden reviews" on public.user_reviews;
create policy "Public can read non-hidden reviews"
  on public.user_reviews for select
  using (is_hidden = false or public.is_admin());

drop policy if exists "Users can insert own review" on public.user_reviews;
create policy "Users can insert own review"
  on public.user_reviews for insert
  to authenticated
  with check (auth.uid() = user_id and is_hidden = false);

drop policy if exists "Users or admins can update reviews" on public.user_reviews;
create policy "Users or admins can update reviews"
  on public.user_reviews for update
  to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users or admins can delete reviews" on public.user_reviews;
create policy "Users or admins can delete reviews"
  on public.user_reviews for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- review_votes policies
drop policy if exists "Vote counts are viewable by everyone" on public.review_votes;
create policy "Vote counts are viewable by everyone"
  on public.review_votes for select
  using (true);

drop policy if exists "Users can insert own votes" on public.review_votes;
create policy "Users can insert own votes"
  on public.review_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own votes" on public.review_votes;
create policy "Users can delete own votes"
  on public.review_votes for delete
  to authenticated
  using (auth.uid() = user_id);

-- review_reports policies
drop policy if exists "Only admins can view reports" on public.review_reports;
create policy "Only admins can view reports"
  on public.review_reports for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Users can insert reports" on public.review_reports;
create policy "Users can insert reports"
  on public.review_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "Only admins can delete reports" on public.review_reports;
create policy "Only admins can delete reports"
  on public.review_reports for delete
  to authenticated
  using (public.is_admin());

-- watchlist policies
drop policy if exists "Watchlists are viewable by everyone" on public.watchlist;
create policy "Watchlists are viewable by everyone"
  on public.watchlist for select
  using (true);

drop policy if exists "Users can insert own watchlist items" on public.watchlist;
create policy "Users can insert own watchlist items"
  on public.watchlist for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own watchlist items" on public.watchlist;
create policy "Users can update own watchlist items"
  on public.watchlist for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own watchlist items" on public.watchlist;
create policy "Users can delete own watchlist items"
  on public.watchlist for delete
  to authenticated
  using (auth.uid() = user_id);

-- review_requests policies
alter table public.review_requests enable row level security;

drop policy if exists "Admins or requesters can view review requests" on public.review_requests;
create policy "Admins or requesters can view review requests"
  on public.review_requests for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Signed-in users can insert review requests" on public.review_requests;
create policy "Signed-in users can insert review requests"
  on public.review_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Only admins can delete review requests" on public.review_requests;
create policy "Only admins can delete review requests"
  on public.review_requests for delete
  to authenticated
  using (public.is_admin());
