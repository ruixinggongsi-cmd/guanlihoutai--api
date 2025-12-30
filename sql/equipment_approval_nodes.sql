create table public.equipment_approval_nodes (
  id uuid not null default gen_random_uuid (),
  equipment_id uuid not null,
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
  constraint equipment_approval_nodes_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_equipment_approval_nodes_equipment_id on public.equipment_approval_nodes using btree (equipment_id) TABLESPACE pg_default;

create index IF not exists idx_equipment_approval_nodes_status on public.equipment_approval_nodes using btree (status) TABLESPACE pg_default;