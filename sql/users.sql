create table public.users (
  id uuid not null default extensions.uuid_generate_v4 (),
  username text null,
  loginpass text null,
  name text null,
  email text null,
  phone text null,
  department uuid null,
  status boolean null,
  roles uuid null,
  remarks text null,
  create_at timestamp with time zone null,
  constraint users_pkey primary key (id)
) TABLESPACE pg_default;