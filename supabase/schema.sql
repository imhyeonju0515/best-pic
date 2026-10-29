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

drop policy if exists "photos_delete_own" on public.photos;
create policy "photos_delete_own" on public.photos
  for delete to authenticated
  using ((user_id = auth.uid() and public.is_approved()) or public.is_admin());

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
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ============================================================
-- 끝! 첫 관리자는 가입을 한 뒤 아래 한 줄을 (닉네임만 바꿔서) 실행하세요.
--
--   update public.profiles set is_admin = true, status = 'approved' where nickname = '내닉네임';
-- ============================================================
