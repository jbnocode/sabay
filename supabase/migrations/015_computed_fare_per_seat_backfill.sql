-- Historic bug: fare was calculated with seats=1 in the app, so computed_fare_php
-- stored full-trip cost while UI treated it as per passenger. Split by seats_offered
-- for rows still on v1, then mark v2 so we do not double-adjust.

update public.driver_routes
set
  computed_fare_php = greatest(
    20::numeric,
    round((computed_fare_php::numeric / greatest(seats_available, 1))::numeric, 0)
  ),
  fare_formula_version = 'v2'
where computed_fare_php is not null
  and seats_available is not null
  and seats_available >= 1
  and coalesce(fare_formula_version, 'v1') = 'v1';
