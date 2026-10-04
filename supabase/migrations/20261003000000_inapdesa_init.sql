-- ═══════════════════════════════════════════════════════════════════════════
-- InapDesa — homestay booking & advance-payment schema
-- Money is stored as INTEGER minor units (e.g. sen for MYR, cents for USD).
-- Booking dates are property-local calendar dates; a stay is [check_in, check_out).
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.payment_policy as enum ('deposit', 'full');

create type public.booking_status as enum (
  'pending_payment', -- dates held while the guest pays
  'confirmed',       -- advance deposit received, balance due on check-in
  'paid_in_full',    -- everything settled online
  'checked_in',
  'completed',
  'cancelled',
  'expired'          -- hold lapsed without payment
);

create type public.transaction_kind as enum ('advance', 'balance', 'refund');
create type public.transaction_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.transaction_provider as enum ('stripe', 'on_site');

-- ─── Shared trigger: updated_at ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Profiles (one per auth user — hosts) ───────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Properties ─────────────────────────────────────────────────────────────
create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  host_id             uuid references auth.users (id) on delete set null,
  slug                text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title               text not null check (char_length(title) between 3 and 120),
  tagline             text,
  description         text not null default '',

  -- Location
  address_line        text,
  city                text not null,
  region              text,
  country             text not null default 'Malaysia',
  latitude            numeric(9, 6),
  longitude           numeric(9, 6),
  timezone            text not null default 'Asia/Kuala_Lumpur',

  -- Space & capacity
  bedrooms            smallint not null default 1 check (bedrooms >= 0),
  beds                smallint not null default 1 check (beds >= 0),
  bathrooms           numeric(3, 1) not null default 1 check (bathrooms >= 0),
  max_guests          smallint not null check (max_guests between 1 and 50),   -- adults + children
  max_infants         smallint not null default 2 check (max_infants between 0 and 10),
  amenities           text[] not null default '{}',
  house_rules         text[] not null default '{}',
  check_in_time       time not null default '15:00',
  check_out_time      time not null default '11:00',

  -- Pricing (minor units)
  currency            char(3) not null default 'MYR' check (currency ~ '^[A-Z]{3}$'),
  weekday_rate        integer not null check (weekday_rate > 0),
  weekend_rate        integer not null check (weekend_rate > 0),
  -- ISO day-of-week of the NIGHT that is charged the weekend rate (5 = Fri, 6 = Sat)
  weekend_days        smallint[] not null default '{5,6}',
  cleaning_fee        integer not null default 0 check (cleaning_fee >= 0),
  security_deposit    integer not null default 0 check (security_deposit >= 0),
  min_nights          smallint not null default 1 check (min_nights >= 1),
  max_nights          smallint not null default 30 check (max_nights >= min_nights),

  -- Advance payment policy
  payment_policy      public.payment_policy not null default 'deposit',
  deposit_percent     smallint not null default 50 check (deposit_percent between 10 and 100),
  cancellation_policy text not null default 'Deposits are refundable up to 7 days before check-in.',

  -- Host card (public)
  host_display_name   text,
  host_bio            text,
  host_avatar_url     text,
  host_phone          text check (host_phone is null or host_phone ~ '^\+[1-9][0-9]{6,14}$'),
  host_languages      text[] not null default '{}',
  host_since          date,

  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint weekend_days_valid check (weekend_days <@ array[1,2,3,4,5,6,7]::smallint[])
);

create index properties_host_idx on public.properties (host_id);
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- ─── Property images ────────────────────────────────────────────────────────
create table public.property_images (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  storage_path  text,          -- object path inside the property-images bucket (null for external URLs)
  url           text not null,
  alt           text not null default '',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index property_images_property_idx on public.property_images (property_id, sort_order);

-- ─── Blocked dates (host-closed nights) ─────────────────────────────────────
create table public.blocked_dates (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  date         date not null,
  reason       text,
  created_at   timestamptz not null default now(),
  unique (property_id, date)
);

-- ─── Bookings ───────────────────────────────────────────────────────────────
create table public.bookings (
  id                        uuid primary key default gen_random_uuid(),
  reference                 text not null unique,
  access_token              uuid not null default gen_random_uuid(),
  property_id               uuid not null references public.properties (id) on delete restrict,

  guest_name                text not null check (char_length(guest_name) between 2 and 120),
  guest_email               text not null check (guest_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  guest_phone               text not null check (guest_phone ~ '^\+[1-9][0-9]{6,14}$'),
  special_requests          text check (special_requests is null or char_length(special_requests) <= 1000),

  check_in                  date not null,
  check_out                 date not null,
  nights                    integer generated always as (check_out - check_in) stored,
  adults                    smallint not null check (adults >= 1),
  children                  smallint not null default 0 check (children >= 0),
  infants                   smallint not null default 0 check (infants >= 0),

  -- Price snapshot at time of booking (minor units)
  currency                  char(3) not null,
  nightly_breakdown         jsonb not null default '[]'::jsonb,  -- [{ "date": "2026-10-09", "rate": 32000, "weekend": true }]
  subtotal                  integer not null check (subtotal >= 0),
  cleaning_fee              integer not null default 0 check (cleaning_fee >= 0),
  security_deposit          integer not null default 0 check (security_deposit >= 0),
  total_amount              integer not null check (total_amount >= 0),
  payment_policy            public.payment_policy not null,
  deposit_percent           smallint not null,
  amount_due_now            integer not null check (amount_due_now > 0),
  balance_due               integer not null check (balance_due >= 0),
  amount_paid               integer not null default 0 check (amount_paid >= 0),

  status                    public.booking_status not null default 'pending_payment',
  hold_expires_at           timestamptz,
  stripe_payment_intent_id  text unique,
  cancellation_reason       text,

  confirmed_at              timestamptz,
  checked_in_at             timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,

  constraint check_out_after_check_in check (check_out > check_in),
  constraint amounts_consistent check (amount_due_now + balance_due = total_amount),
  -- Hard guarantee against double-booking (active statuses only)
  constraint bookings_no_overlap exclude using gist (
    property_id with =,
    stay with &&
  ) where (status in ('pending_payment', 'confirmed', 'paid_in_full', 'checked_in'))
);

-- Human-friendly reference, e.g. IND-7KQ2MX (defined after the table it checks)
create or replace function public.generate_booking_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  ref text;
begin
  loop
    ref := 'IND-';
    for i in 1..6 loop
      ref := ref || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.bookings b where b.reference = ref);
  end loop;
  return ref;
end;
$$;

alter table public.bookings alter column reference set default public.generate_booking_reference();

create index bookings_property_dates_idx on public.bookings (property_id, check_in);
create index bookings_status_idx on public.bookings (status);
create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ─── Transactions (money movements) ─────────────────────────────────────────
create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references public.bookings (id) on delete cascade,
  property_id          uuid not null references public.properties (id) on delete cascade,
  kind                 public.transaction_kind not null,
  status               public.transaction_status not null,
  provider             public.transaction_provider not null default 'stripe',
  amount               integer not null check (amount > 0),
  currency             char(3) not null,
  provider_ref         text,          -- Stripe PaymentIntent / Refund id
  stripe_event_id      text unique,   -- webhook idempotency
  payment_method_type  text,          -- card, fpx, grabpay, apple_pay …
  created_at           timestamptz not null default now()
);

create unique index transactions_provider_ref_kind_uidx
  on public.transactions (provider, provider_ref, kind, status)
  where provider_ref is not null;
create index transactions_property_created_idx on public.transactions (property_id, created_at desc);
create index transactions_booking_idx on public.transactions (booking_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Helper & RPC functions
-- ═══════════════════════════════════════════════════════════════════════════

-- Is the current user the host of this property?
create or replace function public.is_property_host(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id and p.host_id = (select auth.uid())
  );
$$;

-- Storage helper: first folder segment of an object path must be a property the user hosts
create or replace function public.can_manage_property_folder(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text := split_part(p_object_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_property_host(folder::uuid);
end;
$$;

-- Public availability: booked nights + blocked nights in [p_from, p_to). Exposes no guest data.
create or replace function public.get_unavailable_dates(p_property_id uuid, p_from date, p_to date)
returns table (day date, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  with prop as (
    select id from public.properties
    where id = p_property_id
      and (is_published or host_id = (select auth.uid()))
  ),
  bounds as (
    select greatest(p_from, current_date - 1) as f, least(p_to, p_from + 550) as t
  )
  select distinct on (d.day) d.day, d.kind
  from (
    select gs::date as day, 'booked'::text as kind
    from public.bookings b
    join prop on prop.id = b.property_id
    cross join bounds
    cross join lateral generate_series(
      greatest(b.check_in, bounds.f), least(b.check_out, bounds.t) - 1, interval '1 day'
    ) gs
    where b.check_in < bounds.t and b.check_out > bounds.f
      and (
        b.status in ('confirmed', 'paid_in_full', 'checked_in')
        or (b.status = 'pending_payment' and b.hold_expires_at > now())
      )
    union all
    select bd.date, 'blocked'
    from public.blocked_dates bd
    join prop on prop.id = bd.property_id
    cross join bounds
    where bd.date >= bounds.f and bd.date < bounds.t
  ) d
  order by d.day, d.kind;  -- 'blocked' sorts before 'booked'
$$;

-- Mark stale holds as expired so they stop blocking the exclusion constraint.
create or replace function public.release_expired_holds(p_property_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.bookings
     set status = 'expired'
   where status = 'pending_payment'
     and hold_expires_at < now()
     and (p_property_id is null or property_id = p_property_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Atomically record a successful online payment.
-- Returns: 'confirmed' | 'paid_in_full' | 'already_processed' | 'conflict' | 'not_found' | 'amount_mismatch'
create or replace function public.finalize_booking_payment(
  p_payment_intent_id text,
  p_amount integer,
  p_currency text,
  p_event_id text,
  p_payment_method_type text
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
  select * into b from public.bookings
   where stripe_payment_intent_id = p_payment_intent_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if b.status in ('confirmed', 'paid_in_full', 'checked_in', 'completed') then
    return 'already_processed';
  end if;

  if b.status = 'cancelled' and b.cancellation_reason = 'payment_after_hold_conflict' then
    return 'conflict';
  end if;

  if p_amount <> b.amount_due_now or upper(p_currency) <> b.currency then
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
    -- The hold lapsed and someone else took the dates before payment landed.
    update public.bookings
       set status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = 'payment_after_hold_conflict'
     where id = b.id;
    insert into public.transactions (booking_id, property_id, kind, status, provider, amount, currency, provider_ref, stripe_event_id, payment_method_type)
    values (b.id, b.property_id, 'advance', 'succeeded', 'stripe', p_amount, b.currency, p_payment_intent_id, p_event_id, p_payment_method_type)
    on conflict do nothing;
    return 'conflict';
  end;

  insert into public.transactions (booking_id, property_id, kind, status, provider, amount, currency, provider_ref, stripe_event_id, payment_method_type)
  values (b.id, b.property_id, 'advance', 'succeeded', 'stripe', p_amount, b.currency, p_payment_intent_id, p_event_id, p_payment_method_type)
  on conflict do nothing;

  return new_status::text;
end;
$$;

-- Record a refund issued through Stripe (idempotent per refund id).
create or replace function public.record_refund(
  p_booking_id uuid,
  p_refund_id text,
  p_amount integer,
  p_currency text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.transactions (booking_id, property_id, kind, status, provider, amount, currency, provider_ref)
  select b.id, b.property_id, 'refund', 'succeeded', 'stripe', p_amount, upper(p_currency), p_refund_id
  from public.bookings b where b.id = p_booking_id
  on conflict do nothing;
$$;

-- Host: check a guest in (optionally recording the on-site balance payment).
create or replace function public.host_check_in_booking(p_booking_id uuid, p_balance_collected boolean)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not public.is_property_host(b.property_id) then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.status not in ('confirmed', 'paid_in_full') then
    raise exception 'Booking cannot be checked in from status %', b.status using errcode = 'P0001';
  end if;

  if p_balance_collected and b.balance_due > 0 and b.amount_paid < b.total_amount then
    insert into public.transactions (booking_id, property_id, kind, status, provider, amount, currency, provider_ref)
    values (b.id, b.property_id, 'balance', 'succeeded', 'on_site', b.balance_due, b.currency, 'onsite-' || b.reference)
    on conflict do nothing;
    b.amount_paid := b.amount_paid + b.balance_due;
  end if;

  update public.bookings
     set status = 'checked_in',
         checked_in_at = now(),
         amount_paid = b.amount_paid
   where id = b.id
   returning * into b;

  return b;
end;
$$;

-- Host: cancel a booking (refunds are issued from the app server via Stripe).
create or replace function public.host_cancel_booking(p_booking_id uuid, p_reason text)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not public.is_property_host(b.property_id) then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.status in ('checked_in', 'completed', 'cancelled', 'expired') then
    raise exception 'Booking cannot be cancelled from status %', b.status using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = left(coalesce(nullif(trim(p_reason), ''), 'Cancelled by host'), 500),
         hold_expires_at = null
   where id = b.id
   returning * into b;
  return b;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.profiles        enable row level security;
alter table public.properties      enable row level security;
alter table public.property_images enable row level security;
alter table public.blocked_dates   enable row level security;
alter table public.bookings        enable row level security;
alter table public.transactions    enable row level security;

-- Profiles: a user sees and edits only themself
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Properties: published are public; hosts manage their own
create policy "properties: public read published" on public.properties
  for select to anon, authenticated using (is_published or host_id = (select auth.uid()));
create policy "properties: host insert" on public.properties
  for insert to authenticated with check (host_id = (select auth.uid()));
create policy "properties: host update" on public.properties
  for update to authenticated using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "properties: host delete" on public.properties
  for delete to authenticated using (host_id = (select auth.uid()));

-- Images: follow the parent property
create policy "images: public read" on public.property_images
  for select to anon, authenticated using (
    exists (select 1 from public.properties p
            where p.id = property_id and (p.is_published or p.host_id = (select auth.uid())))
  );
create policy "images: host insert" on public.property_images
  for insert to authenticated with check (public.is_property_host(property_id));
create policy "images: host update" on public.property_images
  for update to authenticated using (public.is_property_host(property_id)) with check (public.is_property_host(property_id));
create policy "images: host delete" on public.property_images
  for delete to authenticated using (public.is_property_host(property_id));

-- Blocked dates: hosts only (public reads go through get_unavailable_dates)
create policy "blocked: host read" on public.blocked_dates
  for select to authenticated using (public.is_property_host(property_id));
create policy "blocked: host insert" on public.blocked_dates
  for insert to authenticated with check (public.is_property_host(property_id));
create policy "blocked: host delete" on public.blocked_dates
  for delete to authenticated using (public.is_property_host(property_id));

-- Bookings: hosts can read their property's bookings. Writes happen server-side
-- (secret key) or through the SECURITY DEFINER host_* functions above.
create policy "bookings: host read" on public.bookings
  for select to authenticated using (public.is_property_host(property_id));

-- Transactions: hosts read only
create policy "transactions: host read" on public.transactions
  for select to authenticated using (public.is_property_host(property_id));

-- ─── Function privileges ───────────────────────────────────────────────────
revoke execute on function public.release_expired_holds(uuid) from public, anon, authenticated;
revoke execute on function public.finalize_booking_payment(text, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.record_refund(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.host_check_in_booking(uuid, boolean) from public, anon;
revoke execute on function public.host_cancel_booking(uuid, text) from public, anon;
revoke execute on function public.generate_booking_reference() from public, anon, authenticated;
grant execute on function public.get_unavailable_dates(uuid, date, date) to anon, authenticated;
grant execute on function public.host_check_in_booking(uuid, boolean) to authenticated;
grant execute on function public.host_cancel_booking(uuid, text) to authenticated;
grant execute on function public.release_expired_holds(uuid) to service_role;
grant execute on function public.finalize_booking_payment(text, integer, text, text, text) to service_role;
grant execute on function public.record_refund(uuid, text, integer, text) to service_role;
grant execute on function public.generate_booking_reference() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage: public bucket for listing photos, writable by the property's host
-- Object path convention: {property_id}/{uuid}.{ext}
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- Public bucket: files are served by URL without a SELECT policy. Listing objects
-- (and deleting, which requires SELECT) is limited to the property's host.
create policy "property-images: host list" on storage.objects
  for select to authenticated using (bucket_id = 'property-images' and public.can_manage_property_folder(name));
create policy "property-images: host upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'property-images' and public.can_manage_property_folder(name));
create policy "property-images: host update" on storage.objects
  for update to authenticated using (bucket_id = 'property-images' and public.can_manage_property_folder(name));
create policy "property-images: host delete" on storage.objects
  for delete to authenticated using (bucket_id = 'property-images' and public.can_manage_property_folder(name));
