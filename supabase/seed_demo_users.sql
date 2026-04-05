-- =============================================================================
-- Demo users: driver + passenger (run in Supabase → SQL Editor)
--
-- For a richer demo (rides, requests, inbox chats with demo@sabay.app and
-- sample@gmail.com), also run seed_dashboard_demo.sql after this file.
-- =============================================================================
-- Password for BOTH accounts: SabayDemo2026!
--
-- Prerequisites:
--   1. Migrations applied (especially 001_init + 004_handle_new_user_role.sql)
--   2. Authentication → Providers → Email: enable, allow password sign-in
--
-- Safe to re-run: skips users that already exist; syncs public.users role + vehicle.
--
-- If password login returns 500 / "confirmation_token: converting NULL to string":
--   run migrations/005_auth_users_token_strings.sql (or the UPDATE block at end of this file).
-- =============================================================================

create extension if not exists pgcrypto;

do $$
declare
  v_instance   uuid;
  v_driver_id  uuid;
  v_pass_id    uuid;
  v_pw         text := crypt('SabayDemo2026!', gen_salt('bf'));
begin
  select coalesce(
    (select id from auth.instances limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_instance;

  -- ─── Driver ───────────────────────────────────────────────────────────────
  if not exists (select 1 from auth.users where email = 'driver@demo.sabay.app') then
    v_driver_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_driver_id,
      v_instance,
      'authenticated',
      'authenticated',
      'driver@demo.sabay.app',
      v_pw,
      now(),
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Demo Driver","role":"both","username":"demo_driver"}'::jsonb,
      now(),
      now()
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_driver_id,
      jsonb_build_object('sub', v_driver_id::text, 'email', 'driver@demo.sabay.app'),
      'email',
      v_driver_id::text,
      now(),
      now(),
      now()
    );
  else
    select id into v_driver_id from auth.users where email = 'driver@demo.sabay.app' limit 1;
  end if;

  insert into public.users (id, display_name, role, username)
  values (v_driver_id, 'Demo Driver', 'both', 'demo_driver')
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    username = excluded.username;

  insert into public.vehicles (user_id, type, make_model, plate_suffix, seats_offered)
  select v_driver_id, 'sedan', 'Demo Sedan', 'D01', 3
  where not exists (select 1 from public.vehicles where user_id = v_driver_id limit 1);

  -- ─── Passenger ────────────────────────────────────────────────────────────
  if not exists (select 1 from auth.users where email = 'passenger@demo.sabay.app') then
    v_pass_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change,
      email_change_token_new,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_pass_id,
      v_instance,
      'authenticated',
      'authenticated',
      'passenger@demo.sabay.app',
      v_pw,
      now(),
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Demo Passenger","role":"both","username":"demo_passenger"}'::jsonb,
      now(),
      now()
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_pass_id,
      jsonb_build_object('sub', v_pass_id::text, 'email', 'passenger@demo.sabay.app'),
      'email',
      v_pass_id::text,
      now(),
      now(),
      now()
    );
  else
    select id into v_pass_id from auth.users where email = 'passenger@demo.sabay.app' limit 1;
  end if;

  insert into public.users (id, display_name, role, username)
  values (v_pass_id, 'Demo Passenger', 'both', 'demo_passenger')
  on conflict (id) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    username = excluded.username;

  -- Repair demo rows created by older seeds: GoTrue cannot scan NULL token columns
  update auth.users set confirmation_token = '' where email in ('driver@demo.sabay.app', 'passenger@demo.sabay.app') and confirmation_token is null;
  update auth.users set recovery_token = '' where email in ('driver@demo.sabay.app', 'passenger@demo.sabay.app') and recovery_token is null;
  update auth.users set email_change = '' where email in ('driver@demo.sabay.app', 'passenger@demo.sabay.app') and email_change is null;
  update auth.users set email_change_token_new = '' where email in ('driver@demo.sabay.app', 'passenger@demo.sabay.app') and email_change_token_new is null;

end $$;
