// 检查"数据库对比"菜单配置
import { getSupabaseClient } from '../src/config/supabase.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../.env') });

const supabase = getSupabaseClient();

async function checkMenu() {
  try {
    // 1. 检查"数据库对比"菜单
    const { data: menu, error: menuError } = await supabase
      .from('menus')
      .select('*')
      .or('name.eq.数据库对比,path.eq./system/database-compare')
      .single();

    if (menuError && menuError.code !== 'PGRST116') {
      console.error('查询菜单失败:', menuError);
      return;
    }

    console.log('=== 数据库对比菜单配置 ===');
    if (menu) {
      console.log('✅ 菜单存在:');
      console.log('  ID:', menu.id);
      console.log('  名称:', menu.name);
      console.log('  路径:', menu.path);
      console.log('  父菜单ID:', menu.parent_id);
      console.log('  类型:', menu.type);
      console.log('  状态:', menu.status);
      console.log('  排序:', menu.sort_order);
      
      // 检查父菜单
      if (menu.parent_id) {
        const { data: parentMenu } = await supabase
          .from('menus')
          .select('id, name')
          .eq('id', menu.parent_id)
          .single();
        console.log('  父菜单:', parentMenu?.name || '未找到');
      }
    } else {
      console.log('❌ 菜单不存在');
    }

    // 2. 检查权限配置
    const { data: roles } = await supabase
      .from('role_group')
      .select('role_id, role_name, permission')
      .eq('role_name', 'superadmin');

    if (roles && roles.length > 0) {
      const role = roles[0];
      const modules = role.permission?.modules || [];
      const menuId = '550e8400-e29b-41d4-a716-446655440019';
      const hasPermission = modules.some(id => String(id) === menuId);
      
      console.log('\n=== 权限配置检查 ===');
      console.log('角色:', role.role_name);
      console.log('权限模块数量:', modules.length);
      console.log('数据库对比菜单ID在权限中:', hasPermission ? '✅ 是' : '❌ 否');
      
      if (!hasPermission) {
        console.log('\n需要修复：将菜单ID添加到权限中');
      }
    }

    // 3. 检查客户管理的子菜单
    const customerMenuId = '550e8400-e29b-41d4-a716-446655440012';
    const { data: children } = await supabase
      .from('menus')
      .select('*')
      .eq('parent_id', customerMenuId)
      .eq('status', 'active')
      .order('sort_order', { ascending: true });

    console.log('\n=== 客户管理子菜单 ===');
    if (children && children.length > 0) {
      children.forEach((child, index) => {
        console.log(`${index + 1}. ${child.name} (${child.type}) - ${child.path || '无路径'}`);
      });
    } else {
      console.log('无子菜单');
    }

  } catch (error) {
    console.error('检查失败:', error);
  }
}

checkMenu();

