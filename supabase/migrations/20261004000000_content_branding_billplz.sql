-- ═══════════════════════════════════════════════════════════════════════════
-- v2: owner-customisable content (sections, branding, EN/BM) + Billplz payments
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Content & branding on properties (public) ─────────────────────────────
alter table public.properties
  add column translations  jsonb   not null default '{}'::jsonb,   -- { "ms": { "title": "...", "tagline": "...", ... } }
  add column sections      jsonb   not null default '[]'::jsonb,   -- public page sections (see src/lib/content.ts)
  add column accent_color  text    not null default '#059669' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add column logo_url      text,
  add column hero_layout   text    not null default 'mosaic' check (hero_layout in ('mosaic', 'cinematic', 'split')),
  add column billplz_enabled boolean not null default false,
  add constraint translations_is_object check (jsonb_typeof(translations) = 'object'),
  add constraint sections_is_array check (jsonb_typeof(sections) = 'array');

-- ─── Guest-only content (house guide, Wi-Fi, door codes…) ──────────────────
-- Kept out of `properties` because that table is publicly readable.
-- Shown only on a paid booking's receipt page (read server-side with the secret key).
create table public.property_guest_content (
  property_id  uuid primary key references public.properties (id) on delete cascade,
  sections     jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  updated_at   timestamptz not null default now()
);

create trigger property_guest_content_updated_at before update on public.property_guest_content
  for each row execute function public.set_updated_at();

alter table public.property_guest_content enable row level security;

create policy "guest content: host read" on public.property_guest_content
  for select to authenticated using (private.is_property_host(property_id));
create policy "guest content: host insert" on public.property_guest_content
  for insert to authenticated with check (private.is_property_host(property_id));
create policy "guest content: host update" on public.property_guest_content
  for update to authenticated using (private.is_property_host(property_id)) with check (private.is_property_host(property_id));
create policy "guest content: host delete" on public.property_guest_content
  for delete to authenticated using (private.is_property_host(property_id));

-- ─── Billplz on bookings ───────────────────────────────────────────────────
alter type public.transaction_provider add value if not exists 'billplz';

alter table public.bookings
  add column payment_provider text not null default 'stripe' check (payment_provider in ('stripe', 'billplz')),
  add column billplz_bill_id  text unique;

-- Atomically record a paid Billplz bill. Same outcomes as finalize_booking_payment.
create or replace function public.finalize_billplz_bill(
  p_bill_id text,
  p_amount integer,
  p_payment_method text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  new_status public.booking_status;
begin
  select * into b from public.bookings where billplz_bill_id = p_bill_id for update;

  if not found then
    return 'not_found';
  end if;
  if b.status in ('confirmed', 'paid_in_full', 'checked_in', 'completed') then
    return 'already_processed';
  end if;
  if b.status = 'cancelled' and b.cancellation_reason = 'payment_after_hold_conflict' then
    return 'conflict';
  end if;
  if p_amount <> b.amount_due_now or b.currency <> 'MYR' then
    return 'amount_mismatch';
  end if;

  new_status := case when b.balance_due = 0 then 'paid_in_full'::public.booking_status
                     else 'confirmed'::public.booking_status end;

  begin
    update public.bookings
       set status = new_status,
           amount_paid = b.amount_paid + p_amount,
           confirmed_at = now(),
           hold_expires_at = null
     where id = b.id;
  exception when exclusion_violation then
    update public.bookings
       set status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = 'payment_after_hold_conflict'
     where id = b.id;
    insert into public.transactions (booking_id, property_id, kind, status, provider, amount, currency, provider_ref, payment_method_type)
    values (b.id, b.property_id, 'advance', 'succeeded', 'billplz', p_amount, b.currency, p_bill_id, p_payment_method)
    on conflict do nothing;
    return 'conflict';
  end;

  insert into public.transactions (booking_id, property_id, kind, status, provider, amount, currency, provider_ref, payment_method_type)
  values (b.id, b.property_id, 'advance', 'succeeded', 'billplz', p_amount, b.currency, p_bill_id, p_payment_method)
  on conflict do nothing;

  return new_status::text;
end;
$$;

revoke execute on function public.finalize_billplz_bill(text, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_billplz_bill(text, integer, text) to service_role;
