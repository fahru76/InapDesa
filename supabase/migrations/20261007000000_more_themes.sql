-- ═══════════════════════════════════════════════════════════════════════════
-- v5: more listing themes the owner can choose (Host → Content → Branding)
--   malam (dark luxury), tanah (earth & clay), pesisir (coastal),
--   galeri (minimal editorial), peranakan (Straits heritage)
-- Widening only: existing rows ('heritage' / 'classic') stay valid; the default is unchanged.
-- Rollback: update rows on new themes to 'heritage', then restore the two-value check.
-- ═══════════════════════════════════════════════════════════════════════════

-- The v3 check was declared inline, so its name is generated; drop whichever check covers theme_preset.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.properties'::regclass
       and con.contype = 'c'
       and att.attname = 'theme_preset'
  loop
    execute format('alter table public.properties drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.properties
  add constraint properties_theme_preset_check
  check (theme_preset in ('heritage', 'malam', 'tanah', 'pesisir', 'galeri', 'peranakan', 'classic'));
