-- Snímky obrazovky aplikací od uživatelů (Supabase Storage, soukromý bucket app-screenshots).
--
-- Pravidla:
--  - přihlášený uživatel nahraje snímek k aplikaci z katalogu (app_id), nejvýš 4
--    k jedné aplikaci a 20 celkem; jméno autora doplní databáze z přihlášení,
--  - nový snímek čeká na schválení správcem (Table Editor → app_screenshots →
--    approved = true); bez schvalování stačí, aby app_screenshot_auto_approve()
--    vracela true,
--  - ostatní vidí schválené, neskryté a méně než 3× nahlášené snímky (stejný limit
--    jako u recenzí), autor vidí své vždy – i čekající na schválení,
--  - cestu k souborům určí databáze: <id>.webp a <id>-thumb.webp (bez user_id);
--    soubory jen image/webp do 1 MB (bucket), nahrát jde jen soubor k vlastnímu
--    záznamu a jen jednou (bez přepsání), číst (podepsaná adresa) jen viditelné,
--  - smazání: autor smaže soubory i záznam; smazáním účtu zmizí záznamy a soubory
--    přestanou být dostupné (dohledání a smazání: README.cs.md → Snímky od uživatelů).
--
-- Spuštění: Supabase → SQL Editor → vložit celý soubor → Run (po migraci reviews).

create table public.app_screenshots (
  id          uuid        primary key default gen_random_uuid(),
  app_id      text        not null check (app_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text        not null,
  width       integer     not null check (width between 1 and 4096),
  height      integer     not null check (height between 1 and 4096),
  path        text        not null unique,
  thumb_path  text        not null unique,
  approved    boolean     not null default false,
  hidden      boolean     not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.app_screenshots is
  'Snímky obrazovky aplikací od uživatelů – soubory v bucketu app-screenshots; zveřejnění: approved = true.';

create index app_screenshots_app_id_idx on public.app_screenshots (app_id, created_at desc);
create index app_screenshots_user_id_idx on public.app_screenshots (user_id);

-- Nahlášení snímku
create table public.app_screenshot_reports (
  screenshot_id uuid        not null references public.app_screenshots (id) on delete cascade,
  reporter_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  reason        text        not null default 'other' check (reason in ('spam', 'offensive', 'offtopic', 'other')),
  created_at    timestamptz not null default now(),
  primary key (screenshot_id, reporter_id)
);

comment on table public.app_screenshot_reports is 'Nahlášené snímky: 3 a víc nahlášení snímek skryje.';

-- Kolik snímků smí mít uživatel u jedné aplikace a celkem (místo v bezplatném tarifu)
create function public.app_screenshot_limits(out per_app integer, out per_user integer)
language sql
immutable
as $$ select 4, 20 $$;

-- Zveřejnit nové snímky hned? false = až po schválení správcem
create function public.app_screenshot_auto_approve()
returns boolean
language sql
immutable
as $$ select false $$;

-- Vidí ostatní snímek? (schválený, neskrytý, méně nahlášení než limit recenzí)
create function public.app_screenshot_public(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_screenshots s
     where s.id = p_id
       and s.approved
       and not s.hidden
       and (select count(*) from public.app_screenshot_reports r where r.screenshot_id = s.id) < public.review_report_limit()
  );
$$;

-- Soubor v bucketu smí aktuální uživatel číst? (vlastní snímek nebo veřejný)
create function public.app_screenshot_file_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_screenshots s
     where (s.path = p_name or s.thumb_path = p_name)
       and (s.user_id = auth.uid() or public.app_screenshot_public(s.id))
  );
$$;

-- Soubor v bucketu patří k vlastnímu snímku? (nahrání; user_id klient číst nesmí)
create function public.app_screenshot_file_owned(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_screenshots s
     where s.user_id = auth.uid()
       and (s.path = p_name or s.thumb_path = p_name)
  );
$$;

-- Je snímek aktuálního uživatele? (vlastní snímek nahlásit nejde)
create function public.app_screenshot_is_mine(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_screenshots s where s.id = p_id and s.user_id = auth.uid());
$$;

-- Nový snímek: limity, jméno autora, cesta a schválení určí databáze
create function public.app_screenshots_before_insert()
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
  -- Jméno od poskytovatele, u kterého se uživatel přihlásil naposledy (jako u recenzí)
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
  new.path := new.id || '.webp';
  new.thumb_path := new.id || '-thumb.webp';
  new.approved := public.app_screenshot_auto_approve();
  new.hidden := false;
  new.created_at := now();
  return new;
end;
$$;

create trigger app_screenshots_before_insert
  before insert on public.app_screenshots
  for each row execute function public.app_screenshots_before_insert();

-- Snímky aplikace pro galerii: vlastní (i čekající) a veřejné, nejnovější první; bez user_id
create function public.app_screenshots_list(p_app_id text)
returns table (
  id         uuid,
  path       text,
  thumb_path text,
  width      integer,
  height     integer,
  author     text,
  created_at timestamptz,
  approved   boolean,
  mine       boolean,
  reported   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.path,
    s.thumb_path,
    s.width,
    s.height,
    s.author_name,
    s.created_at,
    s.approved,
    coalesce(s.user_id = auth.uid(), false),
    exists (select 1 from public.app_screenshot_reports r where r.screenshot_id = s.id and r.reporter_id = auth.uid())
  from public.app_screenshots s
  where s.app_id = p_app_id
    and (s.user_id = auth.uid() or public.app_screenshot_public(s.id))
  order by coalesce(s.user_id = auth.uid(), false) desc, s.created_at desc
  limit 24;
$$;

alter table public.app_screenshots enable row level security;
alter table public.app_screenshot_reports enable row level security;

create policy "app_screenshots: vlastní – vložení" on public.app_screenshots
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "app_screenshots: vlastní – čtení" on public.app_screenshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "app_screenshots: vlastní – smazání" on public.app_screenshots
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Nahlásit jde jen cizí snímek a jen svým jménem; nahlášení vidí a vezme zpět jen autor nahlášení
create policy "app_screenshot_reports: vlastní – vložení" on public.app_screenshot_reports
  for insert to authenticated with check (
    (select auth.uid()) = reporter_id and not public.app_screenshot_is_mine(screenshot_id)
  );
create policy "app_screenshot_reports: vlastní – čtení" on public.app_screenshot_reports
  for select to authenticated using ((select auth.uid()) = reporter_id);
create policy "app_screenshot_reports: vlastní – smazání" on public.app_screenshot_reports
  for delete to authenticated using ((select auth.uid()) = reporter_id);

-- Klient zapíše jen aplikaci a rozměry; jméno, cestu, schválení a skrytí určí databáze.
-- Číst cizí snímky jde jen přes app_screenshots_list (bez user_id).
grant select (id, app_id, author_name, width, height, path, thumb_path, approved, created_at)
  on public.app_screenshots to authenticated;
grant insert (app_id, width, height) on public.app_screenshots to authenticated;
grant delete on public.app_screenshots to authenticated;
grant select, insert (screenshot_id, reason), delete on public.app_screenshot_reports to authenticated;

revoke execute on function public.app_screenshots_list(text) from public;
grant execute on function public.app_screenshots_list(text) to anon, authenticated;
revoke execute on function public.app_screenshot_public(uuid) from public;
revoke execute on function public.app_screenshot_file_visible(text) from public;
grant execute on function public.app_screenshot_file_visible(text) to anon, authenticated;
revoke execute on function public.app_screenshot_file_owned(text) from public;
grant execute on function public.app_screenshot_file_owned(text) to authenticated;
revoke execute on function public.app_screenshot_is_mine(uuid) from public;
grant execute on function public.app_screenshot_is_mine(uuid) to authenticated;

-- Soukromý bucket: jen WebP do 1 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-screenshots', 'app-screenshots', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nahrát jde jen soubor k vlastnímu záznamu snímku (bez přepsání – chybí pravidlo update)
create policy "app-screenshots: nahrání k vlastnímu snímku" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'app-screenshots' and public.app_screenshot_file_owned(name)
  );

-- Číst (podepsané adresy) jde vlastní a veřejné snímky
create policy "app-screenshots: čtení viditelných" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'app-screenshots' and public.app_screenshot_file_visible(name)
  );

-- Autor smaže své soubory i poté, co záznam zmizel
create policy "app-screenshots: čtení vlastních souborů" on storage.objects
  for select to authenticated using (
    bucket_id = 'app-screenshots' and owner_id = (select auth.uid())::text
  );
create policy "app-screenshots: smazání vlastních souborů" on storage.objects
  for delete to authenticated using (
    bucket_id = 'app-screenshots' and owner_id = (select auth.uid())::text
  );
