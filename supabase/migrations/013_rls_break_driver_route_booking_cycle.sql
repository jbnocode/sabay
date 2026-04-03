-- Break RLS infinite recursion between driver_routes and ride_bookings:
-- booking policies read driver_routes; booking_participant policy on driver_routes
-- reads ride_bookings → Postgres aborts with "infinite recursion detected in policy".

create or replace function public.route_driver_id(p_route_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select dr.driver_id
  from public.driver_routes dr
  where dr.id = p_route_id
  limit 1;
$$;

create or replace function public.passenger_has_booking_on_route(p_route_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.ride_bookings b
    where b.driver_route_id = p_route_id
      and b.passenger_id = (select auth.uid())
  );
$$;

revoke all on function public.route_driver_id(uuid) from public;
revoke all on function public.passenger_has_booking_on_route(uuid) from public;
grant execute on function public.route_driver_id(uuid) to authenticated, service_role;
grant execute on function public.passenger_has_booking_on_route(uuid) to authenticated, service_role;

drop policy if exists "bookings_own" on public.ride_bookings;
create policy "bookings_own" on public.ride_bookings
  using (
    (select auth.uid()) = passenger_id
    or (select auth.uid()) = public.route_driver_id(driver_route_id)
  );

drop policy if exists "requests_driver_all" on public.ride_stop_requests;
create policy "requests_driver_all" on public.ride_stop_requests
  using (
    (select auth.uid()) = public.route_driver_id(driver_route_id)
  );

drop policy if exists "driver_routes_booking_participant_read" on public.driver_routes;
create policy "driver_routes_booking_participant_read" on public.driver_routes
  for select using (public.passenger_has_booking_on_route(id));
