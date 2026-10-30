-- Snímky obrazovky ke zprávám z kontaktního formuláře (Supabase Storage, soukromý bucket
-- contact-attachments). Zprávu posílá Web3Forms e-mailem a místo přílohy (placená funkce)
-- v ní je podepsaný odkaz na snímek s platností 90 dní. Soubory jsou i v Supabase →
-- Storage → contact-attachments, záznamy v Table Editor → contact_attachments.
--
-- Pravidla:
--  - nahrávat smí jen přihlášený uživatel – veřejný klíč z aplikace tak nejde zneužít
--    jako bezplatný hosting obrázků; nejvýš 15 snímků za 24 hodin,
--  - nejdřív záznam (databáze zkontroluje limit a určí cestu <id>.webp bez user_id),
--    pak soubor k vlastnímu záznamu – jen jednou, bez přepsání,
--  - soubory jen image/webp do 1 MB (bucket); číst (podepsaný odkaz) jde jen vlastní
--    soubory. Mazání klient nemá – smazaný záznam by obešel denní limit,
--  - smazáním účtu zmizí záznamy, soubory zůstanou v bucketu (smazat ručně ve Storage).
--
-- Spuštění: Supabase → SQL Editor → vložit celý soubor → Run.

create table public.contact_attachments (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  path       text        not null default '',
  created_at timestamptz not null default now()
);

comment on table public.contact_attachments is
  'Snímky obrazovky ke zprávám z kontaktního formuláře – soubory v bucketu contact-attachments.';

create index contact_attachments_user_idx on public.contact_attachments (user_id, created_at desc);

-- Nový snímek: limit a cestu určí databáze
create function public.contact_attachments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception 'Snímek ke zprávě může přiložit jen přihlášený uživatel' using errcode = '42501';
  end if;
  -- Souběžná nahrání téhož uživatele po jednom – limit nejde obejít
  perform pg_advisory_xact_lock(hashtext('contact_attachments:' || new.user_id));
  if (select count(*) from public.contact_attachments
       where user_id = new.user_id and created_at > now() - interval '24 hours') >= 15 then
    raise exception 'Za 24 hodin jde ke zprávám přiložit nejvýš 15 snímků' using errcode = '23514';
  end if;
  new.path := new.id || '.webp';
  new.created_at := now();
  return new;
end;
$$;

create trigger contact_attachments_before_insert
  before insert on public.contact_attachments
  for each row execute function public.contact_attachments_before_insert();

-- Soubor v bucketu patří k vlastnímu záznamu? (nahrání; user_id klient číst nesmí)
create function public.contact_attachment_file_owned(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.contact_attachments a
     where a.path = p_name
       and a.user_id = auth.uid()
  );
$$;

alter table public.contact_attachments enable row level security;

create policy "contact_attachments: vlastní – vložení" on public.contact_attachments
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "contact_attachments: vlastní – čtení" on public.contact_attachments
  for select to authenticated using ((select auth.uid()) = user_id);

-- Klient pošle jen user_id (databáze ho stejně přepíše) a přečte si id a cestu
grant select (id, path, created_at) on public.contact_attachments to authenticated;
grant insert (user_id) on public.contact_attachments to authenticated;

revoke execute on function public.contact_attachment_file_owned(text) from public;
grant execute on function public.contact_attachment_file_owned(text) to authenticated;

-- Soukromý bucket: jen WebP do 1 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-attachments', 'contact-attachments', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nahrát jde jen soubor k vlastnímu záznamu (bez přepsání – chybí pravidlo update)
create policy "contact-attachments: nahrání k vlastnímu záznamu" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'contact-attachments' and public.contact_attachment_file_owned(name)
  );

-- Podepsaný odkaz do e-mailu vytvoří jen vlastník souboru
create policy "contact-attachments: čtení vlastních souborů" on storage.objects
  for select to authenticated using (
    bucket_id = 'contact-attachments' and owner_id = (select auth.uid())::text
  );
