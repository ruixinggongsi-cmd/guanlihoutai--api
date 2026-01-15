-- 检查权限配置中是否包含错误的客户管理菜单ID

-- 1. 检查权限配置
SELECT 
  role_name,
  permission->'modules' as 权限模块列表,
  CASE 
    WHEN permission::text LIKE '%8271238c-e6f5-48de-9b36-349db906be52%'
    THEN '⚠️ 包含错误的客户管理菜单ID (8271238c...)'
    WHEN permission::text LIKE '%550e8400-e29b-41d4-a716-446655440012%'
    THEN '✅ 包含正确的客户管理菜单ID (550e8400...)'
    ELSE '❌ 未包含客户管理菜单ID'
  END as 客户管理菜单状态,
  CASE 
    WHEN permission::text LIKE '%550e8400-e29b-41d4-a716-446655440019%'
    THEN '✅ 包含数据库对比菜单ID'
    ELSE '❌ 未包含数据库对比菜单ID'
  END as 数据库对比菜单状态
FROM public.role_group 
WHERE role_name = 'superadmin';

-- 2. 如果需要修复权限配置，手动在Supabase Table Editor中：
-- 1. 打开 role_group 表
-- 2. 找到 role_name = 'superadmin' 的记录
-- 3. 编辑 permission 字段
-- 4. 在 modules 数组中：
--    - 如果包含 8271238c-e6f5-48de-9b36-349db906be52，删除它
--    - 确保包含 550e8400-e29b-41d4-a716-446655440012（正确的客户管理菜单ID）
--    - 确保包含 550e8400-e29b-41d4-a716-446655440019（数据库对比菜单ID）

