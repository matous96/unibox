-- Synchronizace mezi počítači: data účtu uživatele Uniboxu.
--
-- Jeden řádek = jedna oblast dat uživatele (předvolby, oblíbené, sada balíčků,
-- předvolby oznámení) jako objekt JSON. Aplikace změny slučuje sama (3cestné
-- sloučení podle posledního synchronizovaného stavu – src/lib/syncMerge.ts),
-- databáze jen hlídá:
--  - data vidí a mění jen jejich vlastník (Row Level Security), anonym nic,
--  - číslo revize zvyšuje databáze (trigger) – zápis s podmínkou na revizi
--    odhalí souběžnou změnu z jiného počítače (aplikace pak sloučí znovu),
--  - velikost jednoho záznamu je omezená (256 kB), oblasti jsou pevně dané.
-- Bezpečnostní volby (vlastní příkazy instalace, oprávnění) se nesynchronizují.
--
-- Spuštění: Supabase → SQL Editor → vložit celý soubor → Run
-- (nebo `supabase db push`, pokud používáte Supabase CLI).

create table public.user_data (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('settings', 'favorites', 'bundle', 'notifications')),
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  revision   integer     not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

comment on table public.user_data is 'Data účtu pro synchronizaci Uniboxu mezi počítači: 1 řádek = 1 oblast (JSON).';

alter table public.user_data enable row level security;

create policy "user_data: vlastní – čtení" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_data: vlastní – vložení" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_data: vlastní – změna" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data: vlastní – smazání" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_data to authenticated;

-- Revizi a čas změny určuje databáze, ne klient; vlastníka ani oblast změnit nejde
create function public.user_data_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
    new.user_id := old.user_id;
    new.kind := old.kind;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_data_revision
  before insert or update on public.user_data
  for each row execute function public.user_data_revision();
