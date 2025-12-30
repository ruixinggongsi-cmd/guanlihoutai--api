create table public.expense_approval_nodes (
  id uuid not null default gen_random_uuid (),
  expense_id uuid not null,
  node_name text not null,
  user_id uuid null,
  status text not null default 'pending'::text,
  comment text null,
 attachments jsonb null,
  sort_order integer null default 0,
  is_current_node boolean null default false,
  approval_start_time timestamp without time zone null,
  approval_end_time timestamp without time zone null,
  approval_duration_seconds integer null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint expense_approval_nodes_pkey primary key (id),
  constraint expense_approval_nodes_expense_id_fkey foreign KEY (expense_id) references expense_applications (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_expense_approval_nodes_expense_id on public.expense_approval_nodes using btree (expense_id) TABLESPACE pg_default;

create index IF not exists idx_expense_approval_nodes_status on public.expense_approval_nodes using btree (status) TABLESPACE pg_default;