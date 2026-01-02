-- 修复"所有申请记录"权限配置
-- 确保权限菜单存在并正确关联到超级管理员角色

-- 步骤1: 确保父菜单"费用统计"存在
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") 
VALUES 
('550e8400-e29b-41d4-a716-446655440220', '费用统计', '/statistics/expense', 'fas fa-chart-bar', '550e8400-e29b-41d4-a716-446655440006', '1', 'menu', 'active', '费用统计分析', now(), now())
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    description = EXCLUDED.description,
    updated_at = now();

-- 步骤2: 确保"所有申请记录-查看"权限菜单存在
INSERT INTO "public"."menus" ("id", "name", "path", "icon", "parent_id", "sort_order", "type", "status", "description", "created_at", "updated_at") 
VALUES 
('550e8400-e29b-41d4-a716-446655440221', '所有申请记录-查看', 'expense_statistics:view_all', 'fas fa-list-alt', '550e8400-e29b-41d4-a716-446655440220', '1', 'function', 'active', '查看所有用户的费用申请记录（仅超级管理员）', now(), now())
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    parent_id = EXCLUDED.parent_id,
    sort_order = EXCLUDED.sort_order,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    description = EXCLUDED.description,
    updated_at = now();

-- 步骤3: 为所有超级管理员角色添加该权限（如果使用permission_functions表）
-- 注意：这里假设使用permission_functions表来关联角色和权限
-- 如果系统使用其他方式管理权限，请相应调整

-- 首先检查permission_functions表是否存在
DO $$
BEGIN
  -- 如果permission_functions表存在，则执行以下操作
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permission_functions') THEN
    -- 为所有超级管理员角色添加权限
    INSERT INTO public.permission_functions (role_id, menu_id, created_at, updated_at)
    SELECT 
      rg.role_id,
      '550e8400-e29b-41d4-a716-446655440221'::uuid,
      now(),
      now()
    FROM public.role_group rg
    WHERE (rg.role_code = 'superadmin' 
       OR rg.data_permission = 'all' 
       OR rg.role_name = '超级管理员')
      AND NOT EXISTS (
        SELECT 1 
        FROM public.permission_functions pf 
        WHERE pf.role_id = rg.role_id 
          AND pf.menu_id = '550e8400-e29b-41d4-a716-446655440221'::uuid
      );
  END IF;
END $$;

-- 步骤4: 输出修复结果
SELECT 
  '修复完成' as status,
  COUNT(*) as menu_count,
  '权限菜单已创建/更新' as message
FROM public.menus 
WHERE id = '550e8400-e29b-41d4-a716-446655440221';

