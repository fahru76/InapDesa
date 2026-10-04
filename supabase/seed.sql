-- Demo listing so the guest flow works immediately after migrating.
-- host_id is NULL until you claim it (see README → "Claim the demo property").
-- Rates are in minor units: 38000 = RM 380.00

insert into public.properties (
  slug, title, tagline, description,
  address_line, city, region, country, latitude, longitude,
  bedrooms, beds, bathrooms, max_guests, max_infants,
  amenities, house_rules, check_in_time, check_out_time,
  currency, weekday_rate, weekend_rate, weekend_days,
  cleaning_fee, security_deposit, min_nights, max_nights,
  payment_policy, deposit_percent, cancellation_policy,
  host_display_name, host_bio, host_languages, host_since,
  is_published
) values (
  'teratak-senja',
  'Teratak Senja — Heritage Timber Villa',
  'A restored kampung house above the paddy fields, made for slow mornings.',
  E'Teratak Senja is a fully restored 1950s timber house raised on stilts, surrounded by paddy fields and coconut groves. '
  || E'Original chengal floors and carved ventilation panels sit alongside modern comforts: rain showers, a chef''s kitchen, and fast fibre Wi-Fi.\n\n'
  || E'Spend the day on the wraparound verandah, cycle to the morning market, or cool off in the private plunge pool before watching the sunset turn the fields gold.',
  'Lot 1127, Jalan Sawah Indah', 'Kuala Kangsar', 'Perak', 'Malaysia', 4.773500, 100.941200,
  3, 4, 2.0, 8, 2,
  array['wifi','air_conditioning','kitchen','pool','free_parking','washer','workspace','bbq','garden','hot_water','family_friendly','prayer_space'],
  array['No smoking indoors','No parties or events','Quiet hours 11pm – 7am','Please remove shoes inside the house'],
  '15:00', '12:00',
  'MYR', 38000, 52000, '{5,6}',
  8000, 30000, 2, 21,
  'deposit', 50,
  'Free cancellation up to 7 days before check-in for a full refund of the deposit. Within 7 days the deposit is non-refundable.',
  'Aishah & Hafiz',
  'We grew up a few kilometres from this house and spent three years restoring it with local craftsmen. We live nearby and love sharing hidden food stalls and river walks with guests.',
  array['English','Bahasa Melayu'],
  '2021-03-01',
  true
)
on conflict (slug) do nothing;

-- A few closed nights so the calendar shows blocked days
insert into public.blocked_dates (property_id, date, reason)
select p.id, d::date, 'Owner stay'
from public.properties p,
     generate_series(current_date + 18, current_date + 20, interval '1 day') d
where p.slug = 'teratak-senja'
on conflict do nothing;
