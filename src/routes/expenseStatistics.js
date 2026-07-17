import express from 'express';
import { getSupabaseClient, select } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  loadDepartmentMaps,
  collectDescendantIds,
  aggregateDepartmentViewFromApplications,
  aggregateRoleView,
  fetchOverviewRecords,
  buildDepartmentTree
} from '../utils/expenseOverviewHelper.js';

const router = express.Router();

// 用户费用统计相关接口

const isFinanceApprovalNode = (node) => {
  const nodeName = String(node?.node_name || node?.nodeName || '').toLowerCase();
  return nodeName.includes('财务') ||
    nodeName.includes('出款') ||
    nodeName.includes('付款') ||
    nodeName.includes('支付') ||
    nodeName.includes('finance');
};

async function selectByIdBatches(table, columns, ids, extraFilters = [], batchSize = 50, order = null) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  const rows = [];
  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batchIds = uniqueIds.slice(index, index + batchSize);
    const batchRows = await select(
      table,
      columns,
      [
        { type: 'in', column: 'id', value: batchIds },
        ...extraFilters
      ],
      batchIds.length,
      0,
      order
    );
    rows.push(...(batchRows || []));
  }
  return rows;
}

async function selectByRangeBatches(table, columns, filters = [], batchSize = 1000, order = null) {
  const rows = [];
  let offset = 0;
  while (true) {
    const batchRows = await select(
      table,
      columns,
      filters,
      batchSize,
      offset,
      order
    );
    const batch = batchRows || [];
    rows.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
  return rows;
}

function sumExpenseAmount(rows = []) {
  return rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

async function filterExpensesByUserName(expenses, userName) {
  if (!userName) return expenses;
  const applicantIds = [...new Set((expenses || []).map((item) => item.applicant_id).filter(Boolean))];
  if (applicantIds.length === 0) return [];

  const applicants = await selectByIdBatches(
    'users',
    'id, name, username',
    applicantIds
  );
  const applicantMap = (applicants || []).reduce((map, user) => {
    map[user.id] = user;
    return map;
  }, {});
  const keyword = String(userName).toLowerCase();
  return (expenses || []).filter((item) => {
    const user = applicantMap[item.applicant_id];
    const name = user?.name || item.applicant_name || '';
    const username = user?.username || '';
    return name.toLowerCase().includes(keyword) || username.toLowerCase().includes(keyword);
  });
}

function buildCardMetric(rows = []) {
  return {
    amount: sumExpenseAmount(rows),
    count: rows.length
  };
}

async function getFinancePaidExpensesByTimeRange(startAt, endAt, { mainCategory, subCategory, userName, keyword, departmentId, applicantId } = {}) {
  const approvedNodes = await selectByRangeBatches(
    'expense_approval_nodes',
    '*',
    [
      { type: 'eq', column: 'status', value: 'approved' },
      { type: 'gte', column: 'approval_end_time', value: startAt },
      { type: 'lte', column: 'approval_end_time', value: endAt }
    ],
    1000
  );

  const financeNodes = (approvedNodes || []).filter(isFinanceApprovalNode);
  const expenseIds = [...new Set(financeNodes.map((node) => node.expense_id).filter(Boolean))];
  if (expenseIds.length === 0) return [];

  const expenseFilters = [];
  if (mainCategory) {
    expenseFilters.push({ type: 'eq', column: 'main_category_id', value: mainCategory });
  }
  if (subCategory) {
    expenseFilters.push({ type: 'eq', column: 'sub_category_id', value: subCategory });
  }
  if (applicantId) {
    expenseFilters.push({ type: 'eq', column: 'applicant_id', value: applicantId });
  }

  const expenses = await selectByIdBatches(
    'expense_applications',
    '*',
    expenseIds,
    expenseFilters,
    50,
    { column: 'created_at', ascending: false }
  );

  const applicantIds = [...new Set((expenses || []).map((item) => item.applicant_id).filter(Boolean))];
  const applicantMap = {};
  if (applicantIds.length > 0) {
    const applicants = await selectByIdBatches(
      'users',
      'id, name, username, department',
      applicantIds
    );
    (applicants || []).forEach((user) => {
      applicantMap[user.id] = user;
    });
  }

  const financeNodeMap = financeNodes.reduce((map, node) => {
    const existing = map[node.expense_id];
    if (!existing || new Date(node.approval_end_time) > new Date(existing.approval_end_time)) {
      map[node.expense_id] = node;
    }
    return map;
  }, {});

  const { byId: deptById, childrenIndex } = await loadDepartmentMaps();
  const allowedDepartmentIds = departmentId
    ? collectDescendantIds(departmentId, childrenIndex)
    : null;

  let data = (expenses || []).map((expense) => {
    const applicant = applicantMap[expense.applicant_id];
    const deptId = expense.applicant_department_id || applicant?.department || null;
    const departmentName = deptId ? (deptById[deptId]?.department_name || deptId) : '-';
    return {
      ...expense,
      paid_at: financeNodeMap[expense.id]?.approval_end_time || null,
      approvalNode: financeNodeMap[expense.id] || null,
      department_name: departmentName,
      applicant_info: applicant ? {
        ...applicant,
        department: deptId,
        department_name: departmentName
      } : {
        id: expense.applicant_id,
        name: expense.applicant_name || '未知',
        username: null,
        department: deptId,
        department_name: departmentName
      }
    };
  });

  if (userName) {
    const searchTerm = String(userName).toLowerCase();
    data = data.filter((item) => {
      const name = item.applicant_info?.name || item.applicant_name || '';
      const username = item.applicant_info?.username || '';
      const savedApplicantName = item.applicant_name || '';
      return name.toLowerCase().includes(searchTerm) ||
        username.toLowerCase().includes(searchTerm) ||
        savedApplicantName.toLowerCase().includes(searchTerm);
    });
  }

  if (keyword) {
    const searchTerm = String(keyword).toLowerCase();
    data = data.filter((item) => {
      const name = item.name || '';
      const description = item.description || '';
      return name.toLowerCase().includes(searchTerm) || description.toLowerCase().includes(searchTerm);
    });
  }

  if (allowedDepartmentIds) {
    data = data.filter((item) => allowedDepartmentIds.has(item.applicant_info?.department));
  }

  return data;
}

// 获取用户费用总额统计
router.get('/user-expense-total', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, userName } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_user_expense_total', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_user_name: userName || null
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取用户费用总额统计成功'
    });
    
  } catch (error) {
    console.error('查询用户费用总额统计失败:', error);
    res.status(500).json({
      success: false,
      message: '查询用户费用总额统计失败',
      error: error.message
    });
  }
});

// 获取费用卡片汇总：已付款按订单完成时间；未付款按当前未完成订单
router.get('/expense-card-summary', verifySignatureAndToken, async (req, res, next) => {
  try {
    const {
      startAt,
      endAt,
      yesterdayStartAt,
      yesterdayEndAt,
      todayStartAt,
      todayEndAt,
      mainCategory,
      userName
    } = req.query;

    if (!startAt || !endAt || !yesterdayStartAt || !yesterdayEndAt || !todayStartAt || !todayEndAt) {
      return res.status(400).json({
        success: false,
        message: '统计时间范围不能为空'
      });
    }

    const approvedFilters = [
      { type: 'eq', column: 'status', value: 'approved' },
      { type: 'gte', column: 'updated_at', value: startAt },
      { type: 'lte', column: 'updated_at', value: endAt }
    ];
    if (mainCategory) {
      approvedFilters.push({ type: 'eq', column: 'main_category_id', value: mainCategory });
    }

    let approvedExpenses = await selectByRangeBatches(
      'expense_applications',
      'id, amount, updated_at, applicant_id, applicant_name, main_category_id',
      approvedFilters,
      1000,
      { column: 'updated_at', ascending: false }
    );
    approvedExpenses = await filterExpensesByUserName(approvedExpenses, userName);

    const [yesterdayExpenses, todayExpenses] = await Promise.all([
      getFinancePaidExpensesByTimeRange(yesterdayStartAt, yesterdayEndAt, { mainCategory, userName }),
      getFinancePaidExpensesByTimeRange(todayStartAt, todayEndAt, { mainCategory, userName })
    ]);

    const activeFilters = [
      { type: 'in', column: 'status', value: ['pending', 'approving'] }
    ];
    if (mainCategory) {
      activeFilters.push({ type: 'eq', column: 'main_category_id', value: mainCategory });
    }
    let activeExpenses = await selectByRangeBatches(
      'expense_applications',
      'id, amount, status, applicant_id, applicant_name, main_category_id',
      activeFilters,
      1000,
      { column: 'created_at', ascending: false }
    );
    activeExpenses = await filterExpensesByUserName(activeExpenses, userName);

    const activeNodes = await selectByRangeBatches(
      'expense_approval_nodes',
      'expense_id, node_name, status, is_current_node',
      [
        { type: 'in', column: 'status', value: ['pending', 'approving'] },
        { type: 'eq', column: 'is_current_node', value: true }
      ],
      1000
    );
    const financeExpenseIds = new Set(
      (activeNodes || [])
        .filter(isFinanceApprovalNode)
        .map((node) => node.expense_id)
        .filter(Boolean)
    );
    const paymentPendingExpenses = activeExpenses.filter((item) => financeExpenseIds.has(item.id));

    res.json({
      success: true,
      data: {
        total: buildCardMetric(approvedExpenses),
        approved: buildCardMetric(approvedExpenses),
        yesterday: buildCardMetric(yesterdayExpenses),
        today: buildCardMetric(todayExpenses),
        approving: buildCardMetric(activeExpenses),
        paymentPending: buildCardMetric(paymentPendingExpenses)
      },
      message: '获取费用卡片汇总成功'
    });
  } catch (error) {
    console.error('查询费用卡片汇总失败:', error);
    res.status(500).json({
      success: false,
      message: '查询费用卡片汇总失败',
      error: error.message
    });
  }
});

// 获取财务已付款的费用申请，按财务审批完成时间统计
router.get('/paid-expense-applications', verifySignatureAndToken, async (req, res, next) => {
  try {
    const {
      startAt,
      endAt,
      mainCategory,
      mainCategoryId,
      main_category_id,
      subCategory,
      subCategoryId,
      sub_category_id,
      userName,
      keyword,
      departmentId
    } = req.query;

    if (!startAt || !endAt) {
      return res.status(400).json({
        success: false,
        message: '开始时间和结束时间不能为空'
      });
    }

    const data = await getFinancePaidExpensesByTimeRange(startAt, endAt, {
      mainCategory: mainCategory || mainCategoryId || main_category_id,
      subCategory: subCategory || subCategoryId || sub_category_id,
      userName,
      keyword,
      departmentId
    });

    res.json({
      success: true,
      data,
      message: '获取财务已付款费用申请成功'
    });
  } catch (error) {
    console.error('查询财务已付款费用申请失败:', error);
    res.status(500).json({
      success: false,
      message: '查询财务已付款费用申请失败',
      error: error.message
    });
  }
});

// 获取当前仍在审批流中的未付款费用申请，并按当前节点区分审批中/待付款
router.get('/active-approval-applications', verifySignatureAndToken, async (req, res, next) => {
  try {
    const {
      mainCategory,
      mainCategoryId,
      main_category_id,
      subCategory,
      subCategoryId,
      sub_category_id,
      userName,
      keyword,
      departmentId
    } = req.query;
    const resolvedMainCategory = mainCategory || mainCategoryId || main_category_id;
    const resolvedSubCategory = subCategory || subCategoryId || sub_category_id;

    const activeNodes = await selectByRangeBatches(
      'expense_approval_nodes',
      '*',
      [
        { type: 'in', column: 'status', value: ['pending', 'approving'] },
        { type: 'eq', column: 'is_current_node', value: true }
      ],
      1000
    );

    const expenseIds = [...new Set((activeNodes || []).map((node) => node.expense_id).filter(Boolean))];

    const fallbackPendingFilters = [
      { type: 'in', column: 'status', value: ['pending', 'approving'] }
    ];
    if (resolvedMainCategory) {
      fallbackPendingFilters.push({ type: 'eq', column: 'main_category_id', value: resolvedMainCategory });
    }
    if (resolvedSubCategory) {
      fallbackPendingFilters.push({ type: 'eq', column: 'sub_category_id', value: resolvedSubCategory });
    }
    const fallbackPendingExpenses = await selectByRangeBatches(
      'expense_applications',
      '*',
      fallbackPendingFilters,
      1000,
      { column: 'created_at', ascending: false }
    );
    const fallbackPendingIds = (fallbackPendingExpenses || []).map((expense) => expense.id).filter(Boolean);
    const allUnpaidExpenseIds = [...new Set([...expenseIds, ...fallbackPendingIds])];

    if (allUnpaidExpenseIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: '暂无审批中的费用申请'
      });
    }

    const expenseFilters = [];
    if (resolvedMainCategory) {
      expenseFilters.push({ type: 'eq', column: 'main_category_id', value: resolvedMainCategory });
    }
    if (resolvedSubCategory) {
      expenseFilters.push({ type: 'eq', column: 'sub_category_id', value: resolvedSubCategory });
    }

    const expenses = await selectByIdBatches(
      'expense_applications',
      '*',
      allUnpaidExpenseIds,
      expenseFilters,
      50,
      { column: 'created_at', ascending: false }
    );

    const applicantIds = [...new Set((expenses || []).map((item) => item.applicant_id).filter(Boolean))];
    const applicantMap = {};
    if (applicantIds.length > 0) {
      const applicants = await selectByIdBatches(
        'users',
        'id, name, username, department',
        applicantIds
      );
      (applicants || []).forEach((user) => {
        applicantMap[user.id] = user;
      });
    }

    const activeNodeMap = (activeNodes || []).reduce((map, node) => {
      map[node.expense_id] = node;
      return map;
    }, {});

    const { byId: deptById, childrenIndex } = await loadDepartmentMaps();
    const allowedDepartmentIds = departmentId
      ? collectDescendantIds(departmentId, childrenIndex)
      : null;

    let data = (expenses || []).map((expense) => {
      const approvalNode = activeNodeMap[expense.id] || null;
      const applicant = applicantMap[expense.applicant_id];
      const deptId = expense.applicant_department_id || applicant?.department || null;
      const departmentName = deptId ? (deptById[deptId]?.department_name || deptId) : '-';
      return {
        ...expense,
        status: 'approving',
        approvalNode,
        business_status: isFinanceApprovalNode(approvalNode) ? 'payment_pending' : 'approving',
        department_name: departmentName,
        applicant_info: applicant ? {
          ...applicant,
          department: deptId,
          department_name: departmentName
        } : {
          id: expense.applicant_id,
          name: expense.applicant_name || '未知',
          username: null,
          department: deptId,
          department_name: departmentName
        }
      };
    });

    if (userName) {
      const keyword = String(userName).toLowerCase();
      data = data.filter((item) => {
        const name = item.applicant_info?.name || item.applicant_name || '';
        const username = item.applicant_info?.username || '';
        const savedApplicantName = item.applicant_name || '';
        return name.toLowerCase().includes(keyword) ||
          username.toLowerCase().includes(keyword) ||
          savedApplicantName.toLowerCase().includes(keyword);
      });
    }

    if (keyword) {
      const searchTerm = String(keyword).toLowerCase();
      data = data.filter((item) => {
        const name = item.name || '';
        const description = item.description || '';
        return name.toLowerCase().includes(searchTerm) || description.toLowerCase().includes(searchTerm);
      });
    }

    if (allowedDepartmentIds) {
      data = data.filter((item) => allowedDepartmentIds.has(item.applicant_info?.department));
    }

    res.json({
      success: true,
      data,
      message: '获取当前审批流费用申请成功'
    });
  } catch (error) {
    console.error('查询当前审批流费用申请失败:', error);
    res.status(500).json({
      success: false,
      message: '查询当前审批流费用申请失败',
      error: error.message
    });
  }
});

// 获取分类费用统计
router.get('/category-expense-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, mainCategory } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_category_expense_stats', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_main_category: mainCategory || null
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取分类费用统计成功'
    });
    
  } catch (error) {
    console.error('查询分类费用统计失败:', error);
    res.status(500).json({
      success: false,
      message: '查询分类费用统计失败',
      error: error.message
    });
  }
});

// 获取用户分类费用占比
router.get('/user-category-breakdown', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, userName, departmentId, applicantId, mainCategory } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const startAt = `${startDate}T00:00:00.000+07:00`;
    const endAt = `${endDate}T23:59:59.999+07:00`;
    const paidExpenses = await getFinancePaidExpensesByTimeRange(startAt, endAt, {
      mainCategory,
      userName,
      departmentId,
      applicantId
    });
    
    const categoryIds = [
      ...new Set(
        paidExpenses
          .flatMap((item) => [item.main_category_id, item.sub_category_id])
          .filter(Boolean)
      )
    ];
    const categoryMap = {};
    if (categoryIds.length > 0) {
      const categories = await selectByIdBatches(
        'expense_categories',
        'id, category_name, parent_id',
        categoryIds
      );
      (categories || []).forEach((category) => {
        categoryMap[category.id] = category;
      });
    }
    
    const userTotals = {};
    const groupMap = {};
    (paidExpenses || []).forEach((expense) => {
      const userId = expense.applicant_id || 'unknown';
      const userNameText = expense.applicant_info?.name || expense.applicant_name || expense.applicant_info?.username || '未知';
      const mainCategoryName = categoryMap[expense.main_category_id]?.category_name || expense.main_category_id || '-';
      const subCategoryName = categoryMap[expense.sub_category_id]?.category_name || expense.sub_category_id || '-';
      const key = `${userId}_${expense.main_category_id || 'none'}_${expense.sub_category_id || 'none'}`;
      const amount = Number(expense.amount || 0);

      userTotals[userId] = (userTotals[userId] || 0) + amount;
      if (!groupMap[key]) {
        groupMap[key] = {
          user_id: userId,
          user_name: userNameText,
          main_category_id: expense.main_category_id,
          sub_category_id: expense.sub_category_id,
          main_category_name: mainCategoryName,
          sub_category_name: subCategoryName,
          total_amount: 0,
          application_count: 0
        };
      }
      groupMap[key].total_amount += amount;
      groupMap[key].application_count += 1;
    });

    const result = Object.values(groupMap)
      .map((item) => ({
        ...item,
        total_amount: Number(item.total_amount.toFixed(2)),
        percentage: userTotals[item.user_id]
          ? Number(((item.total_amount / userTotals[item.user_id]) * 100).toFixed(1))
          : 0
      }))
      .sort((a, b) => b.total_amount - a.total_amount);

    res.json({
      success: true,
      data: result,
      message: '获取用户分类费用占比成功'
    });
    
  } catch (error) {
    console.error('查询用户分类费用占比失败:', error);
    res.status(500).json({
      success: false,
      message: '查询用户分类费用占比失败',
      error: error.message
    });
  }
});

// 费用概览用部门树（与部门管理一致）
router.get('/department-tree', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { departments } = await loadDepartmentMaps();
    res.json({
      success: true,
      data: buildDepartmentTree(departments),
      message: '获取部门树成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取部门树失败',
      error: error.message
    });
  }
});

// 获取费用概览统计
// viewMode: department | role | records
// departmentId: 部门 uuid，空=全部顶级部门；选中后统计其下级或本级
// roleScope: all | 总监 | 管理员 | 组员
router.get('/expense-overview', verifySignatureAndToken, async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      viewMode = 'department',
      departmentId = '',
      roleScope = 'all',
      page = 1,
      pageSize = 20,
      keyword = ''
    } = req.query;

    const resolvedDepartmentId = departmentId || '';
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_expense_overview', {
      p_start_date: startDate,
      p_end_date: endDate
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }

    const rpcDeptItems = (result || []).filter(item => item.stat_type === '部门');
    const rpcCategoryItems = (result || []).filter(item => item.stat_type === '主分类');

    if (viewMode === 'records') {
      const records = await fetchOverviewRecords(startDate, endDate, {
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || 20,
        departmentId: resolvedDepartmentId,
        roleScope,
        keyword
      });
      return res.json({
        success: true,
        viewMode: 'records',
        data: records,
        message: '获取申请记录成功'
      });
    }

    if (viewMode === 'role') {
      const roleItems = await aggregateRoleView(startDate, endDate, roleScope, resolvedDepartmentId);
      return res.json({
        success: true,
        viewMode: 'role',
        data: {
          items: roleItems,
          role: roleItems
        },
        rawData: result,
        message: '获取角色维度费用概览成功'
      });
    }

    // 默认：部门维度（按申请 date + 申请人部门，与申请记录筛选一致）
    const { byId, childrenIndex } = await loadDepartmentMaps();
    const { items: deptItems, meta: deptMeta } = await aggregateDepartmentViewFromApplications(
      startDate,
      endDate,
      byId,
      childrenIndex,
      resolvedDepartmentId
    );

    res.json({
      success: true,
      viewMode: 'department',
      data: {
        items: deptItems,
        department: deptItems,
        category: rpcCategoryItems
      },
      meta: deptMeta,
      rawData: result,
      message: '获取费用概览统计成功'
    });
  } catch (error) {
    console.error('获取费用概览统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取费用概览统计失败',
      error: error.message
    });
  }
});

// 获取费用统计图表数据（用于图表展示）
router.get('/expense-chart-data', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, chartType = 'pie', userName } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    let chartData = [];
    
    if (chartType === 'userBreakdown' && userName) {
      // 用户分类占比饼图数据
      const { data: breakdownResult, error: breakdownError } = await getSupabaseClient().rpc('get_user_category_breakdown', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_user_name: userName
      });
      
      if (breakdownError) {
        console.error('调用函数失败:', breakdownError);
        throw breakdownError;
      }
      
      chartData = breakdownResult.map(item => ({
        name: item.main_category_name,
        value: parseFloat(item.total_amount),
        percentage: parseFloat(item.percentage_of_total)
      }));
      
    } else if (chartType === 'categoryBar') {
      // 分类柱状图数据
      const { data: categoryResult, error: categoryError } = await getSupabaseClient().rpc('get_category_expense_stats', {
        p_start_date: startDate,
        p_end_date: endDate
      });
      
      if (categoryError) {
        console.error('调用函数失败:', categoryError);
        throw categoryError;
      }
      
      chartData = categoryResult.map(item => ({
        category: item.main_category_name,
        amount: parseFloat(item.total_amount),
        count: parseInt(item.application_count)
      }));
      
    } else if (chartType === 'departmentPie') {
      // 部门饼图数据
      const { data: overviewResult, error: overviewError } = await getSupabaseClient().rpc('get_expense_overview', {
        p_start_date: startDate,
        p_end_date: endDate
      });
      
      if (overviewError) {
        console.error('调用函数失败:', overviewError);
        throw overviewError;
      }
      
      // 筛选部门数据
      const departmentData = overviewResult.filter(item => item.stat_type === '部门');
      
      chartData = departmentData.map(item => ({
        name: item.name,
        value: parseFloat(item.total_amount),
        percentage: parseFloat(item.percentage)
      }));
    }
    
    res.json({
      success: true,
      data: chartData,
      chartType,
      message: '获取图表数据成功'
    });
  } catch (error) {
    next(error);
  }
});

// 获取费用趋势数据（按月统计）
router.get('/expense-trend', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    
    const params = [startDate, endDate, groupBy];
    const { data: result, error } = await getSupabaseClient().rpc('get_expense_trend', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_group_by: groupBy
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    // 格式化日期
    const formattedResult = result.map(item => ({
      period: item.period,
      periodFormatted: new Date(item.period).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: groupBy === 'day' ? 'numeric' : undefined
      }),
      total_amount: parseFloat(item.total_amount),
      application_count: parseInt(item.application_count),
      avg_amount: parseFloat(item.avg_amount)
    }));
    
    res.json({
      success: true,
      data: formattedResult,
      message: '获取费用趋势数据成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;