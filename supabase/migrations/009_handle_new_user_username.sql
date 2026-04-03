-- Persist optional username from auth metadata; default role both for multi-role demo
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  r text;
  uname text;
begin
  r := coalesce(new.raw_user_meta_data->>'role', 'both');
  if r not in ('driver', 'passenger', 'both') then
    r := 'both';
  end if;
  uname := nullif(trim(new.raw_user_meta_data->>'username'), '');

  insert into public.users (id, display_name, phone, role, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', uname, split_part(new.email, '@', 1)),
    new.phone,
    r,
    uname
  );
  return new;
end;
$$;
