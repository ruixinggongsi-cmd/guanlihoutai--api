create table public.menus (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  path text null,
  icon text null,
  parent_id uuid null,
  sort_order integer null default 0,
  type text null default 'menu'::text,
  status text null default 'active'::text,
  description text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint menus_pkey primary key (id),
  constraint menus_status_check check (
    (
      status = any (array['active'::text, 'inactive'::text])
    )
  ),
  constraint menus_type_check check (
    (
      type = any (array['menu'::text, 'function'::text])
    )
  )
) TABLESPACE pg_default;

INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES ('550e8400-e29b-41d4-a716-446655440001', '仪表盘', '/', 'fas fa-tachometer-alt', null, '1', 'menu', 'active', '系统仪表盘首页', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440002', '企业管理', '', 'fas fa-building', null, '2', 'menu', 'active', '企业相关管理功能', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440003', '业务管理', '', 'fas fa-briefcase', null, '3', 'menu', 'active', '业务相关管理功能', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440004', '审批中心', '', 'fas fa-clipboard-check', null, '4', 'menu', 'active', '审批相关功能', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440005', '系统设置', '', 'fas fa-cog', null, '5', 'menu', 'active', '系统配置和管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440006', '数据分析', '/analytics', 'fas fa-chart-bar', null, '6', 'menu', 'active', '数据分析功能', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440007', '员工列表', '/users', 'fas fa-users', '550e8400-e29b-41d4-a716-446655440002', '1', 'menu', 'active', '管理企业员工信息', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440008', '部门管理', '/departments', 'fas fa-sitemap', '550e8400-e29b-41d4-a716-446655440002', '2', 'menu', 'active', '管理企业部门结构', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440009', '权限组管理', '/role-groups', 'fas fa-user-shield', '550e8400-e29b-41d4-a716-446655440002', '3', 'menu', 'active', '管理系统权限组', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440010', '费用申请', '/business/expenses', 'fas fa-money-bill-wave', '550e8400-e29b-41d4-a716-446655440003', '1', 'menu', 'active', '费用申请管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440011', '设备申请', '/business/equipment', 'fas fa-tools', '550e8400-e29b-41d4-a716-446655440003', '2', 'menu', 'active', '设备申请管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440012', '客户管理', '/business/customers', 'fas fa-user-friends', '550e8400-e29b-41d4-a716-446655440003', '3', 'menu', 'active', '客户信息管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440013', '费用审批', '/approval/expenses', 'fas fa-file-invoice-dollar', '550e8400-e29b-41d4-a716-446655440004', '1', 'menu', 'active', '费用申请审批', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440014', '设备审批', '/approval/equipment', 'fas fa-cog', '550e8400-e29b-41d4-a716-446655440004', '2', 'menu', 'active', '设备申请审批', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440015', '菜单管理', '/system/menus', 'fas fa-sitemap', '550e8400-e29b-41d4-a716-446655440005', '1', 'menu', 'active', '系统菜单管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440016', '审批流程配置', '/system/approval-flows', 'fas fa-project-diagram', '550e8400-e29b-41d4-a716-446655440005', '2', 'menu', 'active', '审批流程配置管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440017', '设备分类', '/system/equipment-categories', 'fas fa-layer-group', '550e8400-e29b-41d4-a716-446655440005', '3', 'menu', 'active', '设备分类管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00'), ('550e8400-e29b-41d4-a716-446655440018', '费用分类', '/system/expense-categories', 'fas fa-tags', '550e8400-e29b-41d4-a716-446655440005', '4', 'menu', 'active', '费用分类管理', '2025-09-30 12:50:27.629936+00', '2025-09-30 12:50:27.629936+00');