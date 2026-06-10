/**
 * 初始化「数据库对比」功能权限，并为已有角色补全默认权限
 * 运行: node scripts/seed_database_compare_permissions.js
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const PARENT_MENU_ID = '550e8400-e29b-41d4-a716-446655440019';
const SUPER_ADMIN_ROLE_ID = '33f3c7d2-4327-47df-ae86-7c4fa2d7d45e';

const FUNCTION_MENUS = [
  {
    id: '550e8400-e29b-41d4-a716-446655440020',
    name: '数据库对比-查看',
    path: 'database_compare:view',
    icon: 'fas fa-eye',
    sort_order: 1,
    description: '查看统计、上传文件、录入数据'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440021',
    name: '数据库对比-对比',
    path: 'database_compare:compare',
    icon: 'fas fa-not-equal',
    sort_order: 2,
    description: '开始对比、下载对比结果'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440022',
    name: '数据库对比-导入',
    path: 'database_compare:import',
    icon: 'fas fa-file-import',
    sort_order: 3,
    description: '导入新增数据到数据库、批量修改状态'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440023',
    name: '数据库对比-上传人统计',
    path: 'database_compare:uploader_stats',
    icon: 'fas fa-users',
    sort_order: 4,
    description: '按上传人统计、明细、补全上传人'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440024',
    name: '数据库对比-全部数据',
    path: 'database_compare:database_view',
    icon: 'fas fa-database',
    sort_order: 5,
    description: '查看数据库全部客户数据'
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440025',
    name: '数据库对比-删除全部',
    path: 'database_compare:delete_all',
    icon: 'fas fa-trash-alt',
    sort_order: 6,
    description: '删除全部或按状态删除客户数据'
  }
];

const BASIC_PERMISSION_IDS = [
  '550e8400-e29b-41d4-a716-446655440020',
  '550e8400-e29b-41d4-a716-446655440021',
  '550e8400-e29b-41d4-a716-446655440022'
];

const ALL_PERMISSION_IDS = FUNCTION_MENUS.map(item => item.id);

function mergeModules(existingModules, addIds) {
  const merged = new Set((existingModules || []).map(String));
  addIds.forEach(id => merged.add(String(id)));
  return Array.from(merged);
}

async function main() {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  console.log('1) 写入功能权限菜单...');
  for (const item of FUNCTION_MENUS) {
    const { error } = await client.from('menus').upsert({
      ...item,
      parent_id: PARENT_MENU_ID,
      type: 'function',
      status: 'active'
    }, { onConflict: 'id' });
    if (error) throw error;
    console.log('  ✅', item.name);
  }

  console.log('2) 更新角色权限...');
  const { data: roles, error: rolesError } = await client
    .from('role_group')
    .select('role_id, role_name, permission');
  if (rolesError) throw rolesError;

  for (const role of roles || []) {
    const modules = role.permission?.modules || [];
    const hasParentMenu = modules.some(id => String(id) === PARENT_MENU_ID);
    if (!hasParentMenu) continue;

    let addIds = BASIC_PERMISSION_IDS;
    if (String(role.role_id) === SUPER_ADMIN_ROLE_ID) {
      addIds = ALL_PERMISSION_IDS;
    }

    const nextModules = mergeModules(modules, addIds);
    if (nextModules.length === modules.length) {
      console.log(`  ↷ ${role.role_name}: 无需更新`);
      continue;
    }

    const { error } = await client
      .from('role_group')
      .update({
        permission: {
          ...(role.permission || {}),
          modules: nextModules
        }
      })
      .eq('role_id', role.role_id);

    if (error) throw error;
    console.log(`  ✅ ${role.role_name}: 已补全 ${addIds.length} 项数据库对比权限`);
  }

  console.log('完成。请到「权限组管理」中为下级角色按需勾选功能权限。');
}

main().catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
});
