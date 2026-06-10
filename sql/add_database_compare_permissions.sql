-- 为「数据库对比」添加可分配给角色的功能权限
-- 在 Supabase SQL Editor 中执行一次即可

-- 父菜单 ID（数据库对比）
-- 550e8400-e29b-41d4-a716-446655440019

INSERT INTO menus (id, name, path, icon, parent_id, sort_order, type, status, description)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440020',
    '数据库对比-查看',
    'database_compare:view',
    'fas fa-eye',
    '550e8400-e29b-41d4-a716-446655440019',
    1,
    'function',
    'active',
    '查看统计、上传文件、录入数据'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440021',
    '数据库对比-对比',
    'database_compare:compare',
    'fas fa-not-equal',
    '550e8400-e29b-41d4-a716-446655440019',
    2,
    'function',
    'active',
    '开始对比、下载对比结果'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440022',
    '数据库对比-导入',
    'database_compare:import',
    'fas fa-file-import',
    '550e8400-e29b-41d4-a716-446655440019',
    3,
    'function',
    'active',
    '导入新增数据到数据库、批量修改状态'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440023',
    '数据库对比-上传人统计',
    'database_compare:uploader_stats',
    'fas fa-users',
    '550e8400-e29b-41d4-a716-446655440019',
    4,
    'function',
    'active',
    '按上传人统计、明细、补全上传人'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440024',
    '数据库对比-全部数据',
    'database_compare:database_view',
    'fas fa-database',
    '550e8400-e29b-41d4-a716-446655440019',
    5,
    'function',
    'active',
    '查看数据库全部客户数据'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440025',
    '数据库对比-删除全部',
    'database_compare:delete_all',
    'fas fa-trash-alt',
    '550e8400-e29b-41d4-a716-446655440019',
    6,
    'function',
    'active',
    '删除全部或按状态删除客户数据'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  path = EXCLUDED.path,
  icon = EXCLUDED.icon,
  parent_id = EXCLUDED.parent_id,
  sort_order = EXCLUDED.sort_order,
  type = EXCLUDED.type,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  updated_at = NOW();
