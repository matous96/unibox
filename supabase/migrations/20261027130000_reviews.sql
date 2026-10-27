-- Textové recenze aplikací v Uniboxu (k hodnocení hvězdičkami – tabulka ratings).
--
-- Pravidla:
--  - recenze = nadpis a text u vlastního hlasu (1 uživatel = 1 recenze u aplikace),
--    jde upravit i smazat (text zmizí, hvězdičky zůstanou),
--  - jméno autora doplní databáze z přihlášení (GitHub / Google) – klient ho
--    zapsat nemůže, stejně jako příznak skrytí (oprávnění na sloupce). Bere se
--    z auth.identities (údaje od poskytovatele), ne z user_metadata – ta si
--    přihlášený uživatel může přepsat sám (auth.updateUser),
--  - recenze jsou veřejné přes funkci app_reviews() – bez user_id,
--  - nahlášení: přihlášený uživatel může cizí recenzi nahlásit jednou; recenze
--    se 3 a více nahlášeními se skryje (autor ji vidí dál). Správce projektu
--    může recenzi skrýt ručně: Table Editor → ratings → hidden = true.
--
-- Spuštění: Supabase → SQL Editor → vložit celý soubor → Run (po migraci ratings).

alter table public.ratings
  add column id              uuid        not null default gen_random_uuid() unique,
  add column title           text        check (title is null or char_length(title) between 1 and 100),
  add column body            text        check (body is null or char_length(body) <= 2000),
  add column author_name     text,
  add column hidden          boolean     not null default false,
  add column text_updated_at timestamptz,
  add constraint ratings_body_needs_title check (body is null or title is not null);

-- Klient zapisuje jen hlas a text; jméno autora, skrytí a časy určuje databáze
revoke insert, update on public.ratings from authenticated;
grant insert (app_id, user_id, rating, title, body) on public.ratings to authenticated;
grant update (app_id, user_id, rating, title, body) on public.ratings to authenticated;

-- Jméno autora z přihlášení a čas poslední změny textu
create function public.ratings_review_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Prázdný text = žádná recenze
  new.title := nullif(btrim(new.title), '');
  new.body := nullif(btrim(new.body), '');
  if new.title is not null then
    -- Jméno od poskytovatele, u kterého se uživatel přihlásil naposledy
    select n.name
      into new.author_name
      from auth.identities i
     cross join lateral (
       select coalesce(
                nullif(i.identity_data ->> 'full_name', ''),
                nullif(i.identity_data ->> 'name', ''),
                nullif(i.identity_data ->> 'user_name', ''),
                nullif(i.identity_data ->> 'preferred_username', '')
              ) as name
     ) n
     where i.user_id = new.user_id
       and i.provider in ('github', 'google')
       and n.name is not null
     order by i.last_sign_in_at desc nulls last
     limit 1;
    new.author_name := coalesce(new.author_name, 'Uživatel');
  end if;
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.body is distinct from old.body then
    new.text_updated_at := case when new.title is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger ratings_review_text
  before insert or update on public.ratings
  for each row execute function public.ratings_review_text();

-- Nahlášení recenze
create table public.review_reports (
  review_id   uuid        not null references public.ratings (id) on delete cascade,
  reporter_id uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text        not null default 'other' check (reason in ('spam', 'offensive', 'offtopic', 'other')),
  created_at  timestamptz not null default now(),
  primary key (review_id, reporter_id)
);

comment on table public.review_reports is 'Nahlášené recenze: 3 a víc nahlášení recenzi skryje.';

alter table public.review_reports enable row level security;

-- Nahlásit jde jen cizí recenzi a jen svým jménem; nahlášení vidí a může vzít zpět jen autor nahlášení
create policy "review_reports: vlastní – vložení" on public.review_reports
  for insert to authenticated with check (
    (select auth.uid()) = reporter_id
    and not exists (select 1 from public.ratings r where r.id = review_id and r.user_id = (select auth.uid()))
  );
create policy "review_reports: vlastní – čtení" on public.review_reports
  for select to authenticated using ((select auth.uid()) = reporter_id);
create policy "review_reports: vlastní – smazání" on public.review_reports
  for delete to authenticated using ((select auth.uid()) = reporter_id);

grant select, insert (review_id, reason), delete on public.review_reports to authenticated;

-- Kolik nahlášení recenzi skryje
create function public.review_report_limit()
returns integer
language sql
immutable
as $$ select 3 $$;

-- Veřejné recenze jedné aplikace: vlastní první, pak nejnovější; bez user_id.
-- Skryté a nahlášené recenze vidí jen jejich autor.
create function public.app_reviews(p_app_id text, p_limit integer default 20, p_offset integer default 0)
returns table (
  id         uuid,
  rating     smallint,
  title      text,
  body       text,
  author     text,
  updated_at timestamptz,
  mine       boolean,
  reported   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.rating,
    r.title,
    r.body,
    coalesce(r.author_name, ''),
    r.text_updated_at,
    r.user_id = auth.uid(),
    exists (select 1 from public.review_reports rr where rr.review_id = r.id and rr.reporter_id = auth.uid())
  from public.ratings r
  where r.app_id = p_app_id
    and r.title is not null
    and (
      r.user_id = auth.uid()
      or (not r.hidden and (select count(*) from public.review_reports rr where rr.review_id = r.id) < public.review_report_limit())
    )
  order by (r.user_id = auth.uid()) desc, r.text_updated_at desc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.app_reviews(text, integer, integer) from public;
grant execute on function public.app_reviews(text, integer, integer) to anon, authenticated;
