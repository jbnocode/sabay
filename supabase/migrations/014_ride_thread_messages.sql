-- Group thread messages per posted ride (driver_route). Driver + passengers with
-- confirmed/in_progress bookings can read and post.

create table public.ride_thread_messages (
  id                    uuid primary key default gen_random_uuid(),
  driver_route_id       uuid not null references public.driver_routes(id) on delete cascade,
  sender_id             uuid not null references public.users(id) on delete cascade,
  body                  text not null
                          check (char_length(trim(body)) > 0 and char_length(body) <= 4000),
  created_at            timestamptz not null default now()
);

create index ride_thread_messages_route_created_at
  on public.ride_thread_messages (driver_route_id, created_at);

alter table public.ride_thread_messages enable row level security;

create or replace function public.user_in_ride_thread(p_route_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.driver_routes dr
    where dr.id = p_route_id and dr.driver_id = (select auth.uid())
  )
  or exists (
    select 1 from public.ride_bookings b
    where b.driver_route_id = p_route_id
      and b.passenger_id = (select auth.uid())
      and b.status in ('confirmed', 'in_progress')
  );
$$;

revoke all on function public.user_in_ride_thread(uuid) from public;
grant execute on function public.user_in_ride_thread(uuid) to authenticated, service_role;

create policy "ride_thread_messages_select" on public.ride_thread_messages
  for select using (public.user_in_ride_thread(driver_route_id));

create policy "ride_thread_messages_insert" on public.ride_thread_messages
  for insert with check (
    sender_id = (select auth.uid())
    and public.user_in_ride_thread(driver_route_id)
  );

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.ride_thread_messages';
  end if;
exception
  when duplicate_object then null;
end
$pub$;
