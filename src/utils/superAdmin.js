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
