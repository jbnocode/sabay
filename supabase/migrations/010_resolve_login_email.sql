-- Map username → auth email for sign-in (used only with service role from server)
create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  s text := trim(p_identifier);
begin
  if s is null or s = '' then
    return null;
  end if;
  if position('@' in s) > 0 then
    return lower(s);
  end if;
  select au.email::text into v_email
  from auth.users au
  inner join public.users pu on pu.id = au.id
  where pu.username is not null
    and lower(pu.username) = lower(s)
  limit 1;
  return v_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to service_role;
