-- PostGIS route search function
-- Returns active driver routes where both passenger O and D are within p_radius metres of the route,
-- and pickup comes before dropoff along the line.

create or replace function public.search_matching_routes(
  p_olat float8,
  p_olng float8,
  p_dlat float8,
  p_dlng float8,
  p_radius float8 default 1000,
  p_date date default null
)
returns table (
  id                  uuid,
  driver_id           uuid,
  driver_name         text,
  origin_label        text,
  destination_label   text,
  departure_time      time,
  first_departure_date date,
  frequency           text,
  distance_km         numeric,
  duration_hours      numeric,
  vehicle_type        text,
  seats_available     int,
  computed_fare_php   numeric,
  override_fare_php   numeric,
  effective_fare_php  numeric,
  pickup_fraction     float8,
  dropoff_fraction    float8
)
language sql stable as $$
  with candidate as (
    select
      dr.*,
      ST_LineLocatePoint(
        dr.route_geom::geometry,
        ST_SetSRID(ST_MakePoint(p_olng, p_olat), 4326)
      ) as pickup_frac,
      ST_LineLocatePoint(
        dr.route_geom::geometry,
        ST_SetSRID(ST_MakePoint(p_dlng, p_dlat), 4326)
      ) as dropoff_frac
    from public.driver_routes dr
    where dr.status = 'active'
      and dr.route_geom is not null
      -- passenger origin within corridor
      and ST_DWithin(
            dr.route_geom,
            ST_SetSRID(ST_MakePoint(p_olng, p_olat), 4326)::geography,
            p_radius
          )
      -- passenger destination within corridor
      and ST_DWithin(
            dr.route_geom,
            ST_SetSRID(ST_MakePoint(p_dlng, p_dlat), 4326)::geography,
            p_radius
          )
      -- optional date filter: route serves this date
      and (
        p_date is null
        or dr.frequency = 'daily'
        or dr.frequency = 'weekdays' and extract(dow from p_date) between 1 and 5
        or dr.frequency = 'mwf'      and extract(dow from p_date) in (1, 3, 5)
        or dr.frequency = 'once'     and dr.first_departure_date = p_date
      )
  )
  select
    c.id,
    c.driver_id,
    u.display_name as driver_name,
    c.origin_label,
    c.destination_label,
    c.departure_time,
    c.first_departure_date,
    c.frequency,
    c.distance_km,
    c.duration_hours,
    c.vehicle_type,
    c.seats_available,
    c.computed_fare_php,
    c.override_fare_php,
    coalesce(c.override_fare_php, c.computed_fare_php) as effective_fare_php,
    c.pickup_frac  as pickup_fraction,
    c.dropoff_frac as dropoff_fraction
  from candidate c
  join public.users u on u.id = c.driver_id
  where c.pickup_frac < c.dropoff_frac   -- direction check
    and c.seats_available > 0
  order by c.departure_time
$$;
