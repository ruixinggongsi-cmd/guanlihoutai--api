import { getSupabaseClient, select } from '../config/supabase.js';

const ROLE_BUCKETS = ['总监', '管理员', '组员'];
const EXPENSE_OVERVIEW_BATCH_SIZE = 1000;

/** 根据角色名称归类到总监 / 管理员 / 组员 */
export function classifyRole(roleName) {
  if (!roleName) return '其他';
  const name = String(roleName);
  if (name.includes('总监')) return '总监';
  if (name.includes('超级管理') || name.includes('管理员')) return '管理员';
  if (name.includes('组员') || name.includes('成员') || name.includes('员工')) return '组员';
  return '其他';
}

/** 加载部门并构建映射 */
export async function loadDepartmentMaps() {
  const departments = await select('department', 'id, department_name, parent_id', [], 2000, 0, {
    column: 'department_name',
    ascending: true
  });
  const byId = {};
  const nameToId = {};
  const childrenIndex = {};

  (departments || []).forEach((d) => {
    byId[d.id] = d;
    if (d.department_name) {
      nameToId[d.department_name.trim()] = d.id;
    }
    const parentKey = d.parent_id || '__root__';
    if (!childrenIndex[parentKey]) childrenIndex[parentKey] = [];
    childrenIndex[parentKey].push(d.id);
  });

  return { departments: departments || [], byId, nameToId, childrenIndex };
}

/** 递归收集部门及其所有下级 id */
export function collectDescendantIds(deptId, childrenIndex) {
  const ids = new Set();
  if (!deptId) return ids;

  const stack = [deptId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || ids.has(current)) continue;
    ids.add(current);
    const children = childrenIndex[current] || [];
    children.forEach((childId) => stack.push(childId));
  }
  return ids;
}

/** 顶级部门 id 列表 */
export function getTopLevelDeptIds(byId) {
  return Object.values(byId)
    .filter((d) => !d.parent_id)
    .map((d) => d.id);
}

/** 直接下级部门 */
export function getDirectChildIds(deptId, childrenIndex) {
  return childrenIndex[deptId] || [];
}

function calcPercentage(items) {
  const total = items.reduce((sum, i) => sum + i.total_amount, 0);
  return items.map((item) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.total_amount / total) * 10000) / 100 : 0
  }));
}

async function fetchApprovedExpenseApplications(startDate, endDate, columns = '*') {
  const client = getSupabaseClient();
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + EXPENSE_OVERVIEW_BATCH_SIZE - 1;
    const { data, error } = await client
      .from('expense_applications')
      .select(columns)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('status', 'approved')
      .range(from, to);

    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < EXPENSE_OVERVIEW_BATCH_SIZE) break;
    from += EXPENSE_OVERVIEW_BATCH_SIZE;
  }

  return rows;
}

/**
 * 将 RPC 部门明细转为 deptId -> 金额/笔数
 * （RPC 的 name 对应 department.department_name）
 */
function buildDeptAmountMap(rpcDeptItems, nameToId) {
  const map = {};
  (rpcDeptItems || []).forEach((item) => {
    const name = (item.name || item.department_name || '').trim();
    const deptId = nameToId[name];
    if (!deptId) return;
    if (!map[deptId]) {
      map[deptId] = { total_amount: 0, application_count: 0 };
    }
    map[deptId].total_amount += parseFloat(item.total_amount || 0);
    map[deptId].application_count += parseInt(item.application_count || 0, 10);
  });
  return map;
}

/** 汇总某部门子树内的金额 */
function sumSubtree(deptId, amountMap, childrenIndex) {
  const ids = collectDescendantIds(deptId, childrenIndex);
  let total_amount = 0;
  let application_count = 0;
  ids.forEach((id) => {
    if (amountMap[id]) {
      total_amount += amountMap[id].total_amount;
      application_count += amountMap[id].application_count;
    }
  });
  return { total_amount, application_count };
}

/** 追溯到顶级部门 id */
function findTopLevelDeptId(deptId, byId) {
  if (!deptId || !byId[deptId]) return null;
  let current = deptId;
  const visited = new Set();
  while (current && byId[current] && !visited.has(current)) {
    visited.add(current);
    if (!byId[current].parent_id) return current;
    current = byId[current].parent_id;
  }
  return deptId;
}

/** 在指定上级下，找到申请人所属的直接下级部门 id */
function findDirectChildUnderAncestor(applicantDeptId, ancestorId, byId) {
  if (!applicantDeptId || !ancestorId || !byId[applicantDeptId]) return null;
  let current = applicantDeptId;
  const visited = new Set();
  while (current && byId[current] && !visited.has(current)) {
    visited.add(current);
    if (current === ancestorId) return ancestorId;
    if (byId[current].parent_id === ancestorId) return current;
    current = byId[current].parent_id;
  }
  return null;
}

/**
 * 部门维度：按费用申请 date 字段 + 申请人部门汇总（与申请记录一致，避免 RPC 漏统）
 */
export async function aggregateDepartmentViewFromApplications(
  startDate,
  endDate,
  byId,
  childrenIndex,
  departmentId = ''
) {
  const applications = await fetchApprovedExpenseApplications(
    startDate,
    endDate,
    'amount, applicant_id, applicant_department_id, status'
  );

  const validApps = applications || [];

  const applicantIds = [...new Set(validApps.map((a) => a.applicant_id).filter(Boolean))];
  const usersMap = {};
  if (applicantIds.length > 0) {
    const users = await select(
      'users',
      'id, department',
      [{ type: 'in', column: 'id', value: applicantIds }],
      applicantIds.length,
      0
    );
    (users || []).forEach((u) => {
      usersMap[u.id] = u;
    });
  }

  const bucketMap = {};
  const initBucket = (id, name) => {
    if (!bucketMap[id]) {
      bucketMap[id] = {
        stat_type: '部门',
        department_id: id,
        name: name || '未知',
        total_amount: 0,
        application_count: 0
      };
    }
  };

  if (!departmentId) {
    getTopLevelDeptIds(byId).forEach((id) => initBucket(id, byId[id]?.department_name));
  } else {
    const childIds = getDirectChildIds(departmentId, childrenIndex);
    if (childIds.length > 0) {
      childIds.forEach((id) => initBucket(id, byId[id]?.department_name));
    } else {
      initBucket(departmentId, byId[departmentId]?.department_name);
    }
  }

  let matchedCount = 0;
  validApps.forEach((app) => {
    const user = usersMap[app.applicant_id];
    const deptId = app.applicant_department_id || user?.department;
    if (!deptId || !byId[deptId]) return;

    let bucketId;
    if (!departmentId) {
      bucketId = findTopLevelDeptId(deptId, byId);
    } else {
      const childIds = getDirectChildIds(departmentId, childrenIndex);
      if (childIds.length > 0) {
        bucketId = findDirectChildUnderAncestor(deptId, departmentId, byId);
        if (!bucketId) return;
        if (!bucketMap[bucketId]) {
          const bucketName = bucketId === departmentId
            ? `${byId[bucketId]?.department_name || '本级'}（本级）`
            : byId[bucketId]?.department_name;
          initBucket(bucketId, bucketName);
        }
      } else {
        const subtree = collectDescendantIds(departmentId, childrenIndex);
        if (!subtree.has(deptId) && deptId !== departmentId) return;
        bucketId = departmentId;
      }
    }

    if (!bucketId || !bucketMap[bucketId]) return;
    bucketMap[bucketId].total_amount += parseFloat(app.amount || 0);
    bucketMap[bucketId].application_count += 1;
    matchedCount += 1;
  });

  const items = Object.values(bucketMap).sort((a, b) => b.total_amount - a.total_amount);
  return {
    items: calcPercentage(items),
    meta: {
      totalApplications: validApps.length,
      matchedApplications: matchedCount,
      dateField: 'date',
      startDate,
      endDate
    }
  };
}

/**
 * 部门维度统计（基于 RPC，保留兼容）
 * @deprecated 优先使用 aggregateDepartmentViewFromApplications
 */
export function aggregateDepartmentView(rpcDeptItems, byId, nameToId, childrenIndex, departmentId = '') {
  const amountMap = buildDeptAmountMap(rpcDeptItems, nameToId);

  const makeItem = (id, name, totals) => ({
    stat_type: '部门',
    department_id: id,
    name,
    total_amount: totals.total_amount,
    application_count: totals.application_count
  });

  // 未选部门：按顶级部门汇总
  if (!departmentId) {
    const topIds = getTopLevelDeptIds(byId);
    const items = topIds.map((id) => {
      const totals = sumSubtree(id, amountMap, childrenIndex);
      return makeItem(id, byId[id]?.department_name || '未知', totals);
    });
    const nonEmpty = items.filter((i) => i.total_amount > 0 || i.application_count > 0);
    return calcPercentage(nonEmpty.length ? nonEmpty : items);
  }

  const childIds = getDirectChildIds(departmentId, childrenIndex);

  // 有下级：按直接下级分别汇总（每个下级含其所有子级）
  if (childIds.length > 0) {
    const items = childIds.map((childId) => {
      const totals = sumSubtree(childId, amountMap, childrenIndex);
      return makeItem(childId, byId[childId]?.department_name || '未知', totals);
    });
    const nonEmpty = items.filter((i) => i.total_amount > 0 || i.application_count > 0);
    return calcPercentage(nonEmpty.length ? nonEmpty : items);
  }

  // 叶子部门：仅本级
  const totals = amountMap[departmentId] || { total_amount: 0, application_count: 0 };
  const items = [makeItem(departmentId, byId[departmentId]?.department_name || '未知', totals)];
  return calcPercentage(items);
}

/** 角色维度：按总监 / 管理员 / 组员汇总费用 */
export async function aggregateRoleView(startDate, endDate, roleScope = 'all', departmentId = '') {
  const applications = await fetchApprovedExpenseApplications(
    startDate,
    endDate,
    'amount, applicant_id, applicant_department_id, status'
  );

  const bucketMap = {};
  ROLE_BUCKETS.forEach((r) => {
    bucketMap[r] = { stat_type: '角色', name: r, total_amount: 0, application_count: 0 };
  });
  bucketMap['其他'] = { stat_type: '角色', name: '其他', total_amount: 0, application_count: 0 };

  if (!applications || applications.length === 0) {
    return calcPercentage(ROLE_BUCKETS.map((r) => ({ ...bucketMap[r] })));
  }

  const { childrenIndex } = await loadDepartmentMaps();
  const deptFilterIds = departmentId ? collectDescendantIds(departmentId, childrenIndex) : null;

  const applicantIds = [...new Set(applications.map((a) => a.applicant_id).filter(Boolean))];
  const usersMap = {};
  if (applicantIds.length > 0) {
    const users = await select(
      'users',
      'id, roles, department',
      [{ type: 'in', column: 'id', value: applicantIds }],
      applicantIds.length,
      0
    );
    (users || []).forEach((u) => {
      usersMap[u.id] = u;
    });
  }

  const roleIds = [...new Set(Object.values(usersMap).map((u) => u.roles).filter(Boolean))];
  const rolesMap = {};
  if (roleIds.length > 0) {
    const roles = await select(
      'role_group',
      'role_id, role_name',
      [{ type: 'in', column: 'role_id', value: roleIds }],
      roleIds.length,
      0
    );
    (roles || []).forEach((r) => {
      rolesMap[r.role_id] = r.role_name;
    });
  }

  applications.forEach((app) => {
    const user = usersMap[app.applicant_id];
    const deptId = app.applicant_department_id || user?.department;
    if (deptFilterIds && (!deptId || !deptFilterIds.has(deptId))) return;

    const amount = parseFloat(app.amount || 0);
    const roleName = user?.roles ? rolesMap[user.roles] : null;
    const bucket = classifyRole(roleName);
    const key = ROLE_BUCKETS.includes(bucket) ? bucket : '其他';
    bucketMap[key].total_amount += amount;
    bucketMap[key].application_count += 1;
  });

  let items = Object.values(bucketMap).filter((b) => b.total_amount > 0 || b.application_count > 0);
  if (roleScope && roleScope !== 'all' && ROLE_BUCKETS.includes(roleScope)) {
    items = items.filter((i) => i.name === roleScope);
    if (items.length === 0) {
      items = [{ stat_type: '角色', name: roleScope, total_amount: 0, application_count: 0, percentage: 0 }];
    }
  } else {
    items = items.length ? items : ROLE_BUCKETS.map((r) => ({ ...bucketMap[r] }));
  }
  return calcPercentage(items);
}

/** 申请记录列表 */
export async function fetchOverviewRecords(startDate, endDate, options = {}) {
  const {
    page = 1,
    pageSize = 20,
    departmentId = '',
    roleScope = 'all',
    keyword = ''
  } = options;
  const offset = (page - 1) * pageSize;

  const filters = [
    { type: 'gte', column: 'date', value: startDate },
    { type: 'lte', column: 'date', value: endDate },
    { type: 'eq', column: 'status', value: 'approved' }
  ];

  const { byId, childrenIndex } = await loadDepartmentMaps();
  const deptFilterIds = departmentId ? collectDescendantIds(departmentId, childrenIndex) : null;

  const data = await fetchApprovedExpenseApplications(startDate, endDate, '*');

  const applicantIds = [...new Set((data || []).map((i) => i.applicant_id).filter(Boolean))];
  const usersMap = {};
  if (applicantIds.length > 0) {
    const users = await select(
      'users',
      'id, name, username, department, roles',
      [{ type: 'in', column: 'id', value: applicantIds }],
      applicantIds.length,
      0
    );
    (users || []).forEach((u) => {
      usersMap[u.id] = u;
    });
  }

  const roleIds = [...new Set(Object.values(usersMap).map((u) => u.roles).filter(Boolean))];
  const rolesMap = {};
  if (roleIds.length > 0) {
    const roles = await select(
      'role_group',
      'role_id, role_name',
      [{ type: 'in', column: 'role_id', value: roleIds }],
      roleIds.length,
      0
    );
    (roles || []).forEach((r) => {
      rolesMap[r.role_id] = r.role_name;
    });
  }

  const deptNameMap = {};
  Object.values(byId).forEach((d) => {
    deptNameMap[d.id] = d.department_name;
  });

  let filtered = (data || []).map((item) => {
    const user = usersMap[item.applicant_id];
    const roleName = user?.roles ? rolesMap[user.roles] : null;
    const deptId = item.applicant_department_id || user?.department;
    const deptName = deptId ? deptNameMap[deptId] || '-' : '-';
    const roleBucket = classifyRole(roleName);
    return {
      ...item,
      department_name: deptName,
      department_id: deptId,
      role_name: roleName || '-',
      role_bucket: roleBucket,
      applicant_display: user?.name || item.applicant_name || '未知'
    };
  });

  if (deptFilterIds) {
    filtered = filtered.filter((item) => item.department_id && deptFilterIds.has(item.department_id));
  }

  if (keyword) {
    const searchTerm = String(keyword).toLowerCase();
    filtered = filtered.filter((item) => {
      const name = item.name || '';
      const description = item.description || '';
      const applicant = item.applicant_display || item.applicant_name || '';
      return name.toLowerCase().includes(searchTerm) ||
        description.toLowerCase().includes(searchTerm) ||
        applicant.toLowerCase().includes(searchTerm);
    });
  }

  if (roleScope && roleScope !== 'all' && ROLE_BUCKETS.includes(roleScope)) {
    filtered = filtered.filter((item) => item.role_bucket === roleScope);
  }

  const total = filtered.length;
  const list = filtered.slice(offset, offset + pageSize);

  return { list, total };
}

/** 构建部门树（供前端使用，与 departments/tree 一致） */
export function buildDepartmentTree(departments) {
  const map = new Map();
  const roots = [];
  (departments || []).forEach((d) => {
    map.set(d.id, { ...d, children: [] });
  });
  (departments || []).forEach((d) => {
    const node = map.get(d.id);
    if (d.parent_id && map.has(d.parent_id)) {
      map.get(d.parent_id).children.push(node);
    } else if (!d.parent_id) {
      roots.push(node);
    }
  });
  return roots;
}
