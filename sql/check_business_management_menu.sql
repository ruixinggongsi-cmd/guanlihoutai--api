-- 检查业务管理菜单及其子菜单配置

-- 1. 检查业务管理菜单
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order
FROM public.menus 
WHERE id = '550e8400-e29b-41d4-a716-446655440003';

-- 2. 检查业务管理菜单的所有子菜单
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order,
  CASE 
    WHEN path IS NULL OR path = '' THEN '❌ 无路径'
    WHEN type != 'menu' THEN '❌ 类型不是menu'
    ELSE '✅ 符合显示条件'
  END as 显示状态
FROM public.menus 
WHERE parent_id = '550e8400-e29b-41d4-a716-446655440003'
ORDER BY sort_order;

-- 3. 检查客户管理菜单配置
SELECT 
  id,
  name,
  path,
  parent_id,
  type,
  status,
  sort_order
FROM public.menus 
WHERE id = '550e8400-e29b-41d4-a716-446655440012';

