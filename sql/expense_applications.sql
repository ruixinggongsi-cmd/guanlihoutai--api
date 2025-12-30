create table public.expense_applications (
  id uuid not null default gen_random_uuid (),
  name text not null,
  main_category_id uuid not null,
  sub_category_id uuid not null,
  amount numeric(10, 2) not null,
  date date not null,
  description text null,
  attachments jsonb null,
  status text not null default 'pending'::text,
  applicant_id uuid null,
  applicant_name text null,
  applicant_department_id text null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  
  constraint expense_applications_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_expense_applications_status on public.expense_applications using btree (status) TABLESPACE pg_default;

create index IF not exists idx_expense_applications_date on public.expense_applications using btree (date) TABLESPACE pg_default;

create index IF not exists idx_expense_applications_applicant on public.expense_applications using btree (applicant_id) TABLESPACE pg_default;

create index IF not exists idx_expense_applications_category on public.expense_applications using btree (main_category_id, sub_category_id) TABLESPACE pg_default;