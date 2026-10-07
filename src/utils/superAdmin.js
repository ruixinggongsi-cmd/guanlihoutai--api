/**
 * 判断是否为超级管理员（可查看/删除全部数据）
 */
export function isSuperAdmin(user) {
  if (!user) return false;

  const username = String(user.username || '').toLowerCase();
  const roleCode = user.roleInfo?.role_code || user.role_code || '';
  const roleName = user.roleInfo?.role_name || user.role_name || '';

  return (
    username === 'admin' ||
    roleCode === 'superadmin' ||
    roleName === '超级管理员'
  );
}

/**
 * 判断是否为财务角色
 * - 可查看全部费用申请
 * - 可越级拒绝，但不能越级通过
 */
export function isFinanceRole(user) {
  if (!user) return false;

  const roleCode = String(user.roleInfo?.role_code || user.role_code || '').toLowerCase();
  const roleName = String(user.roleInfo?.role_name || user.role_name || '');
  const username = String(user.username || '').toLowerCase();

  return (
    roleCode === 'caiwu' ||
    roleName === '财务' ||
    roleName.includes('财务') ||
    username === 'caiwu'
  );
}
