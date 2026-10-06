-- ============================================================
--  Nos sons : notifications
--  AVANT de lancer ce script, remplace à 3 endroits :
--    TON_PROJET   -> l'identifiant de ton projet (le "abcdefgh" de https://abcdefgh.supabase.co)
--    TON_SECRET   -> le NOTIFY_SECRET généré avec tools/cles.html
--  Puis colle-le dans SQL Editor > New query > Run.
--  Le script peut être relancé sans risque.
-- ============================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Les appareils où les notifications sont activées
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists "voir ses appareils"      on public.push_subscriptions;
drop policy if exists "ajouter ses appareils"   on public.push_subscriptions;
drop policy if exists "modifier ses appareils"  on public.push_subscriptions;
drop policy if exists "supprimer ses appareils" on public.push_subscriptions;
create policy "voir ses appareils"      on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "ajouter ses appareils"   on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "modifier ses appareils"  on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "supprimer ses appareils" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- 1) Quand un son est posté : prévenir l'autre
create or replace function public.notify_new_song()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://TON_PROJET.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', 'TON_SECRET'),
    body    := jsonb_build_object('type', 'new_song', 'song_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists songs_notify on public.songs;
create trigger songs_notify
  after insert on public.songs
  for each row execute function public.notify_new_song();

-- 2) Rappel du soir : vérifié toutes les heures, envoyé à 20h (heure de Paris)
select cron.schedule(
  'rappel-son-du-jour',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://TON_PROJET.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json", "x-notify-secret": "TON_SECRET"}'::jsonb,
    body    := '{"type": "reminder"}'::jsonb
  );
  $$
);
