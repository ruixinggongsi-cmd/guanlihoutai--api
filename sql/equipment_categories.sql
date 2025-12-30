create table public.equipment_categories (
  id uuid not null default gen_random_uuid (),
  category_name character varying(100) not null,
  parent_id uuid null,
  icon character varying(100) null,
  description text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint equipment_categories_pkey primary key (id)
) TABLESPACE pg_default;