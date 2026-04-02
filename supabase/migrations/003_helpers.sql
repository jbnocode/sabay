-- Atomic seat decrement (called after approving a request)
create or replace function public.decrement_seats(route_id uuid)
returns void language sql as $$
  update public.driver_routes
  set seats_available = greatest(0, seats_available - 1)
  where id = route_id;
$$;
