create table public.contact_records (
  id uuid not null default gen_random_uuid (),
  customer_id uuid not null,
  contact_time timestamp with time zone not null,
  content text not null,
  staff_id uuid not null,
  staff_name text not null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint contact_records_pkey primary key (id),
  constraint fk_contact_records_customer foreign KEY (customer_id) references customers (id) on delete CASCADE,
  constraint fk_contact_records_staff foreign KEY (staff_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_contact_records_customer_id on public.contact_records using btree (customer_id) TABLESPACE pg_default;

create index IF not exists idx_contact_records_staff_id on public.contact_records using btree (staff_id) TABLESPACE pg_default;

create index IF not exists idx_contact_records_contact_time on public.contact_records using btree (contact_time) TABLESPACE pg_default;

create index IF not exists idx_contact_records_created_at on public.contact_records using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_contact_records_customer_time on public.contact_records using btree (customer_id, contact_time desc) TABLESPACE pg_default;