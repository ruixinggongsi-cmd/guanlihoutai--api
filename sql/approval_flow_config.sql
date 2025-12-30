create table public.approval_flow_config (
  id uuid not null default gen_random_uuid (),
  flow_name text not null,
  flow_type text not null,
  description text null,
  status text null default 'active'::text,
  nodes jsonb not null default '[]'::jsonb,
  creator text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint approval_flow_config_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_approval_flow_name on public.approval_flow_config using btree (flow_name) TABLESPACE pg_default;

create index IF not exists idx_approval_flow_type on public.approval_flow_config using btree (flow_type) TABLESPACE pg_default;

create index IF not exists idx_approval_flow_status on public.approval_flow_config using btree (status) TABLESPACE pg_default;

create index IF not exists idx_approval_flow_created_at on public.approval_flow_config using btree (created_at) TABLESPACE pg_default;