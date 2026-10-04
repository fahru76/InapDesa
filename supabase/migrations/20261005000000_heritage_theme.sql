-- ═══════════════════════════════════════════════════════════════════════════
-- v3: "warm heritage editorial" look — Grand hero layout + per-listing theme preset
-- ═══════════════════════════════════════════════════════════════════════════

-- Grand (full-screen) hero joins the existing layouts.
alter table public.properties drop constraint if exists properties_hero_layout_check;
alter table public.properties
  add constraint properties_hero_layout_check check (hero_layout in ('grand', 'mosaic', 'cinematic', 'split'));

-- heritage = ivory/teak/serif (new default); classic = the original cool, all-sans look.
alter table public.properties
  add column if not exists theme_preset text not null default 'heritage'
    check (theme_preset in ('heritage', 'classic'));

-- New listings start with the new look.
alter table public.properties alter column hero_layout set default 'grand';
alter table public.properties alter column accent_color set default '#2f5d46';

-- Listings still on BOTH old defaults (never customised) move to the new look.
-- Rollback for those rows: update public.properties set hero_layout = 'mosaic', accent_color = '#059669' where ...
update public.properties
   set hero_layout = 'grand', accent_color = '#2f5d46'
 where hero_layout = 'mosaic' and accent_color = '#059669';
