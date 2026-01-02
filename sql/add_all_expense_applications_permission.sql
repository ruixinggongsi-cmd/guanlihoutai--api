-- 添加"所有申请记录"功能权限
-- 该权限用于控制超级管理员查看所有费用申请记录的功能
-- 父菜单：数据分析 (550e8400-e29b-41d4-a716-446655440006)

-- 首先检查是否已存在费用统计菜单项，如果不存在则创建
-- 注意：费用统计菜单可能已经存在，这里使用 ON CONFLICT 处理
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") 
VALUES 
('550e8400-e29b-41d4-a716-446655440220', '费用统计', '/statistics/expense', 'fas fa-chart-bar', '550e8400-e29b-41d4-a716-446655440006', '1', 'menu', 'active', '费用统计分析', now(), now())
ON CONFLICT (id) DO NOTHING;

-- 添加"所有申请记录-查看"功能权限
-- 该权限作为费用统计菜单的子权限
-- 权限代码：expense_statistics:view_all
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") 
VALUES 
('550e8400-e29b-41d4-a716-446655440221', '所有申请记录-查看', 'expense_statistics:view_all', 'fas fa-list-alt', '550e8400-e29b-41d4-a716-446655440220', '1', 'function', 'active', '查看所有用户的费用申请记录（仅超级管理员）', now(), now())
ON CONFLICT (id) DO NOTHING;

