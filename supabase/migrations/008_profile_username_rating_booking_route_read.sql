alter table public.users
  add column if not exists username text;

alter table public.users
  add column if not exists driver_rating_avg numeric(3,2);

-- Passengers can read driver_route rows tied to their bookings (for trip history on profile)
create policy "driver_routes_booking_participant_read" on public.driver_routes
  for select using (
    exists (
      select 1 from public.ride_bookings b
      where b.driver_route_id = driver_routes.id
        and b.passenger_id = auth.uid()
    )
  );
