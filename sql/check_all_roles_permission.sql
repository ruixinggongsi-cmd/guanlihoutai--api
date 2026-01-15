-- 检查所有角色的权限配置

-- 1. 首先查看所有角色
SELECT 
  role_id,
  role_code,
  role_name,
  status
FROM public.role_group
ORDER BY role_name;

-- 2. 检查每个角色的权限配置（包含客户管理和数据库对比菜单ID）
SELECT 
  role_name,
  role_code,
  permission->'modules' as 权限模块列表,
  CASE 
    WHEN permission::text LIKE '%8271238c-e6f5-48de-9b36-349db906be52%'
    THEN '⚠️ 包含错误的客户管理菜单ID'
    WHEN permission::text LIKE '%550e8400-e29b-41d4-a716-446655440012%'
    THEN '✅ 包含正确的客户管理菜单ID'
    ELSE '❌ 未包含客户管理菜单ID'
  END as 客户管理菜单状态,
  CASE 
    WHEN permission::text LIKE '%550e8400-e29b-41d4-a716-446655440019%'
    THEN '✅ 包含数据库对比菜单ID'
    ELSE '❌ 未包含数据库对比菜单ID'
  END as 数据库对比菜单状态
FROM public.role_group
ORDER BY role_name;

-- 3. 如果需要修复，找到你的角色（可能是 'superadmin' 或其他名称），然后：
-- 在 Supabase Table Editor 中：
-- 1. 打开 role_group 表
-- 2. 找到你的角色记录
-- 3. 编辑 permission 字段
-- 4. 在 modules 数组中：
--    - 删除 8271238c-e6f5-48de-9b36-349db906be52（如果存在）
--    - 确保包含 550e8400-e29b-41d4-a716-446655440012（正确的客户管理菜单ID）
--    - 确保包含 550e8400-e29b-41d4-a716-446655440019（数据库对比菜单ID）

