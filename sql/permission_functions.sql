-- 功能权限数据导入SQL
-- 基于v-permission指令和菜单结构生成的功能权限

-- 审批流程配置页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440016)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440100', '审批流程-查看', 'approval_flow:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440016', '1', 'function', 'active', '查看审批流程配置', now(), now()),
('550e8400-e29b-41d4-a716-446655440101', '审批流程-添加', 'approval_flow:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440016', '2', 'function', 'active', '添加审批流程配置', now(), now()),
('550e8400-e29b-41d4-a716-446655440102', '审批流程-编辑', 'approval_flow:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440016', '3', 'function', 'active', '编辑审批流程配置', now(), now()),
('550e8400-e29b-41d4-a716-446655440103', '审批流程-删除', 'approval_flow:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440016', '4', 'function', 'active', '删除审批流程配置', now(), now());

-- 费用分类管理页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440018)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440110', '费用分类-查看', 'expense_category:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440018', '1', 'function', 'active', '查看费用分类', now(), now()),
('550e8400-e29b-41d4-a716-446655440111', '费用分类-添加', 'expense_category:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440018', '2', 'function', 'active', '添加费用分类', now(), now()),
('550e8400-e29b-41d4-a716-446655440112', '费用分类-编辑', 'expense_category:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440018', '3', 'function', 'active', '编辑费用分类', now(), now()),
('550e8400-e29b-41d4-a716-446655440113', '费用分类-删除', 'expense_category:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440018', '4', 'function', 'active', '删除费用分类', now(), now());

-- 设备分类管理页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440017)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440120', '设备分类-查看', 'equipment_category:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440017', '1', 'function', 'active', '查看设备分类', now(), now()),
('550e8400-e29b-41d4-a716-446655440121', '设备分类-添加', 'equipment_category:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440017', '2', 'function', 'active', '添加设备分类', now(), now()),
('550e8400-e29b-41d4-a716-446655440122', '设备分类-编辑', 'equipment_category:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440017', '3', 'function', 'active', '编辑设备分类', now(), now()),
('550e8400-e29b-41d4-a716-446655440123', '设备分类-删除', 'equipment_category:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440017', '4', 'function', 'active', '删除设备分类', now(), now());

-- 员工管理页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440007)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440130', '员工-查看', 'user:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440007', '1', 'function', 'active', '查看员工信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440131', '员工-添加', 'user:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440007', '2', 'function', 'active', '添加员工信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440132', '员工-编辑', 'user:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440007', '3', 'function', 'active', '编辑员工信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440133', '员工-删除', 'user:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440007', '4', 'function', 'active', '删除员工信息', now(), now());

-- 部门管理页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440008)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440140', '部门-查看', 'department:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440008', '1', 'function', 'active', '查看部门信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440141', '部门-添加', 'department:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440008', '2', 'function', 'active', '添加部门信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440142', '部门-编辑', 'department:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440008', '3', 'function', 'active', '编辑部门信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440143', '部门-删除', 'department:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440008', '4', 'function', 'active', '删除部门信息', now(), now());

-- 权限组管理页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440009)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440150', '权限组-查看', 'role_group:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440009', '1', 'function', 'active', '查看权限组信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440151', '权限组-添加', 'role_group:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440009', '2', 'function', 'active', '添加权限组信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440152', '权限组-编辑', 'role_group:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440009', '3', 'function', 'active', '编辑权限组信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440153', '权限组-删除', 'role_group:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440009', '4', 'function', 'active', '删除权限组信息', now(), now());

-- 费用申请页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440010)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440160', '费用申请-查看', 'expense:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440010', '1', 'function', 'active', '查看费用申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440161', '费用申请-添加', 'expense:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440010', '2', 'function', 'active', '添加费用申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440162', '费用申请-编辑', 'expense:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440010', '3', 'function', 'active', '编辑费用申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440163', '费用申请-删除', 'expense:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440010', '4', 'function', 'active', '删除费用申请', now(), now());

-- 设备申请页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440011)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440170', '设备申请-查看', 'equipment:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440011', '1', 'function', 'active', '查看设备申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440171', '设备申请-添加', 'equipment:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440011', '2', 'function', 'active', '添加设备申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440172', '设备申请-编辑', 'equipment:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440011', '3', 'function', 'active', '编辑设备申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440173', '设备申请-删除', 'equipment:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440011', '4', 'function', 'active', '删除设备申请', now(), now());

-- 客户管理页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440012)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440180', '客户-查看', 'customer:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440012', '1', 'function', 'active', '查看客户信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440181', '客户-添加', 'customer:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440012', '2', 'function', 'active', '添加客户信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440182', '客户-编辑', 'customer:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440012', '3', 'function', 'active', '编辑客户信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440183', '客户-删除', 'customer:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440012', '4', 'function', 'active', '删除客户信息', now(), now());

-- 费用审批页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440013)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440190', '费用审批-查看', 'expense_approval:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440013', '1', 'function', 'active', '查看费用审批', now(), now()),
('550e8400-e29b-41d4-a716-446655440191', '费用审批-审批', 'expense_approval:approve', 'fas fa-check', '550e8400-e29b-41d4-a716-446655440013', '2', 'function', 'active', '审批费用申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440192', '费用审批-拒绝', 'expense_approval:reject', 'fas fa-times', '550e8400-e29b-41d4-a716-446655440013', '3', 'function', 'active', '拒绝费用申请', now(), now());

-- 设备审批页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440014)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440200', '设备审批-查看', 'equipment_approval:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440014', '1', 'function', 'active', '查看设备审批', now(), now()),
('550e8400-e29b-41d4-a716-446655440201', '设备审批-审批', 'equipment_approval:approve', 'fas fa-check', '550e8400-e29b-41d4-a716-446655440014', '2', 'function', 'active', '审批设备申请', now(), now()),
('550e8400-e29b-41d4-a716-446655440202', '设备审批-拒绝', 'equipment_approval:reject', 'fas fa-times', '550e8400-e29b-41d4-a716-446655440014', '3', 'function', 'active', '拒绝设备申请', now(), now());

-- 菜单管理页面的功能权限 (parent_id: 550e8400-e29b-41d4-a716-446655440015)
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") VALUES 
('550e8400-e29b-41d4-a716-446655440210', '菜单管理-查看', 'menu:view', 'fas fa-eye', '550e8400-e29b-41d4-a716-446655440015', '1', 'function', 'active', '查看菜单信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440211', '菜单管理-添加', 'menu:add', 'fas fa-plus', '550e8400-e29b-41d4-a716-446655440015', '2', 'function', 'active', '添加菜单信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440212', '菜单管理-编辑', 'menu:edit', 'fas fa-edit', '550e8400-e29b-41d4-a716-446655440015', '3', 'function', 'active', '编辑菜单信息', now(), now()),
('550e8400-e29b-41d4-a716-446655440213', '菜单管理-删除', 'menu:delete', 'fas fa-trash', '550e8400-e29b-41d4-a716-446655440015', '4', 'function', 'active', '删除菜单信息', now(), now());