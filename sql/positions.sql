-- 职位表
create table if not exists public.positions (
  id uuid not null default extensions.uuid_generate_v4 (),
  position_name text not null,                    -- 职位名称
  position_code text null,                        -- 职位编码（可选）
  description text null,                          -- 职位描述
  sort_order integer null default 0,              -- 排序权重
  status text null default 'active'::text,        -- 状态 (active/inactive)
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint positions_pkey primary key (id),
  constraint positions_status_check check (
    (
      status = any (array['active'::text, 'inactive'::text])
    )
  ),
  constraint positions_name_unique unique (position_name)
) TABLESPACE pg_default;

-- 添加索引
create index if not exists idx_positions_name on public.positions using btree (position_name) TABLESPACE pg_default;
create index if not exists idx_positions_status on public.positions using btree (status) TABLESPACE pg_default;
create index if not exists idx_positions_sort_order on public.positions using btree (sort_order) TABLESPACE pg_default;

-- 插入默认职位数据
INSERT INTO public.positions (id, position_name, position_code, description, sort_order, status) VALUES
  (gen_random_uuid(), '总经理', 'CEO', '公司最高管理者', 1, 'active'),
  (gen_random_uuid(), '副总经理', 'VP', '公司副职管理者', 2, 'active'),
  (gen_random_uuid(), '部门经理', 'MANAGER', '部门负责人', 3, 'active'),
  (gen_random_uuid(), '副经理', 'ASSISTANT_MANAGER', '部门副职负责人', 4, 'active'),
  (gen_random_uuid(), '主管', 'SUPERVISOR', '部门主管', 5, 'active'),
  (gen_random_uuid(), '高级员工', 'SENIOR', '高级员工', 6, 'active'),
  (gen_random_uuid(), '员工', 'STAFF', '普通员工', 7, 'active'),
  (gen_random_uuid(), '实习生', 'INTERN', '实习生', 8, 'active')
ON CONFLICT (position_name) DO NOTHING;

-- 修改users表，将position字段改为外键关联positions表
-- 先删除之前添加的text类型position字段（如果存在）
ALTER TABLE public.users DROP COLUMN IF EXISTS position;

-- 添加position_id字段作为外键
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS position_id uuid NULL;

-- 添加外键约束
ALTER TABLE public.users 
ADD CONSTRAINT fk_users_position 
FOREIGN KEY (position_id) 
REFERENCES public.positions(id) 
ON DELETE SET NULL;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_users_position_id ON public.users USING btree (position_id) TABLESPACE pg_default;

-- 添加注释
COMMENT ON TABLE public.positions IS '职位表';
COMMENT ON COLUMN public.users.position_id IS '职位ID（外键关联positions表）';

