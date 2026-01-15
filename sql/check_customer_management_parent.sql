-- 检查客户管理菜单的父菜单配置

-- 1. 检查客户管理菜单的父菜单ID
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status
FROM public.menus 
WHERE id = '550e8400-e29b-41d4-a716-446655440012';

-- 2. 检查父菜单（业务管理）是否存在
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status
FROM public.menus 
WHERE id = '550e8400-e29b-41d4-a716-446655440003';

-- 3. 检查权限配置中是否包含父菜单ID
-- 如果父菜单不在权限中，子菜单也不会显示
SELECT 
  role_name,
  CASE 
    WHEN permission::text LIKE '%550e8400-e29b-41d4-a716-446655440003%'
    THEN '✅ 包含业务管理（父菜单）'
    ELSE '❌ 未包含业务管理（父菜单）'
  END as 业务管理菜单状态,
  CASE 
    WHEN permission::text LIKE '%550e8400-e29b-41d4-a716-446655440012%'
    THEN '✅ 包含客户管理'
    ELSE '❌ 未包含客户管理'
  END as 客户管理菜单状态
FROM public.role_group 
WHERE role_name = '超级管理员';

