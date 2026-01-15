-- 修复客户管理和数据库对比菜单的状态
-- 确保它们都是 active 状态，以便在前端显示

-- 1. 检查当前状态
SELECT 
  id,
  name,
  path,
  status,
  type,
  parent_id
FROM public.menus
WHERE id IN (
  '550e8400-e29b-41d4-a716-446655440012',  -- 客户管理
  '550e8400-e29b-41d4-a716-446655440019',  -- 数据库对比
  '550e8400-e29b-41d4-a716-446655440003'   -- 业务管理
)
ORDER BY name;

-- 2. 修复客户管理菜单状态
UPDATE public.menus 
SET 
  status = 'active',
  updated_at = now()
WHERE id = '550e8400-e29b-41d4-a716-446655440012'
  AND status != 'active';

-- 3. 修复数据库对比菜单状态
UPDATE public.menus 
SET 
  status = 'active',
  updated_at = now()
WHERE id = '550e8400-e29b-41d4-a716-446655440019'
  AND status != 'active';

-- 4. 确保业务管理菜单也是 active
UPDATE public.menus 
SET 
  status = 'active',
  updated_at = now()
WHERE id = '550e8400-e29b-41d4-a716-446655440003'
  AND status != 'active';

-- 5. 验证修复结果
SELECT 
  id,
  name,
  path,
  status,
  type,
  (SELECT name FROM public.menus WHERE id = m.parent_id) as 父菜单名称
FROM public.menus m
WHERE id IN (
  '550e8400-e29b-41d4-a716-446655440012',  -- 客户管理
  '550e8400-e29b-41d4-a716-446655440019',  -- 数据库对比
  '550e8400-e29b-41d4-a716-446655440003'   -- 业务管理
)
ORDER BY name;

