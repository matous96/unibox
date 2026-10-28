-- Veřejné jméno autora recenzí a snímků obrazovky: jen křestní jméno (první slovo
-- celého jména od poskytovatele), bez něj přezdívka (uživatelské jméno na GitHubu).
-- Celé jméno se veřejně neukazuje ani neukládá.
--
-- Jméno se dál bere z auth.identities (údaje od poskytovatele, u kterého se uživatel
-- přihlásil naposledy), ne z user_metadata – ta si uživatel může přepsat sám.
-- Už uložená jména se zkrátí; čas změny recenze se tím nezmění.
--
-- Spuštění: Supabase → SQL Editor → vložit celý soubor → Run (po migracích reviews
-- a app_screenshots).

create function public.public_author_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select n.name
       from auth.identities i
      cross join lateral (
        select coalesce(
                 -- První slovo celého jména („Jana Nováková“ → „Jana“)
                 nullif(split_part(regexp_replace(btrim(coalesce(
                   nullif(i.identity_data ->> 'full_name', ''),
                   i.identity_data ->> 'name'
                 )), '\s+', ' ', 'g'), ' ', 1), ''),
                 nullif(i.identity_data ->> 'user_name', ''),
                 nullif(i.identity_data ->> 'preferred_username', '')
               ) as name
      ) n
      where i.user_id = p_user_id
        and i.provider in ('github', 'google')
        and n.name is not null
      order by i.last_sign_in_at desc nulls last
      limit 1),
    'Uživatel'
  );
$$;

-- Jen pro spouštěče níže (běží jako vlastník funkcí) – klient ji volat nemá
revoke execute on function public.public_author_name(uuid) from public, anon, authenticated;

-- Recenze: stejné jako v migraci reviews, jen jméno přes public_author_name()
create or replace function public.ratings_review_text()
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
    new.author_name := public.public_author_name(new.user_id);
  end if;
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.body is distinct from old.body then
    new.text_updated_at := case when new.title is null then null else now() end;
  end if;
  return new;
end;
$$;

-- Snímky: stejné jako v migraci app_screenshots, jen jméno přes public_author_name()
create or replace function public.app_screenshots_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits record;
begin
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception 'Snímek může nahrát jen přihlášený uživatel' using errcode = '42501';
  end if;
  -- Souběžná nahrání téhož uživatele po jednom – limit nejde obejít
  perform pg_advisory_xact_lock(hashtext('app_screenshots:' || new.user_id));
  select * into limits from public.app_screenshot_limits();
  if (select count(*) from public.app_screenshots where user_id = new.user_id and app_id = new.app_id) >= limits.per_app then
    raise exception 'K jedné aplikaci jde nahrát nejvýš % snímky', limits.per_app using errcode = '23514';
  end if;
  if (select count(*) from public.app_screenshots where user_id = new.user_id) >= limits.per_user then
    raise exception 'Uživatel může mít nejvýš % snímků', limits.per_user using errcode = '23514';
  end if;
  new.author_name := public.public_author_name(new.user_id);
  new.path := new.id || '.webp';
  new.thumb_path := new.id || '-thumb.webp';
  new.approved := public.app_screenshot_auto_approve();
  new.hidden := false;
  new.created_at := now();
  return new;
end;
$$;

-- Už uložená jména zkrátit. U recenzí bez spouštěčů – jinak by se posunul čas změny hlasu.
alter table public.ratings disable trigger user;
update public.ratings
   set author_name = public.public_author_name(user_id)
 where author_name is not null;
alter table public.ratings enable trigger user;

update public.app_screenshots
   set author_name = public.public_author_name(user_id);
