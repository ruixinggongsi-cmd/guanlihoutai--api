-- 检查"数据库对比"菜单的完整配置
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order,
  (SELECT name FROM public.menus WHERE id = m.parent_id) as 父菜单名称,
  (SELECT status FROM public.menus WHERE id = m.parent_id) as 父菜单状态
FROM public.menus m
WHERE id = '550e8400-e29b-41d4-a716-446655440019'
   OR name = '数据库对比';

-- 检查客户管理菜单的状态
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order
FROM public.menus
WHERE id = '550e8400-e29b-41d4-a716-446655440012'
   OR name = '客户管理';

-- 检查业务管理菜单的状态
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order
FROM public.menus
WHERE id = '550e8400-e29b-41d4-a716-446655440003'
   OR name = '业务管理';

