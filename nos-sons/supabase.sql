-- ============================================================
--  Nos sons : base de données
--  À coller dans Supabase > SQL Editor > New query, puis "Run".
--  Le script peut être relancé sans risque.
-- ============================================================

-- Profils : un par personne (prénom + couleur)
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null check (char_length(name) between 1 and 30),
  color      text not null default '#3B5BFF',
  created_at timestamptz not null default now()
);

-- Sons : un par personne et par jour
create table if not exists public.songs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day         date not null,
  spotify_url text not null,
  title       text,
  cover_url   text,
  note        text check (note is null or char_length(note) <= 280),
  photo_path  text,
  created_at  timestamptz not null default now(),
  unique (user_id, day)
);

-- Sécurité : seules les personnes connectées lisent,
-- et chacun ne peut modifier que ses propres données.
alter table public.profiles enable row level security;
alter table public.songs    enable row level security;

drop policy if exists "profils lisibles"    on public.profiles;
drop policy if exists "créer son profil"    on public.profiles;
drop policy if exists "modifier son profil" on public.profiles;
create policy "profils lisibles"    on public.profiles for select to authenticated using (true);
create policy "créer son profil"    on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "modifier son profil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "sons lisibles"     on public.songs;
drop policy if exists "ajouter son son"   on public.songs;
drop policy if exists "modifier son son"  on public.songs;
drop policy if exists "supprimer son son" on public.songs;
create policy "sons lisibles"     on public.songs for select to authenticated using (true);
create policy "ajouter son son"   on public.songs for insert to authenticated with check (user_id = auth.uid());
create policy "modifier son son"  on public.songs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "supprimer son son" on public.songs for delete to authenticated using (user_id = auth.uid());

-- Photos : dossier privé "photos", un sous-dossier par personne
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos lisibles"     on storage.objects;
drop policy if exists "ajouter ses photos"  on storage.objects;
drop policy if exists "modifier ses photos" on storage.objects;
drop policy if exists "supprimer ses photos" on storage.objects;
create policy "photos lisibles" on storage.objects for select to authenticated
  using (bucket_id = 'photos');
create policy "ajouter ses photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "modifier ses photos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "supprimer ses photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
