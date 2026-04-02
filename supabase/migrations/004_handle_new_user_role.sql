-- Read role from auth user_metadata on signup (for seeded / invited users)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  r text;
begin
  r := coalesce(new.raw_user_meta_data->>'role', 'both');
  if r not in ('driver', 'passenger', 'both') then
    r := 'both';
  end if;

  insert into public.users (id, display_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.phone,
    r
  );
  return new;
end;
$$;
