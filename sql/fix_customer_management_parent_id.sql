-- 修复客户管理菜单的parent_id
-- 将parent_id从错误的菜单ID改为正确的业务管理菜单ID

-- 1. 检查当前配置
SELECT 
  id,
  name,
  path,
  parent_id as 当前父菜单ID,
  type,
  status
FROM public.menus 
WHERE id = '550e8400-e29b-41d4-a716-446655440012';

-- 2. 修复parent_id
UPDATE public.menus 
SET 
  parent_id = '550e8400-e29b-41d4-a716-446655440003',  -- 业务管理菜单ID
  updated_at = now()
WHERE id = '550e8400-e29b-41d4-a716-446655440012';

-- 3. 验证修复结果
SELECT 
  id,
  name,
  path,
  parent_id as 修复后的父菜单ID,
  type,
  status,
  (SELECT name FROM public.menus WHERE id = m.parent_id) as 父菜单名称
FROM public.menus m
WHERE id = '550e8400-e29b-41d4-a716-446655440012';

-- 4. 检查业务管理菜单下的所有子菜单
SELECT 
  id,
  name,
  path,
  type,
  sort_order
FROM public.menus 
WHERE parent_id = '550e8400-e29b-41d4-a716-446655440003'
ORDER BY sort_order;

