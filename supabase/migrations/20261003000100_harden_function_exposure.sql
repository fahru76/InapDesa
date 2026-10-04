-- Hardening (Supabase security advisor lints 0028/0029):
-- RLS helper functions must be executable by the roles evaluating policies, but should not be
-- callable through the REST API. Move them to a non-exposed `private` schema. ALTER ... SET SCHEMA
-- keeps the function OIDs, so existing policies continue to reference them correctly.

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_property_host(uuid) set schema private;
alter function public.can_manage_property_folder(text) set schema private;

-- Function bodies reference helpers by name, so re-point them to the new schema.
create or replace function private.can_manage_property_folder(p_object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := split_part(p_object_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_property_host(folder::uuid);
end;
$$;

create or replace function public.host_check_in_booking(p_booking_id uuid, p_balance_collected boolean)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not private.is_property_host(b.property_id) then
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
  update public.bookings set status = 'checked_in', checked_in_at = now(), amount_paid = b.amount_paid
   where id = b.id returning * into b;
  return b;
end;
$$;

create or replace function public.host_cancel_booking(p_booking_id uuid, p_reason text)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not private.is_property_host(b.property_id) then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.status in ('checked_in', 'completed', 'cancelled', 'expired') then
    raise exception 'Booking cannot be cancelled from status %', b.status using errcode = 'P0001';
  end if;
  update public.bookings
     set status = 'cancelled', cancelled_at = now(),
         cancellation_reason = left(coalesce(nullif(trim(p_reason), ''), 'Cancelled by host'), 500),
         hold_expires_at = null
   where id = b.id returning * into b;
  return b;
end;
$$;

revoke execute on function private.is_property_host(uuid) from public;
revoke execute on function private.can_manage_property_folder(text) from public;
grant execute on function private.is_property_host(uuid) to anon, authenticated, service_role;
grant execute on function private.can_manage_property_folder(text) to anon, authenticated, service_role;

-- Trigger-only function: never callable directly (triggers still fire).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
