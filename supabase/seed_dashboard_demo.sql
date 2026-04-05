-- =============================================================================
-- Dashboard demo: demo@sabay.app ↔ sample@gmail.com (rides, requests, inbox)
-- =============================================================================
-- 1) Run "STATEMENT 1 — auth bootstrap" below (the `do $$ ... end $$;` block) once.
-- 2) Run "STATEMENT 2 — demo data" — either the whole section in one run, or each
--    `insert` / `delete` as its own statement (each is valid standalone SQL).
--
-- Passwords: demo@sabay.app → demo.sabay | sample@gmail.com → sample.sabay
-- =============================================================================

create extension if not exists pgcrypto;

-- ═══ STATEMENT 1 — auth bootstrap (run this block as one query) ═══════════
do $$
declare
  v_instance   uuid;
  v_demo_id    uuid;
  v_sample_id  uuid;
  v_pw_demo    text := crypt('demo.sabay', gen_salt('bf'));
  v_pw_sample  text := crypt('sample.sabay', gen_salt('bf'));
begin
  select coalesce(
    (select id from auth.instances limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_instance;

  if not exists (select 1 from auth.users where lower(email) = lower('demo@sabay.app')) then
    v_demo_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token, email_change, email_change_token_new,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_demo_id, v_instance, 'authenticated', 'authenticated', 'demo@sabay.app', v_pw_demo,
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Sabay Demo","role":"both","username":"sabay_demo"}'::jsonb,
      now(), now()
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_demo_id,
      jsonb_build_object('sub', v_demo_id::text, 'email', 'demo@sabay.app'),
      'email', v_demo_id::text, now(), now(), now()
    );
  else
    select id into v_demo_id from auth.users where lower(email) = lower('demo@sabay.app') limit 1;
    update auth.users
    set encrypted_password = v_pw_demo,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || '{"display_name":"Sabay Demo","role":"both","username":"sabay_demo"}'::jsonb
    where id = v_demo_id;
  end if;

  insert into public.users (id, display_name, role, username)
  values (v_demo_id, 'Sabay Demo', 'both', 'sabay_demo')
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    username = excluded.username;

  insert into public.vehicles (user_id, type, make_model, plate_suffix, seats_offered)
  select v_demo_id, 'sedan', 'Demo White Sedan', 'X7', 3
  where not exists (select 1 from public.vehicles where user_id = v_demo_id limit 1);

  if not exists (select 1 from auth.users where lower(email) = lower('sample@gmail.com')) then
    v_sample_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token, email_change, email_change_token_new,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_sample_id, v_instance, 'authenticated', 'authenticated', 'sample@gmail.com', v_pw_sample,
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Sample Rider","role":"both","username":"sample_rider"}'::jsonb,
      now(), now()
    );
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_sample_id,
      jsonb_build_object('sub', v_sample_id::text, 'email', 'sample@gmail.com'),
      'email', v_sample_id::text, now(), now(), now()
    );
  else
    select id into v_sample_id from auth.users where lower(email) = lower('sample@gmail.com') limit 1;
    update auth.users
    set encrypted_password = v_pw_sample,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || '{"display_name":"Sample Rider","role":"both","username":"sample_rider"}'::jsonb
    where id = v_sample_id;
  end if;

  insert into public.users (id, display_name, role, username)
  values (v_sample_id, 'Sample Rider', 'both', 'sample_rider')
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    username = excluded.username;

  insert into public.vehicles (user_id, type, make_model, plate_suffix, seats_offered)
  select v_sample_id, 'hatchback', 'Sample Blue Hatch', 'S2', 3
  where not exists (select 1 from public.vehicles where user_id = v_sample_id limit 1);

  update auth.users set confirmation_token = '' where id in (v_demo_id, v_sample_id) and confirmation_token is null;
  update auth.users set recovery_token = '' where id in (v_demo_id, v_sample_id) and recovery_token is null;
  update auth.users set email_change = '' where id in (v_demo_id, v_sample_id) and email_change is null;
  update auth.users set email_change_token_new = '' where id in (v_demo_id, v_sample_id) and email_change_token_new is null;
end $$;


-- ═══ STATEMENT 2 — demo data (run after Statement 1) ═════════════════════

delete from public.ride_thread_messages
  where driver_route_id in ('f00d1001-0000-4000-8000-000000000001','f00d1002-0000-4000-8000-000000000002',
'f00d1007-0000-4000-8000-000000000007','f00d1008-0000-4000-8000-000000000008','f00d1009-0000-4000-8000-000000000009',
'f00d1010-0000-4000-8000-000000000010','f00d1011-0000-4000-8000-000000000011','f00d1012-0000-4000-8000-000000000012',
'f00d1013-0000-4000-8000-000000000013','f00d1014-0000-4000-8000-000000000014','f00d1015-0000-4000-8000-000000000015',
'f00d1016-0000-4000-8000-000000000016','f00d1017-0000-4000-8000-000000000017','f00d1018-0000-4000-8000-000000000018',
'f00d1019-0000-4000-8000-000000000019','f00d101a-0000-4000-8000-00000000001a','f00d101b-0000-4000-8000-00000000001b',
'f00d101c-0000-4000-8000-00000000001c','f00d101d-0000-4000-8000-00000000001d','f00d101e-0000-4000-8000-00000000001e');
delete from public.ride_bookings
  where driver_route_id in ('f00d1001-0000-4000-8000-000000000001','f00d1002-0000-4000-8000-000000000002',
'f00d1007-0000-4000-8000-000000000007','f00d1008-0000-4000-8000-000000000008','f00d1009-0000-4000-8000-000000000009',
'f00d1010-0000-4000-8000-000000000010','f00d1011-0000-4000-8000-000000000011','f00d1012-0000-4000-8000-000000000012',
'f00d1013-0000-4000-8000-000000000013','f00d1014-0000-4000-8000-000000000014','f00d1015-0000-4000-8000-000000000015',
'f00d1016-0000-4000-8000-000000000016','f00d1017-0000-4000-8000-000000000017','f00d1018-0000-4000-8000-000000000018',
'f00d1019-0000-4000-8000-000000000019','f00d101a-0000-4000-8000-00000000001a','f00d101b-0000-4000-8000-00000000001b',
'f00d101c-0000-4000-8000-00000000001c','f00d101d-0000-4000-8000-00000000001d','f00d101e-0000-4000-8000-00000000001e');
delete from public.ride_stop_requests
  where driver_route_id in ('f00d1001-0000-4000-8000-000000000001','f00d1002-0000-4000-8000-000000000002',
'f00d1007-0000-4000-8000-000000000007','f00d1008-0000-4000-8000-000000000008','f00d1009-0000-4000-8000-000000000009',
'f00d1010-0000-4000-8000-000000000010','f00d1011-0000-4000-8000-000000000011','f00d1012-0000-4000-8000-000000000012',
'f00d1013-0000-4000-8000-000000000013','f00d1014-0000-4000-8000-000000000014','f00d1015-0000-4000-8000-000000000015',
'f00d1016-0000-4000-8000-000000000016','f00d1017-0000-4000-8000-000000000017','f00d1018-0000-4000-8000-000000000018',
'f00d1019-0000-4000-8000-000000000019','f00d101a-0000-4000-8000-00000000001a','f00d101b-0000-4000-8000-00000000001b',
'f00d101c-0000-4000-8000-00000000001c','f00d101d-0000-4000-8000-00000000001d','f00d101e-0000-4000-8000-00000000001e');
delete from public.driver_routes
  where id in ('f00d1001-0000-4000-8000-000000000001','f00d1002-0000-4000-8000-000000000002',
'f00d1007-0000-4000-8000-000000000007','f00d1008-0000-4000-8000-000000000008','f00d1009-0000-4000-8000-000000000009',
'f00d1010-0000-4000-8000-000000000010','f00d1011-0000-4000-8000-000000000011','f00d1012-0000-4000-8000-000000000012',
'f00d1013-0000-4000-8000-000000000013','f00d1014-0000-4000-8000-000000000014','f00d1015-0000-4000-8000-000000000015',
'f00d1016-0000-4000-8000-000000000016','f00d1017-0000-4000-8000-000000000017','f00d1018-0000-4000-8000-000000000018',
'f00d1019-0000-4000-8000-000000000019','f00d101a-0000-4000-8000-00000000001a','f00d101b-0000-4000-8000-00000000001b',
'f00d101c-0000-4000-8000-00000000001c','f00d101d-0000-4000-8000-00000000001d','f00d101e-0000-4000-8000-00000000001e');

insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1001-0000-4000-8000-000000000001'::uuid,
  u.id,
  'active',
  'daily',
  null::int[],
  '07:00:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Araneta Center, Quezon City',
  'Ayala Avenue, Makati',
  'SRID=4326;POINT(121.052 14.619)'::geography,
  'SRID=4326;POINT(121.028 14.545)'::geography,
  '{"type":"LineString","coordinates":[[121.052,14.619],[121.048,14.602],[121.042,14.582],[121.035,14.565],[121.028,14.545]]}'::jsonb,
  18.5::numeric,
  1.1::numeric,
  'hatchback',
  62,
  120::numeric,
  null,
  'v2',
  2,
  '[seed] Weekday mornings toward Makati CBD.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1002-0000-4000-8000-000000000002'::uuid,
  u.id,
  'active',
  'daily',
  null::int[],
  '07:30:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Kapitolyo, Pasig',
  'Bonifacio Global City, Taguig',
  'SRID=4326;POINT(121.067 14.576)'::geography,
  'SRID=4326;POINT(121.048 14.545)'::geography,
  '{"type":"LineString","coordinates":[[121.067,14.576],[121.062,14.568],[121.058,14.560],[121.053,14.552],[121.048,14.545]]}'::jsonb,
  12.0::numeric,
  0.75::numeric,
  'sedan',
  62,
  95::numeric,
  null,
  'v2',
  2,
  '[seed] Pasig → BGC carpool; happy to adjust pickup slightly.'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1007-0000-4000-8000-000000000007'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '05:45:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Fairview, Quezon City',
  'Ortigas Center, Pasig',
  'SRID=4326;POINT(121.043 14.716)'::geography,
  'SRID=4326;POINT(121.06 14.586)'::geography,
  '{"type":"LineString","coordinates":[[121.043,14.716],[121.048,14.685],[121.052,14.652],[121.056,14.618],[121.058,14.585],[121.060,14.586]]}'::jsonb,
  24.0::numeric,
  1.45::numeric,
  'sedan',
  62,
  155::numeric,
  null,
  'v2',
  3,
  '[seed] Early bird Fairview → Ortigas (C5-side corridor).'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1008-0000-4000-8000-000000000008'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '06:15:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Marikina City',
  'Bonifacio Global City, Taguig',
  'SRID=4326;POINT(121.108 14.652)'::geography,
  'SRID=4326;POINT(121.05 14.548)'::geography,
  '{"type":"LineString","coordinates":[[121.108,14.652],[121.098,14.628],[121.085,14.602],[121.072,14.578],[121.058,14.558],[121.050,14.548]]}'::jsonb,
  22.0::numeric,
  1.35::numeric,
  'suv',
  62,
  148::numeric,
  null,
  'v2',
  2,
  '[seed] Rizal-side commuters to BGC; Marcos Hwy / C5-ish path.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1009-0000-4000-8000-000000000009'::uuid,
  u.id,
  'active',
  'daily',
  null::int[],
  '06:00:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Las Piñas City',
  'Makati CBD',
  'SRID=4326;POINT(120.992 14.432)'::geography,
  'SRID=4326;POINT(121.026 14.558)'::geography,
  '{"type":"LineString","coordinates":[[120.992,14.432],[121.005,14.455],[121.015,14.485],[121.022,14.515],[121.024,14.545],[121.026,14.558]]}'::jsonb,
  26.0::numeric,
  1.55::numeric,
  'sedan',
  62,
  168::numeric,
  null,
  'v2',
  2,
  '[seed] South NCR → Makati; SLEX corridor feel.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1010-0000-4000-8000-000000000010'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '06:30:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Monumento, Caloocan',
  'Ayala Avenue, Makati',
  'SRID=4326;POINT(120.983 14.657)'::geography,
  'SRID=4326;POINT(121.028 14.552)'::geography,
  '{"type":"LineString","coordinates":[[120.983,14.657],[120.995,14.625],[121.012,14.595],[121.022,14.570],[121.028,14.552]]}'::jsonb,
  21.0::numeric,
  1.3::numeric,
  'hatchback',
  62,
  142::numeric,
  null,
  'v2',
  3,
  '[seed] North Caloocan → Makati CBD.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1011-0000-4000-8000-000000000011'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '06:00:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Cainta, Rizal',
  'Ortigas Center, Pasig',
  'SRID=4326;POINT(121.124 14.622)'::geography,
  'SRID=4326;POINT(121.059 14.586)'::geography,
  '{"type":"LineString","coordinates":[[121.124,14.622],[121.108,14.608],[121.088,14.598],[121.068,14.592],[121.059,14.586]]}'::jsonb,
  14.0::numeric,
  0.85::numeric,
  'hatchback',
  62,
  105::numeric,
  null,
  'v2',
  3,
  '[seed] East Rizal → Ortigas; short hop for junction commuters.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1014-0000-4000-8000-000000000014'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '05:30:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Taytay, Rizal',
  'Taguig City (BGC area)',
  'SRID=4326;POINT(121.132 14.588)'::geography,
  'SRID=4326;POINT(121.048 14.545)'::geography,
  '{"type":"LineString","coordinates":[[121.132,14.588],[121.115,14.575],[121.095,14.565],[121.075,14.555],[121.055,14.548],[121.048,14.545]]}'::jsonb,
  28.0::numeric,
  1.65::numeric,
  'suv',
  62,
  175::numeric,
  null,
  'v2',
  2,
  '[seed] Long east corridor toward Taguig / BGC.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1012-0000-4000-8000-000000000012'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '06:45:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Alabang, Muntinlupa',
  'Bonifacio Global City, Taguig',
  'SRID=4326;POINT(121.016 14.418)'::geography,
  'SRID=4326;POINT(121.049 14.548)'::geography,
  '{"type":"LineString","coordinates":[[121.016,14.418],[121.022,14.445],[121.032,14.475],[121.042,14.505],[121.048,14.532],[121.049,14.548]]}'::jsonb,
  19.0::numeric,
  1.15::numeric,
  'sedan',
  62,
  128::numeric,
  null,
  'v2',
  2,
  '[seed] South Station area → BGC.'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1013-0000-4000-8000-000000000013'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '06:20:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Commonwealth, Quezon City',
  'Ortigas Center, Pasig',
  'SRID=4326;POINT(121.075 14.695)'::geography,
  'SRID=4326;POINT(121.06 14.586)'::geography,
  '{"type":"LineString","coordinates":[[121.075,14.695],[121.068,14.665],[121.062,14.635],[121.059,14.608],[121.059,14.590],[121.060,14.586]]}'::jsonb,
  20.0::numeric,
  1.25::numeric,
  'sedan',
  62,
  135::numeric,
  null,
  'v2',
  3,
  '[seed] Diliman / Commonwealth workers to Ortigas.'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1015-0000-4000-8000-000000000015'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '18:00:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Ayala Avenue, Makati',
  'Araneta Center, Quezon City',
  'SRID=4326;POINT(121.028 14.545)'::geography,
  'SRID=4326;POINT(121.052 14.619)'::geography,
  '{"type":"LineString","coordinates":[[121.028,14.545],[121.035,14.565],[121.042,14.582],[121.048,14.602],[121.052,14.619]]}'::jsonb,
  18.5::numeric,
  1.15::numeric,
  'hatchback',
  62,
  120::numeric,
  null,
  'v2',
  2,
  '[seed] Pauwi: Makati CBD → Cubao / Araneta (evenings).'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1016-0000-4000-8000-000000000016'::uuid,
  u.id,
  'active',
  'daily',
  null::int[],
  '18:15:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Bonifacio Global City, Taguig',
  'Kapitolyo, Pasig',
  'SRID=4326;POINT(121.048 14.545)'::geography,
  'SRID=4326;POINT(121.067 14.576)'::geography,
  '{"type":"LineString","coordinates":[[121.048,14.545],[121.053,14.552],[121.058,14.560],[121.062,14.568],[121.067,14.576]]}'::jsonb,
  12.0::numeric,
  0.8::numeric,
  'sedan',
  62,
  95::numeric,
  null,
  'v2',
  2,
  '[seed] Pauwi: BGC → Kapitolyo / Pasig.'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1017-0000-4000-8000-000000000017'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '17:45:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Ortigas Center, Pasig',
  'Fairview, Quezon City',
  'SRID=4326;POINT(121.06 14.586)'::geography,
  'SRID=4326;POINT(121.043 14.716)'::geography,
  '{"type":"LineString","coordinates":[[121.060,14.586],[121.058,14.585],[121.056,14.618],[121.052,14.652],[121.048,14.685],[121.043,14.716]]}'::jsonb,
  24.0::numeric,
  1.5::numeric,
  'sedan',
  62,
  155::numeric,
  null,
  'v2',
  3,
  '[seed] Pauwi: Ortigas → Fairview.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1018-0000-4000-8000-000000000018'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '18:30:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Bonifacio Global City, Taguig',
  'Marikina City',
  'SRID=4326;POINT(121.05 14.548)'::geography,
  'SRID=4326;POINT(121.108 14.652)'::geography,
  '{"type":"LineString","coordinates":[[121.050,14.548],[121.058,14.558],[121.072,14.578],[121.085,14.602],[121.098,14.628],[121.108,14.652]]}'::jsonb,
  22.0::numeric,
  1.4::numeric,
  'suv',
  62,
  148::numeric,
  null,
  'v2',
  2,
  '[seed] Pauwi: BGC → Marikina.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d1019-0000-4000-8000-000000000019'::uuid,
  u.id,
  'active',
  'daily',
  null::int[],
  '18:45:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Makati CBD',
  'Las Piñas City',
  'SRID=4326;POINT(121.026 14.558)'::geography,
  'SRID=4326;POINT(120.992 14.432)'::geography,
  '{"type":"LineString","coordinates":[[121.026,14.558],[121.024,14.545],[121.022,14.515],[121.015,14.485],[121.005,14.455],[120.992,14.432]]}'::jsonb,
  26.0::numeric,
  1.6::numeric,
  'sedan',
  62,
  168::numeric,
  null,
  'v2',
  2,
  '[seed] Pauwi: Makati → Las Piñas.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d101a-0000-4000-8000-00000000001a'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '18:00:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Ayala Avenue, Makati',
  'Monumento, Caloocan',
  'SRID=4326;POINT(121.028 14.552)'::geography,
  'SRID=4326;POINT(120.983 14.657)'::geography,
  '{"type":"LineString","coordinates":[[121.028,14.552],[121.022,14.570],[121.012,14.595],[120.995,14.625],[120.983,14.657]]}'::jsonb,
  21.0::numeric,
  1.35::numeric,
  'hatchback',
  62,
  142::numeric,
  null,
  'v2',
  3,
  '[seed] Pauwi: Makati → Monumento.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d101b-0000-4000-8000-00000000001b'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '18:15:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Ortigas Center, Pasig',
  'Cainta, Rizal',
  'SRID=4326;POINT(121.059 14.586)'::geography,
  'SRID=4326;POINT(121.124 14.622)'::geography,
  '{"type":"LineString","coordinates":[[121.059,14.586],[121.068,14.592],[121.088,14.598],[121.108,14.608],[121.124,14.622]]}'::jsonb,
  14.0::numeric,
  0.9::numeric,
  'hatchback',
  62,
  105::numeric,
  null,
  'v2',
  3,
  '[seed] Pauwi: Ortigas → Cainta.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d101c-0000-4000-8000-00000000001c'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '18:30:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Taguig City (BGC area)',
  'Taytay, Rizal',
  'SRID=4326;POINT(121.048 14.545)'::geography,
  'SRID=4326;POINT(121.132 14.588)'::geography,
  '{"type":"LineString","coordinates":[[121.048,14.545],[121.055,14.548],[121.075,14.555],[121.095,14.565],[121.115,14.575],[121.132,14.588]]}'::jsonb,
  28.0::numeric,
  1.7::numeric,
  'suv',
  62,
  175::numeric,
  null,
  'v2',
  2,
  '[seed] Pauwi: BGC / Taguig → Taytay.'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d101d-0000-4000-8000-00000000001d'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '18:30:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Bonifacio Global City, Taguig',
  'Alabang, Muntinlupa',
  'SRID=4326;POINT(121.049 14.548)'::geography,
  'SRID=4326;POINT(121.016 14.418)'::geography,
  '{"type":"LineString","coordinates":[[121.049,14.548],[121.048,14.532],[121.042,14.505],[121.032,14.475],[121.022,14.445],[121.016,14.418]]}'::jsonb,
  19.0::numeric,
  1.2::numeric,
  'sedan',
  62,
  128::numeric,
  null,
  'v2',
  2,
  '[seed] Pauwi: BGC → Alabang.'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;
insert into public.driver_routes (
  id, driver_id, status, frequency, custom_days, departure_time, first_departure_date, timezone,
  origin_label, destination_label, origin_geom, destination_geom, route_geojson,
  distance_km, duration_hours, vehicle_type, gas_price_php_per_l,
  computed_fare_php, override_fare_php, fare_formula_version, seats_available, passenger_note
)
select
  'f00d101e-0000-4000-8000-00000000001e'::uuid,
  u.id,
  'active',
  'weekdays',
  null::int[],
  '18:00:00'::time,
  (timezone('Asia/Manila', now()))::date - 30,
  'Asia/Manila',
  'Ortigas Center, Pasig',
  'Commonwealth, Quezon City',
  'SRID=4326;POINT(121.06 14.586)'::geography,
  'SRID=4326;POINT(121.075 14.695)'::geography,
  '{"type":"LineString","coordinates":[[121.060,14.586],[121.059,14.590],[121.059,14.608],[121.062,14.635],[121.068,14.665],[121.075,14.695]]}'::jsonb,
  20.0::numeric,
  1.3::numeric,
  'sedan',
  62,
  135::numeric,
  null,
  'v2',
  3,
  '[seed] Pauwi: Ortigas → Commonwealth.'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;

-- Pending requests (passenger id from auth)
insert into public.ride_stop_requests (
  id, driver_route_id, passenger_id,
  pickup_geom, dropoff_geom, pickup_label, dropoff_label,
  pickup_fraction, dropoff_fraction, status, passenger_note, created_at
)
select
  'f00d1004-0000-4000-8000-000000000004'::uuid,
  'f00d1002-0000-4000-8000-000000000002'::uuid,
  u.id,
  'SRID=4326;POINT(121.064 14.572)'::geography,
  'SRID=4326;POINT(121.051 14.548)'::geography,
  'Ortigas Ave near Robinsons',
  'High Street, BGC',
  0.14, 0.86, 'pending',
  'Usually ready 5 min early — text when close.',
  now() - interval '2 hours'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;

insert into public.ride_stop_requests (
  id, driver_route_id, passenger_id,
  pickup_geom, dropoff_geom, pickup_label, dropoff_label,
  pickup_fraction, dropoff_fraction, status, passenger_note, created_at
)
select
  'f00d1003-0000-4000-8000-000000000003'::uuid,
  'f00d1001-0000-4000-8000-000000000001'::uuid,
  u.id,
  'SRID=4326;POINT(121.048 14.608)'::geography,
  'SRID=4326;POINT(121.032 14.558)'::geography,
  'Cubao, Aurora Blvd side',
  'Greenbelt area, Makati',
  0.18, 0.82, 'pending',
  'First time using Sabay — thanks!',
  now() - interval '1 day'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;

insert into public.ride_bookings (
  id, driver_route_id, passenger_id, linked_request_id,
  pickup_geom, dropoff_geom, pickup_label, dropoff_label,
  agreed_fare_php, currency, status, created_at
)
select
  'f00d1005-0000-4000-8000-000000000005'::uuid,
  'f00d1001-0000-4000-8000-000000000001'::uuid,
  u.id,
  null,
  'SRID=4326;POINT(121.05 14.612)'::geography,
  'SRID=4326;POINT(121.03 14.552)'::geography,
  'Near Smart Araneta Coliseum',
  'Legazpi Village, Makati',
  120, 'PHP', 'confirmed',
  now() - interval '3 days'
from auth.users u
where lower(u.email) = lower('demo@sabay.app')
limit 1;

insert into public.ride_bookings (
  id, driver_route_id, passenger_id, linked_request_id,
  pickup_geom, dropoff_geom, pickup_label, dropoff_label,
  agreed_fare_php, currency, status, created_at
)
select
  'f00d1006-0000-4000-8000-000000000006'::uuid,
  'f00d1002-0000-4000-8000-000000000002'::uuid,
  u.id,
  null,
  'SRID=4326;POINT(121.063 14.571)'::geography,
  'SRID=4326;POINT(121.049 14.546)'::geography,
  'Emerald Ave, Ortigas',
  'BGC Stopover',
  95, 'PHP', 'confirmed',
  now() - interval '4 days'
from auth.users u
where lower(u.email) = lower('sample@gmail.com')
limit 1;

insert into public.ride_thread_messages (driver_route_id, sender_id, body, created_at)
select 'f00d1001-0000-4000-8000-000000000001'::uuid, u.id,
  'Hi! I usually leave right at 7:00 from Araneta — I''ll ping if traffic is heavy.', now() - interval '3 days'
from auth.users u where lower(u.email) = lower('sample@gmail.com') limit 1;

insert into public.ride_thread_messages (driver_route_id, sender_id, body, created_at)
select 'f00d1001-0000-4000-8000-000000000001'::uuid, u.id,
  'Sounds good. I''ll be by the coliseum side, gray backpack.', now() - interval '3 days' + interval '12 minutes'
from auth.users u where lower(u.email) = lower('demo@sabay.app') limit 1;

insert into public.ride_thread_messages (driver_route_id, sender_id, body, created_at)
select 'f00d1001-0000-4000-8000-000000000001'::uuid, u.id,
  'Copy that. See you tomorrow.', now() - interval '3 days' + interval '25 minutes'
from auth.users u where lower(u.email) = lower('sample@gmail.com') limit 1;

insert into public.ride_thread_messages (driver_route_id, sender_id, body, created_at)
select 'f00d1002-0000-4000-8000-000000000002'::uuid, u.id,
  'Morning! Kapitolyo pickup — I''m in a white sedan, plate ends in X7.', now() - interval '4 days'
from auth.users u where lower(u.email) = lower('demo@sabay.app') limit 1;

insert into public.ride_thread_messages (driver_route_id, sender_id, body, created_at)
select 'f00d1002-0000-4000-8000-000000000002'::uuid, u.id,
  'Thanks! I''m at Emerald — will walk toward the main road.', now() - interval '4 days' + interval '8 minutes'
from auth.users u where lower(u.email) = lower('sample@gmail.com') limit 1;

insert into public.ride_thread_messages (driver_route_id, sender_id, body, created_at)
select 'f00d1002-0000-4000-8000-000000000002'::uuid, u.id,
  'Perfect. ETA 7:25 at your pin.', now() - interval '4 days' + interval '15 minutes'
from auth.users u where lower(u.email) = lower('demo@sabay.app') limit 1;
