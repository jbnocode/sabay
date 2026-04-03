alter table public.users
  add column if not exists passenger_rating_avg numeric(3,2);
