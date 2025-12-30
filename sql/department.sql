create table public.department (
  id uuid not null default extensions.uuid_generate_v4 (),
  parent_id uuid null,
  department_name text null,
  remarks text null,
  create_at timestamp with time zone null,
  constraint department_pkey primary key (id)
) TABLESPACE pg_default;