-- ═══════════════════════════════════════════════════════════════════════════
-- v4: calendar sync, structured cancellation, security-deposit tracking,
--     arrival notifications, online balance payment, tourism tax, reviews.
-- Additive only: new columns have defaults, existing rows keep their behaviour.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Calendar sync (iCal) ───────────────────────────────────────────────
-- Secret per-listing settings. Kept out of `properties`, which is publicly readable.
create table public.property_private (
  property_id        uuid primary key references public.properties (id) on delete cascade,
  ical_export_token  uuid not null default gen_random_uuid() unique,
  updated_at         timestamptz not null default now()
);
create trigger property_private_updated_at before update on public.property_private
  for each row execute function public.set_updated_at();
alter table public.property_private enable row level security;
create policy "property private: host read" on public.property_private
  for select to authenticated using (private.is_property_host(property_id));
create policy "property private: host insert" on public.property_private
  for insert to authenticated with check (private.is_property_host(property_id));
create policy "property private: host update" on public.property_private
  for update to authenticated using (private.is_property_host(property_id)) with check (private.is_property_host(property_id));

-- External calendars (Airbnb, Agoda, Booking.com…) imported as blocked nights.
create table public.calendar_feeds (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 40),
  url               text not null check (url ~ '^https://' and char_length(url) <= 1000),
  last_synced_at    timestamptz,
  last_status       text check (last_status in ('ok', 'error')),
  last_error        text check (last_error is null or char_length(last_error) <= 300),
  last_event_count  integer,
  created_at        timestamptz not null default now(),
  unique (property_id, url)
);
create index calendar_feeds_property_idx on public.calendar_feeds (property_id);
alter table public.calendar_feeds enable row level security;
create policy "calendar feeds: host read" on public.calendar_feeds
  for select to authenticated using (private.is_property_host(property_id));
create policy "calendar feeds: host insert" on public.calendar_feeds
  for insert to authenticated with check (private.is_property_host(property_id));
create policy "calendar feeds: host update" on public.calendar_feeds
  for update to authenticated using (private.is_property_host(property_id)) with check (private.is_property_host(property_id));
create policy "calendar feeds: host delete" on public.calendar_feeds
  for delete to authenticated using (private.is_property_host(property_id));

-- Imported nights point at their feed (null = closed by the host). Removing a feed frees its nights.
alter table public.blocked_dates
  add column feed_id uuid references public.calendar_feeds (id) on delete cascade;
create index blocked_dates_feed_idx on public.blocked_dates (feed_id) where feed_id is not null;

-- ─── 2. Structured cancellation policy ─────────────────────────────────────
alter table public.properties
  add column cancellation_preset text not null default 'custom'
    check (cancellation_preset in ('flexible', 'moderate', 'firm', 'non_refundable', 'custom'));
-- Snapshot on the booking: later policy changes never affect an existing booking.
alter table public.bookings
  add column cancellation_preset text not null default 'custom'
    check (cancellation_preset in ('flexible', 'moderate', 'firm', 'non_refundable', 'custom')),
  add column cancellation_policy_text text check (cancellation_policy_text is null or char_length(cancellation_policy_text) <= 1000);

-- ─── 3. Security deposit return ────────────────────────────────────────────
alter table public.properties
  add column security_deposit_return_days smallint not null default 3 check (security_deposit_return_days between 0 and 30);
alter table public.bookings
  add column security_deposit_return_days smallint not null default 3 check (security_deposit_return_days between 0 and 30),
  add column deposit_returned_amount integer check (deposit_returned_amount is null or deposit_returned_amount >= 0),
  add column deposit_returned_at timestamptz,
  add column deposit_return_note text check (deposit_return_note is null or char_length(deposit_return_note) <= 300);

-- Host records how much of the security deposit went back (full or partial, with a reason).
create or replace function public.host_record_deposit_return(p_booking_id uuid, p_amount integer, p_note text)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not private.is_property_host(b.property_id) then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.security_deposit = 0 then
    raise exception 'This booking has no security deposit' using errcode = 'P0001';
  end if;
  if b.status not in ('checked_in', 'completed', 'paid_in_full', 'confirmed') then
    raise exception 'Deposit cannot be recorded from status %', b.status using errcode = 'P0001';
  end if;
  if p_amount < 0 or p_amount > b.security_deposit then
    raise exception 'Amount must be between 0 and the deposit' using errcode = '22023';
  end if;
  if p_amount < b.security_deposit and coalesce(trim(p_note), '') = '' then
    raise exception 'Explain why part of the deposit was kept' using errcode = '22023';
  end if;

  update public.bookings
     set deposit_returned_amount = p_amount,
         deposit_returned_at = now(),
         deposit_return_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = b.id
   returning * into b;
  return b;
end;
$$;

-- ─── 4. Guest notifications (sent-once log) + guest language ───────────────
create table public.booking_notifications (
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  kind        text not null check (kind in ('confirmation', 'arrival_7d', 'arrival_1d', 'review_invite')),
  sent_at     timestamptz not null default now(),
  primary key (booking_id, kind)
);
alter table public.booking_notifications enable row level security;
create policy "notifications: host read" on public.booking_notifications
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and private.is_property_host(b.property_id)));

alter table public.bookings
  add column locale text not null default 'en' check (locale in ('en', 'ms'));

-- ─── 5. Pay the balance online ─────────────────────────────────────────────
alter table public.bookings
  add column balance_payment_intent_id text unique,
  add column balance_bill_id text unique;

-- Apply an online balance payment. Returns: 'paid_in_full' | 'already_processed' | 'not_found'
--   | 'amount_mismatch' | 'invalid_status'
create or replace function public.finalize_balance_payment(
  p_booking_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount integer,
  p_currency text,
  p_event_id text,
  p_payment_method text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  outstanding integer;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return 'not_found';
  end if;
  if exists (
    select 1 from public.transactions
     where booking_id = b.id and kind = 'balance' and status = 'succeeded' and provider_ref = p_provider_ref
  ) then
    return 'already_processed';
  end if;
  outstanding := b.total_amount - b.amount_paid;
  if outstanding <= 0 then
    return 'already_processed';
  end if;
  if b.status not in ('confirmed', 'paid_in_full') then
    return 'invalid_status';
  end if;
  if p_amount <> outstanding or upper(p_currency) <> b.currency then
    return 'amount_mismatch';
  end if;

  insert into public.transactions (booking_id, property_id, kind, status, provider, amount, currency, provider_ref, stripe_event_id, payment_method_type)
  values (b.id, b.property_id, 'balance', 'succeeded', p_provider::public.transaction_provider, p_amount, b.currency, p_provider_ref,
          case when p_provider = 'stripe' then p_event_id end, p_payment_method);

  update public.bookings
     set amount_paid = b.total_amount,
         status = 'paid_in_full'
   where id = b.id;
  return 'paid_in_full';
end;
$$;

-- ─── 6. Tourism tax (foreign guests, owner opt-in) ─────────────────────────
alter table public.properties
  add column tourism_tax_enabled boolean not null default false,
  add column tourism_tax_rate integer not null default 1000 check (tourism_tax_rate between 0 and 100000),
  add column tourism_tax_rooms smallint not null default 1 check (tourism_tax_rooms between 1 and 50);
alter table public.bookings
  add column tourism_tax integer not null default 0 check (tourism_tax >= 0),
  add column foreign_guest boolean not null default false;

-- ─── 7. Reviews (verified stays only; written by the server) ────────────────
create table public.reviews (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references public.bookings (id) on delete cascade,
  property_id         uuid not null references public.properties (id) on delete cascade,
  rating              smallint not null check (rating between 1 and 5),
  body                text not null check (char_length(body) between 10 and 2000),
  guest_display_name  text not null check (char_length(guest_display_name) between 1 and 60),
  stay_month          date not null,
  locale              text not null default 'en' check (locale in ('en', 'ms')),
  host_reply          text check (host_reply is null or char_length(host_reply) <= 1000),
  host_replied_at     timestamptz,
  created_at          timestamptz not null default now()
);
create index reviews_property_created_idx on public.reviews (property_id, created_at desc);
alter table public.reviews enable row level security;
create policy "reviews: public read for published listings" on public.reviews
  for select to anon, authenticated
  using (exists (select 1 from public.properties p where p.id = property_id and (p.is_published or private.is_property_host(p.id))));
-- Column-level privileges: the booking link stays private.
revoke select on public.reviews from anon, authenticated;
grant select (id, property_id, rating, body, guest_display_name, stay_month, locale, host_reply, host_replied_at, created_at)
  on public.reviews to anon, authenticated;

create or replace function public.host_reply_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews%rowtype;
begin
  select * into r from public.reviews where id = p_review_id for update;
  if not found or not private.is_property_host(r.property_id) then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  update public.reviews
     set host_reply = nullif(left(trim(coalesce(p_reply, '')), 1000), ''),
         host_replied_at = case when nullif(trim(coalesce(p_reply, '')), '') is null then null else now() end
   where id = r.id;
end;
$$;

-- ─── Function privileges ───────────────────────────────────────────────────
revoke execute on function public.finalize_balance_payment(uuid, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_balance_payment(uuid, text, text, integer, text, text, text) to service_role;

revoke execute on function public.host_record_deposit_return(uuid, integer, text) from public, anon;
grant execute on function public.host_record_deposit_return(uuid, integer, text) to authenticated;

revoke execute on function public.host_reply_review(uuid, text) from public, anon;
grant execute on function public.host_reply_review(uuid, text) to authenticated;
