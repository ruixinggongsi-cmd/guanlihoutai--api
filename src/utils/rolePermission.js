import { select } from '../config/supabase.js';
import { isSuperAdmin } from './superAdmin.js';

const roleFunctionPathCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const DATABASE_COMPARE_MENU_ID = '550e8400-e29b-41d4-a716-446655440019';
const DATABASE_COMPARE_BASIC_PERMISSIONS = new Set([
  'database_compare:view',
  'database_compare:compare',
  'database_compare:import'
]);

function getRoleId(user) {
  return user?.roleInfo?.role_id || user?.roles || null;
}

async function loadRoleFunctionPaths(roleId) {
  const cached = roleFunctionPathCache.get(roleId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.paths;
  }

  const roleData = await select('role_group', 'permission', [{ type: 'eq', column: 'role_id', value: roleId }], 1);
  const moduleIds = roleData?.[0]?.permission?.modules || [];
  if (!moduleIds.length) {
    const empty = new Set();
    roleFunctionPathCache.set(roleId, { at: Date.now(), paths: empty });
    return empty;
  }

  const menus = await select(
    'menus',
    'path, type',
    [{ type: 'in', column: 'id', value: moduleIds.map(String) }],
    1000
  );

  const paths = new Set(
    (menus || [])
      .filter(menu => menu.type === 'function' && menu.path)
      .map(menu => menu.path)
  );

  roleFunctionPathCache.set(roleId, { at: Date.now(), paths });
  return paths;
}

async function roleHasMenuModule(roleId, menuId) {
  const roleData = await select('role_group', 'permission', [{ type: 'eq', column: 'role_id', value: roleId }], 1);
  const moduleIds = roleData?.[0]?.permission?.modules || [];
  return moduleIds.some(id => String(id) === String(menuId));
}

export async function hasFunctionPermission(user, permissionCode) {
  if (!user || !permissionCode) return false;
  if (isSuperAdmin(user)) return true;

  const roleId = getRoleId(user);
  if (!roleId) return false;

  const paths = await loadRoleFunctionPaths(roleId);
  if (paths.has(permissionCode)) return true;

  // 向后兼容：仅有「数据库对比」菜单权限时，默认可查看/对比/导入
  if (
    permissionCode.startsWith('database_compare:') &&
    DATABASE_COMPARE_BASIC_PERMISSIONS.has(permissionCode) &&
    await roleHasMenuModule(roleId, DATABASE_COMPARE_MENU_ID)
  ) {
    return true;
  }

  return false;
}

export async function assertFunctionPermission(user, permissionCode, message) {
  const allowed = await hasFunctionPermission(user, permissionCode);
  if (!allowed) {
    const error = new Error(message || '权限不足');
    error.statusCode = 403;
    throw error;
  }
}

export function clearRolePermissionCache(roleId = null) {
  if (roleId) {
    roleFunctionPathCache.delete(roleId);
    return;
  }
  roleFunctionPathCache.clear();
}
