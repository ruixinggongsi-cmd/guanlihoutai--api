-- 任务中心表结构
-- 包含任务表和任务执行明细表

-- 任务表
create table public.user_tasks (
  id uuid not null default gen_random_uuid (),
  task_name text not null,                    -- 任务名称
  task_type text not null,                    -- 任务类型 (如: expense_approval, equipment_approval, system_maintenance等)
  task_description text null,                 -- 任务描述
  priority text not null default '1_medium'::text, -- 优先级 (3_urgent、2_high, 1_medium, 0_low)
  status text not null default '1_wait'::text,  -- 任务状态 (1_wait, 2_pending, 0_in_progress, 3_completed, 4_cancelled, 5_failed)

  -- 责任人信息
  assignee_id uuid null,                      -- 任务负责人ID
  assignee_name text null,                    -- 任务负责人名称
  assignee_department_id uuid null,           -- 任务负责人部门ID
  
  -- 创建者信息
  creator_id uuid null,                       -- 创建者ID
  creator_name text null,                     -- 创建者名称
  
  -- 时间信息
  due_date timestamp without time zone null,  -- 截止日期
  start_time timestamp without time zone null, -- 开始时间
  end_time timestamp without time zone null,   -- 结束时间
  estimated_duration_seconds integer null,     -- 预计耗时(秒)
  actual_duration_seconds integer null,        -- 实际耗时(秒)
  
  -- 执行进度
  execution_progress integer not null default 0, -- 执行进度 (0-100)
  
  -- 系统字段
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  
  constraint tasks_pkey primary key (id)
) TABLESPACE pg_default;

-- 任务执行明细表
create table public.user_task_execution_details (
  id uuid not null default gen_random_uuid (),
  task_id uuid not null,                     -- 关联任务ID
  
  -- 执行信息
  action_type text not null,                  -- 操作类型 (start, pause, resume, complete, cancel, fail, comment, transfer等)
  action_description text null,               -- 操作描述
  
  -- 执行人信息
  executor_id uuid null,                      -- 执行人ID
  executor_name text null,                    -- 执行人名称
  executor_department_id uuid null,           -- 执行人部门ID
  
  -- 执行结果
  execution_result text null,                 -- 执行结果 (0_in_progress, 1_success, 2_failure, 3_partial_success等)
  error_message text null,                    -- 错误信息
  current_progress integer null,              -- 当前进度 (0-100)
  
  -- 时间信息
  execution_time timestamp without time zone null default CURRENT_TIMESTAMP, -- 执行时间
  duration_seconds integer null,              -- 本次执行耗时(秒)
  
  -- 附件信息
  attachment_urls text[] null,                -- 附件URL数组
  
  -- 系统字段
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  
  constraint task_execution_details_pkey primary key (id)

) TABLESPACE pg_default;

-- 创建索引
-- 任务表索引
create index IF not exists idx_tasks_status on public.tasks using btree (status) TABLESPACE pg_default;
create index IF not exists idx_tasks_priority on public.tasks using btree (priority) TABLESPACE pg_default;
create index IF not exists idx_tasks_assignee_id on public.tasks using btree (assignee_id) TABLESPACE pg_default;
create index IF not exists idx_tasks_creator_id on public.tasks using btree (creator_id) TABLESPACE pg_default;
create index IF not exists idx_tasks_due_date on public.tasks using btree (due_date) TABLESPACE pg_default;
create index IF not exists idx_tasks_task_type on public.tasks using btree (task_type) TABLESPACE pg_default;
create index IF not exists idx_tasks_created_at on public.tasks using btree (created_at) TABLESPACE pg_default;

-- 任务执行明细表索引
create index IF not exists idx_task_execution_details_task_id on public.task_execution_details using btree (task_id) TABLESPACE pg_default;
create index IF not exists idx_task_execution_details_executor_id on public.task_execution_details using btree (executor_id) TABLESPACE pg_default;
create index IF not exists idx_task_execution_details_action_type on public.task_execution_details using btree (action_type) TABLESPACE pg_default;
create index IF not exists idx_task_execution_details_created_at on public.task_execution_details using btree (created_at) TABLESPACE pg_default;
create index IF not exists idx_task_execution_details_execution_time on public.task_execution_details using btree (execution_time) TABLESPACE pg_default;

-- 插入示例数据
-- 示例任务类型对应的菜单项
INSERT INTO public.menus (id, name, path, icon, parent_id, sort_order, type, status, description, created_at, updated_at) VALUES 
('550e8400-e29b-41d4-a716-446655440319', '任务中心', '/tasks', 'fas fa-tasks', null, '7', 'menu', 'active', '任务中心管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'),
('550e8400-e29b-41d4-a716-446655440320', '我的任务', '/tasks/my-tasks', 'fas fa-user-check', '550e8400-e29b-41d4-a716-446655440319', '1', 'menu', 'active', '我的任务列表', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'),
('550e8400-e29b-41d4-a716-446655440321', '任务管理', '/tasks/manage', 'fas fa-tasks', '550e8400-e29b-41d4-a716-446655440319', '2', 'menu', 'active', '任务管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'),
('550e8400-e29b-41d4-a716-446655440322', '任务统计', '/tasks/statistics', 'fas fa-chart-line', '550e8400-e29b-41d4-a716-446655440319', '3', 'menu', 'active', '任务统计分析', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00');