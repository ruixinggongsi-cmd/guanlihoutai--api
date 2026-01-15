-- 检查菜单名称混淆问题
-- 确认 id 550e8400-e29b-41d4-a716-446655440003 对应的菜单名称

-- 1. 检查该菜单的详细信息
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order,
  description
FROM public.menus
WHERE id = '550e8400-e29b-41d4-a716-446655440003';

-- 2. 检查是否有其他菜单也叫"业务管理"
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status
FROM public.menus
WHERE name IN ('业务管理', '申请管理')
ORDER BY name, id;

-- 3. 检查业务管理菜单下的所有子菜单
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order
FROM public.menus
WHERE parent_id = '550e8400-e29b-41d4-a716-446655440003'
ORDER BY sort_order;

-- 4. 检查权限配置中提到的业务管理菜单ID
-- 根据权限配置，业务管理应该是 550e8400-e29b-41d4-a716-446655440003
-- 但数据库中显示的名称是"申请管理"，需要确认是否需要重命名

