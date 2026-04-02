-- Enable PostGIS
create extension if not exists postgis;

-- ─── USERS (profile mirror of auth.users) ────────────────────────────────────
create table public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  phone           text,
  phone_verified  boolean default false,
  avatar_url      text,
  role            text not null default 'both' check (role in ('driver','passenger','both')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.users enable row level security;
create policy "users_own" on public.users using (auth.uid() = id);
create policy "users_public_read" on public.users for select using (true);

-- ─── VEHICLES ─────────────────────────────────────────────────────────────────
create table public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  type            text not null check (type in ('sedan','suv','hatchback')),
  make_model      text,
  plate_suffix    text,          -- last 3 chars for display privacy
  seats_offered   int not null default 3,
  created_at      timestamptz not null default now()
);
alter table public.vehicles enable row level security;
create policy "vehicles_own" on public.vehicles using (auth.uid() = user_id);
create policy "vehicles_public_read" on public.vehicles for select using (true);

-- ─── DRIVER ROUTES ────────────────────────────────────────────────────────────
create table public.driver_routes (
  id                    uuid primary key default gen_random_uuid(),
  driver_id             uuid not null references public.users(id) on delete cascade,
  vehicle_id            uuid references public.vehicles(id),
  status                text not null default 'draft'
                          check (status in ('draft','active','completed','cancelled')),

  -- scheduling
  frequency             text not null default 'once'
                          check (frequency in ('once','daily','weekdays','mwf','custom')),
  custom_days           int[],                -- 0=Sun … 6=Sat
  departure_time        time not null,
  first_departure_date  date not null,
  timezone              text not null default 'Asia/Manila',

  -- places
  origin_label          text,
  destination_label     text,
  origin_geom           geography(Point, 4326) not null,
  destination_geom      geography(Point, 4326) not null,
  route_geom            geography(LineString, 4326),
  route_geojson         jsonb,                -- raw GeoJSON for client decoding
  distance_km           numeric,
  duration_hours        numeric,

  -- fare
  vehicle_type          text check (vehicle_type in ('sedan','suv','hatchback')),
  gas_price_php_per_l   numeric,
  computed_fare_php     numeric,              -- formula result per seat
  override_fare_php     numeric,              -- driver-set override (nullable)
  fare_formula_version  text default 'v1',
  seats_available       int not null default 3,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.driver_routes enable row level security;
create policy "routes_own_write" on public.driver_routes
  using (auth.uid() = driver_id);
create policy "routes_public_read" on public.driver_routes
  for select using (status = 'active');

-- Spatial index for ST_DWithin matching
create index driver_routes_geom_idx on public.driver_routes using gist (route_geom);
create index driver_routes_driver_status on public.driver_routes (driver_id, status, first_departure_date);

-- ─── RIDE STOP REQUESTS ───────────────────────────────────────────────────────
create table public.ride_stop_requests (
  id                uuid primary key default gen_random_uuid(),
  driver_route_id   uuid not null references public.driver_routes(id) on delete cascade,
  passenger_id      uuid not null references public.users(id) on delete cascade,
  pickup_geom       geography(Point, 4326) not null,
  dropoff_geom      geography(Point, 4326) not null,
  pickup_label      text,
  dropoff_label     text,
  pickup_fraction   numeric,                 -- 0..1 along line
  dropoff_fraction  numeric,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected','cancelled')),
  passenger_note    text,
  driver_note       text,
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);
alter table public.ride_stop_requests enable row level security;
create policy "requests_passenger_insert" on public.ride_stop_requests
  for insert with check (auth.uid() = passenger_id);
create policy "requests_passenger_read" on public.ride_stop_requests
  for select using (auth.uid() = passenger_id);
create policy "requests_driver_all" on public.ride_stop_requests
  using (
    auth.uid() = (
      select driver_id from public.driver_routes
      where id = driver_route_id
    )
  );

-- ─── RIDE BOOKINGS ────────────────────────────────────────────────────────────
create table public.ride_bookings (
  id                  uuid primary key default gen_random_uuid(),
  driver_route_id     uuid not null references public.driver_routes(id),
  passenger_id        uuid not null references public.users(id),
  linked_request_id   uuid references public.ride_stop_requests(id),
  pickup_geom         geography(Point, 4326) not null,
  dropoff_geom        geography(Point, 4326) not null,
  pickup_label        text,
  dropoff_label       text,
  agreed_fare_php     numeric not null,
  currency            text not null default 'PHP',
  status              text not null default 'confirmed'
                        check (status in ('confirmed','in_progress','completed','cancelled','disputed')),
  created_at          timestamptz not null default now()
);
alter table public.ride_bookings enable row level security;
create policy "bookings_own" on public.ride_bookings
  using (
    auth.uid() = passenger_id or
    auth.uid() = (
      select driver_id from public.driver_routes where id = driver_route_id
    )
  );

-- ─── TRANSACTIONS (phase 1.5) ─────────────────────────────────────────────────
create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.ride_bookings(id),
  provider      text default 'manual' check (provider in ('paymongo','stripe','manual')),
  amount_php    numeric not null,
  fee_php       numeric not null default 0,
  status        text not null default 'pending'
                  check (status in ('pending','succeeded','failed','refunded')),
  provider_ref  text,
  created_at    timestamptz not null default now()
);
alter table public.transactions enable row level security;
create policy "transactions_own" on public.transactions
  using (
    auth.uid() = (
      select passenger_id from public.ride_bookings where id = booking_id
    )
  );

-- ─── TRIGGER: updated_at ──────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger users_updated_at before update on public.users
  for each row execute procedure public.touch_updated_at();
create trigger driver_routes_updated_at before update on public.driver_routes
  for each row execute procedure public.touch_updated_at();

-- ─── FUNCTION: create user profile on signup ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, display_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    new.phone
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();
