-- Hodnocení aplikací v Uniboxu (1–5 hvězdiček).
--
-- Pravidla:
--  - hodnotit může jen přihlášený uživatel, 1 uživatel = 1 hlas na aplikaci
--    (další hodnocení stejné aplikace hlas přepíše),
--  - jednotlivé hlasy vidí jen jejich autor (Row Level Security),
--  - souhrn (průměr, počet, rozložení hvězdiček) je veřejný – funkce
--    rating_summaries() nevrací user_id, jen součty.
--
-- Spuštění: Supabase → SQL Editor → vložit celý soubor → Run
-- (nebo `supabase db push`, pokud používáte Supabase CLI).

create table public.ratings (
  -- id aplikace z katalogu Uniboxu („mozilla-firefox“) nebo „zdroj:id balíčku“
  app_id     text        not null check (app_id ~ '^[A-Za-z0-9][A-Za-z0-9:._+/\-]{0,199}$'),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  rating     smallint    not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_id, user_id)
);

comment on table public.ratings is 'Hodnocení aplikací v Uniboxu: 1 uživatel = 1 hlas na aplikaci.';

-- Vlastní hlasy uživatele (výpis „moje hodnocení“)
create index ratings_user_id_idx on public.ratings (user_id);

alter table public.ratings enable row level security;

-- Každý vidí a mění jen svůj hlas; anonymní uživatel nevidí žádný
create policy "ratings: vlastní hlas – čtení" on public.ratings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ratings: vlastní hlas – vložení" on public.ratings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ratings: vlastní hlas – změna" on public.ratings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ratings: vlastní hlas – smazání" on public.ratings
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ratings to authenticated;

-- Čas poslední změny hlasu
create function public.ratings_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Původní čas vytvoření a autora hlasu změnit nejde
  new.created_at := old.created_at;
  new.user_id := old.user_id;
  return new;
end;
$$;

create trigger ratings_touch_updated_at
  before update on public.ratings
  for each row execute function public.ratings_touch_updated_at();

-- Veřejný souhrn hodnocení: všech aplikací (p_app_id = null), nebo jedné.
-- security definer = funkce sečte i cizí hlasy, ale ven pustí jen součty.
create function public.rating_summaries(p_app_id text default null)
returns table (
  app_id  text,
  average numeric,
  count   integer,
  stars1  integer,
  stars2  integer,
  stars3  integer,
  stars4  integer,
  stars5  integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.app_id,
    round(avg(r.rating), 2),
    count(*)::integer,
    (count(*) filter (where r.rating = 1))::integer,
    (count(*) filter (where r.rating = 2))::integer,
    (count(*) filter (where r.rating = 3))::integer,
    (count(*) filter (where r.rating = 4))::integer,
    (count(*) filter (where r.rating = 5))::integer
  from public.ratings r
  where p_app_id is null or r.app_id = p_app_id
  group by r.app_id;
$$;

revoke execute on function public.rating_summaries(text) from public;
grant execute on function public.rating_summaries(text) to anon, authenticated;
