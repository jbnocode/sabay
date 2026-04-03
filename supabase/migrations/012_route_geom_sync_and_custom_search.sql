-- Keep route_geom (PostGIS geography LineString) in sync with route_geojson so
-- search_matching_routes can use ST_DWithin / ST_LineLocatePoint.

create or replace function public.driver_routes_sync_route_geom()
returns trigger
language plpgsql
as $$
begin
  if new.route_geojson is null then
    new.route_geom := null;
  elsif (new.route_geojson->>'type') = 'LineString' then
    begin
      new.route_geom := ST_GeomFromGeoJSON(new.route_geojson::text)::geography;
    exception
      when others then
        new.route_geom := null;
    end;
  else
    new.route_geom := null;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_routes_sync_route_geom_bi on public.driver_routes;
drop trigger if exists driver_routes_sync_route_geom_bu on public.driver_routes;

create trigger driver_routes_sync_route_geom_bi
before insert on public.driver_routes
for each row execute procedure public.driver_routes_sync_route_geom();

create trigger driver_routes_sync_route_geom_bu
before update of route_geojson on public.driver_routes
for each row execute procedure public.driver_routes_sync_route_geom();

-- One-time backfill for rows that only had JSON on disk
update public.driver_routes dr
set route_geom = ST_GeomFromGeoJSON(route_geojson::text)::geography
where route_geojson is not null
  and (route_geojson->>'type') = 'LineString'
  and route_geom is null;

-- Posted rides use frequency = 'custom' with custom_days (0=Sun … 6=Sat). Include them when p_date is set.
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
      and ST_DWithin(
            dr.route_geom,
            ST_SetSRID(ST_MakePoint(p_olng, p_olat), 4326)::geography,
            p_radius
          )
      and ST_DWithin(
            dr.route_geom,
            ST_SetSRID(ST_MakePoint(p_dlng, p_dlat), 4326)::geography,
            p_radius
          )
      and (
        p_date is null
        or dr.frequency = 'daily'
        or dr.frequency = 'weekdays' and extract(dow from p_date) between 1 and 5
        or dr.frequency = 'mwf'      and extract(dow from p_date) in (1, 3, 5)
        or dr.frequency = 'once'     and dr.first_departure_date = p_date
        or dr.frequency = 'custom'
           and coalesce(array_length(dr.custom_days, 1), 0) > 0
           and extract(dow from p_date) = any (dr.custom_days)
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
  where c.pickup_frac < c.dropoff_frac
    and c.seats_available > 0
  order by c.departure_time
$$;
