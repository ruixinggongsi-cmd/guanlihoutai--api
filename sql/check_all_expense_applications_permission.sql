-- 检查"所有申请记录"权限配置
-- 用于排查部署后看不到"所有申请记录"选项卡的问题

-- 1. 检查权限菜单是否存在
SELECT 
  '权限菜单检查' as check_type,
  id,
  name,
  path,
  type,
  status,
  parent_id,
  description
FROM public.menus 
WHERE path = 'expense_statistics:view_all' 
   OR name LIKE '%所有申请记录%'
ORDER BY created_at DESC;

-- 2. 检查父菜单"费用统计"是否存在
SELECT 
  '父菜单检查' as check_type,
  id,
  name,
  path,
  type,
  status,
  parent_id
FROM public.menus 
WHERE id = '550e8400-e29b-41d4-a716-446655440220'
   OR (name LIKE '%费用统计%' AND type = 'menu');

-- 3. 检查超级管理员角色是否有该权限
SELECT 
  '角色权限检查' as check_type,
  rg.role_id,
  rg.role_name,
  rg.role_code,
  rg.data_permission,
  COUNT(DISTINCT m.id) as permission_count
FROM public.role_group rg
LEFT JOIN public.permission_functions pf ON pf.role_id = rg.role_id
LEFT JOIN public.menus m ON m.id = pf.menu_id AND m.path = 'expense_statistics:view_all'
WHERE rg.role_code = 'superadmin' 
   OR rg.data_permission = 'all'
   OR rg.role_name = '超级管理员'
GROUP BY rg.role_id, rg.role_name, rg.role_code, rg.data_permission;

-- 4. 检查权限关联表（如果使用permission_functions表）
SELECT 
  '权限关联检查' as check_type,
  pf.role_id,
  rg.role_name,
  m.name as menu_name,
  m.path as menu_path,
  m.type as menu_type
FROM public.permission_functions pf
JOIN public.role_group rg ON rg.role_id = pf.role_id
JOIN public.menus m ON m.id = pf.menu_id
WHERE m.path = 'expense_statistics:view_all'
   OR m.name LIKE '%所有申请记录%'
ORDER BY rg.role_name, m.name;

-- 5. 检查用户菜单（通过用户ID查询，需要替换为实际用户ID）
-- SELECT 
--   '用户菜单检查' as check_type,
--   u.id as user_id,
--   u.username,
--   u.name,
--   rg.role_name,
--   rg.role_code,
--   rg.data_permission
-- FROM public.users u
-- LEFT JOIN public.role_group rg ON rg.role_id = u.roles
-- WHERE u.username = 'admin'  -- 替换为实际用户名
--    OR u.id = 'your-user-id';  -- 替换为实际用户ID

