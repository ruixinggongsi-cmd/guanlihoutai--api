create table public.customers (
  id uuid not null default gen_random_uuid (),
  name text not null,
  company text null,
  phone text not null,
  email text null,
  status text null default 'active'::text,
  source text null default 'online'::text,
  address text null,
  notes text null,
  last_connect_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  created_by uuid null,
  constraint customers_pkey primary key (id),
  constraint customers_source_check check (
    (
      source = any (
        array[
          'online'::text,
          'offline'::text,
          'referral'::text,
          'other'::text
        ]
      )
    )
  ),
  constraint customers_status_check check (
    (
      status = any (
        array['active'::text, 'inactive'::text, 'vip'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_customers_name on public.customers using btree (name) TABLESPACE pg_default;

create index IF not exists idx_customers_phone on public.customers using btree (phone) TABLESPACE pg_default;

create index IF not exists idx_customers_email on public.customers using btree (email) TABLESPACE pg_default;

create index IF not exists idx_customers_status on public.customers using btree (status) TABLESPACE pg_default;

create index IF not exists idx_customers_source on public.customers using btree (source) TABLESPACE pg_default;

create index IF not exists idx_customers_created_at on public.customers using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_customers_company on public.customers using btree (company) TABLESPACE pg_default;

create index IF not exists idx_customers_source_created on public.customers using btree (source, created_at) TABLESPACE pg_default;

create index IF not exists idx_customers_activity on public.customers using btree (last_connect_at) TABLESPACE pg_default
where
  (last_connect_at is not null);

create index IF not exists idx_customers_created_by on public.customers using btree (created_by) TABLESPACE pg_default;