-- ============================================================
-- best pic : 전체 SQL (Supabase → SQL Editor 에 통째로 붙여 넣고 Run)
-- 여러 번 실행해도 안전합니다.
-- ============================================================

-- ---------- 1) 회원 정보 (profiles) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null,
  status     text not null default 'pending',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint profiles_nickname_check check (nickname ~ '^[0-9A-Za-z_가-힣]{2,10}$')
);

create unique index if not exists profiles_nickname_key on public.profiles (nickname);
create unique index if not exists profiles_nickname_lower_key on public.profiles (lower(nickname));

-- ---------- 2) 도우미 함수 (RLS 안에서 안전하게 내 상태를 확인) ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- ---------- 3) 가입하면 자동으로 profiles 한 줄 만들기 ----------
-- 가입 때 무슨 값을 보내든 status 는 항상 'pending', is_admin 은 항상 false 입니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, status, is_admin)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nickname', ''), 'pending', false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 4) profiles 보안 (RLS) ----------
alter table public.profiles enable row level security;

-- 직접 수정/추가/삭제는 아무도(관리자도) 못 하게 막고, 아래 함수로만 바꿉니다.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_select_approved" on public.profiles;
create policy "profiles_select_approved" on public.profiles
  for select to authenticated
  using (status = 'approved' and public.is_approved());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using (public.is_admin());

-- ---------- 5) 관리자 전용 함수 (승인 / 거절 / 삭제) ----------
create or replace function public.admin_set_status(target uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if new_status not in ('pending', 'approved', 'rejected') then
    raise exception 'bad status';
  end if;
  if target = auth.uid() then
    raise exception 'cannot change yourself';
  end if;
  update public.profiles set status = new_status where id = target;
end;
$$;

create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if target = auth.uid() then
    raise exception 'cannot delete yourself';
  end if;
  delete from auth.users where id = target; -- profiles, photos 행도 함께 지워집니다
end;
$$;

revoke all on function public.admin_set_status(uuid, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved() to authenticated;

-- ---------- 6) 사진 목록 (photos) ----------
create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path       text not null,
  caption    text check (caption is null or char_length(caption) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists photos_created_at_idx on public.photos (created_at desc);
create index if not exists photos_user_id_idx on public.photos (user_id);

alter table public.photos enable row level security;

drop policy if exists "photos_select_approved" on public.photos;
create policy "photos_select_approved" on public.photos
  for select to authenticated
  using (public.is_approved());

drop policy if exists "photos_insert_own" on public.photos;
create policy "photos_insert_own" on public.photos
  for insert to authenticated
  with check (
    public.is_approved()
    and user_id = auth.uid()
    and path like auth.uid()::text || '/%'
  );

-- 사진 삭제는 관리자만 가능 (예전 정책이 있으면 지워요)
drop policy if exists "photos_delete_own" on public.photos;
drop policy if exists "photos_delete_admin" on public.photos;
create policy "photos_delete_admin" on public.photos
  for delete to authenticated
  using (public.is_admin());

-- ---------- 6-2) 댓글 (comments) ----------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  photo_id   uuid not null references public.photos (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists comments_photo_idx on public.comments (photo_id, created_at);

alter table public.comments enable row level security;

drop policy if exists "comments_select_approved" on public.comments;
create policy "comments_select_approved" on public.comments
  for select to authenticated
  using (public.is_approved());

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
  for insert to authenticated
  with check (public.is_approved() and user_id = auth.uid());

-- 댓글은 쓴 사람 본인 또는 관리자가 지울 수 있어요
drop policy if exists "comments_delete_own_or_admin" on public.comments;
create policy "comments_delete_own_or_admin" on public.comments
  for delete to authenticated
  using ((user_id = auth.uid() and public.is_approved()) or public.is_admin());

-- ---------- 6-3) 하트 (likes) : 한 사람이 한 사진에 하트 한 번 ----------
create table if not exists public.likes (
  photo_id   uuid not null references public.photos (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

alter table public.likes enable row level security;

drop policy if exists "likes_select_approved" on public.likes;
create policy "likes_select_approved" on public.likes
  for select to authenticated
  using (public.is_approved());

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes
  for insert to authenticated
  with check (public.is_approved() and user_id = auth.uid());

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------- 7) 사진 보관함 (Storage 버킷 'photos', 비공개) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "photos_bucket_select" on storage.objects;
create policy "photos_bucket_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_approved());

drop policy if exists "photos_bucket_insert" on storage.objects;
create policy "photos_bucket_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and public.is_approved()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_bucket_delete" on storage.objects;
create policy "photos_bucket_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and public.is_approved()
    and (
      public.is_admin()
      -- 올리다 실패한 내 파일(사진 목록에 아직 없는 것)만 본인이 정리할 수 있어요
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not exists (select 1 from public.photos p where p.path = name)
      )
    )
  );

-- ---------- 8) 대폴더 (albums) + 날짜 폴더 배치 (album_days) ----------
-- 대폴더 제목은 관리자가 정하고, 날짜 폴더를 어느 대폴더에 넣을지도 관리자가 옮깁니다.
create table if not exists public.albums (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 30),
  created_at timestamptz not null default now()
);

create table if not exists public.album_days (
  day      text primary key check (day ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$'),
  album_id uuid references public.albums (id) on delete set null
);

alter table public.albums enable row level security;
alter table public.album_days enable row level security;

drop policy if exists "albums_select_approved" on public.albums;
create policy "albums_select_approved" on public.albums
  for select to authenticated using (public.is_approved());

drop policy if exists "albums_admin_write" on public.albums;
create policy "albums_admin_write" on public.albums
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "album_days_select_approved" on public.album_days;
create policy "album_days_select_approved" on public.album_days
  for select to authenticated using (public.is_approved());

drop policy if exists "album_days_admin_write" on public.album_days;
create policy "album_days_admin_write" on public.album_days
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 끝! 첫 관리자는 가입을 한 뒤 아래 한 줄을 (닉네임만 바꿔서) 실행하세요.
--
--   update public.profiles set is_admin = true, status = 'approved' where nickname = '내닉네임';
-- ============================================================
