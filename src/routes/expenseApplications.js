import express from 'express';
import { select, insert,update, count, getSupabaseClient, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';
import { loadDepartmentMaps, collectDescendantIds } from '../utils/expenseOverviewHelper.js';
import { isSuperAdmin } from '../utils/superAdmin.js';

const operationLogger = new OperationLogger();

const router = express.Router();

const isFinanceApprovalNode = (node) => {
  const nodeName = String(node?.node_name || node?.nodeName || '').toLowerCase();
  return nodeName.includes('财务') ||
    nodeName.includes('出款') ||
    nodeName.includes('付款') ||
    nodeName.includes('支付') ||
    nodeName.includes('finance');
};

async function getExpensesWithActiveApprovalNode(expenseIds) {
  const ids = [...new Set((expenseIds || []).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const activeNodes = await select(
    'expense_approval_nodes',
    'expense_id',
    [
      { type: 'in', column: 'expense_id', value: ids },
      { type: 'in', column: 'status', value: ['pending', 'approving'] },
      { type: 'eq', column: 'is_current_node', value: true }
    ],
    ids.length,
    0
  );

  return new Set((activeNodes || []).map((node) => node.expense_id));
}

async function getActiveApprovalNodesByExpenseId(expenseIds) {
  const ids = [...new Set((expenseIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const activeNodes = await select(
    'expense_approval_nodes',
    '*',
    [
      { type: 'in', column: 'expense_id', value: ids },
      { type: 'in', column: 'status', value: ['pending', 'approving'] },
      { type: 'eq', column: 'is_current_node', value: true }
    ],
    ids.length,
    0
  );

  return (activeNodes || []).reduce((map, node) => {
    map[node.expense_id] = node;
    return map;
  }, {});
}

async function selectByIdBatchesLocal(table, columns, ids = [], extraFilters = [], batchSize = 100) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  const rows = [];

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batchIds = uniqueIds.slice(i, i + batchSize);
    const batchRows = await select(table, columns, [
      { type: 'in', column: 'id', value: batchIds },
      ...extraFilters
    ]);
    rows.push(...(batchRows || []));
  }

  return rows;
}

function resolveExpenseDisplayStatus(expense, activeExpenseIds) {
  if (activeExpenseIds?.has(expense.id)) return 'approving';
  return expense.status;
}

// 获取直属部门审批用户（支持层级审批）- 递归实现
// 获取部门审批人
async function getDepartmentApprovers(departmentId, hierarchical = true) {
  try {
    console.log('获取部门审批人', departmentId, hierarchical);
    // 防止循环引用
    if (!departmentId) {
      return [];
    }

    
    const approvers = [];
    
    // 首先从角色组表中查找具有department或all数据权限的角色
    const roleFilters = [
      { type: 'in', column: 'data_permission', value: ['department', 'all'] },
      { type: 'eq', column: 'status', value: true }
    ];
    
    const roles = await select('role_group', 'role_id, data_permission', roleFilters);
    
    if (roles && roles.length > 0) {
      // 创建角色ID到数据权限的映射
      const rolePermissionMap = roles.reduce((map, role) => {
        map[role.role_id] = role.data_permission;
        return map;
      }, {});
      console.log('角色权限映射:', rolePermissionMap);
      
      const roleIds = roles.map(role => role.role_id);
      
      // 查询具有这些角色且在当前部门的用户
      const users = await select('users', 'id, name, email, department, roles', [
        { type: 'eq', column: 'department', value: departmentId },
        { type: 'in', column: 'roles', value: roleIds }
      ], 100, 0);
      console.log('获取用户:', users);
      
      if (users && users.length > 0) {
        // 根据数据权限筛选用户，优先选择department权限的用户
        const departmentUsers = users.filter(user => rolePermissionMap[user.roles] === 'department');
        console.log('部门权限用户:', departmentUsers);
        const allUsers = users.filter(user => rolePermissionMap[user.roles] === 'all');
        console.log('所有权限用户:', allUsers);
        
        if (departmentUsers.length > 0) {
          approvers.push(...departmentUsers);
        } else if (allUsers.length > 0) {
          approvers.push(...allUsers);
        }
      }
    }
    
    // 如果启用了层级审批且有上级部门，递归查找
    if (hierarchical) {
      // 获取部门信息
      const deptResult = await select('department', 'id, parent_id', [
        { type: 'eq', column: 'id', value: departmentId }
      ], 1, 0);
      console.log('获取部门信息:', deptResult);
      
      if (deptResult && deptResult.length > 0 && deptResult[0].parent_id) {
        // 递归查找上级部门的审批人
        const parentApprovers = await getDepartmentApprovers(
          deptResult[0].parent_id, 
          hierarchical
        );
        approvers.push(...parentApprovers);
      }
    }
    console.log('获取部门审批人:', departmentId, approvers);
    return approvers;
  } catch (error) {
    console.error('获取部门审批人失败:', error);
    return [];
  }
}

async function createExpenseApprovalNodes(expenseId, expenseData, currentUser) {
  let flowConfig = null;
  let nodes = [];

  const flowFilters = [
    { type: 'eq', column: 'flow_type', value: 'expense' },
    { type: 'eq', column: 'status', value: 'active' }
  ];
  const flowConfigs = await select('approval_flow_config', '*', flowFilters, 1, 0);
  if (flowConfigs && flowConfigs.length > 0) {
    flowConfig = flowConfigs[0];
    nodes = flowConfig.nodes || [];
  }

  if (!flowConfig) {
    console.warn('未找到活动的费用审批流程配置');
    return [];
  }

  const approvalNodes = [];
  let nodeSortOrder = 1;
  let hasCurrentNode = false;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.approvalType === 'dept_manager') {
      const hierarchical = node.hierarchical || false;
      const approvers = await getDepartmentApprovers(expenseData.applicant_department_id, hierarchical);

      if (approvers && approvers.length > 0) {
        for (let j = 0; j < approvers.length; j++) {
          const approver = approvers[j];
          const isFirstNode = (j === 0);
          if (j === 0 && approver.id === currentUser.id) {
            continue;
          }
          if (!approver.id) {
            continue;
          }
          let isCurrentNode = false;
          if (hasCurrentNode === false) {
            isCurrentNode = true;
            hasCurrentNode = true;
          }

          approvalNodes.push({
            expense_id: expenseId,
            node_name: `${node.name}`,
            user_id: approver.id,
            status: 'pending',
            comment: '',
            sort_order: nodeSortOrder++,
            is_current_node: (isCurrentNode && isFirstNode),
            approval_start_time: (isCurrentNode && isFirstNode) ? new Date().toISOString() : null,
            approval_end_time: null,
            approval_duration_seconds: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    } else {
      let userId = null;

      if (node.approvalType === 'auto') {
        userId = null;
      } else if (node.approver.type === 'role' && node.approver?.id) {
        const roleUsers = await select('users', 'id, roles', [
          { type: 'eq', column: 'roles', value: node.approver.id }
        ]);

        if (roleUsers && roleUsers.length > 0) {
          userId = roleUsers[0].id;
        }
      } else if (node.approver.type === 'department' && node.approver?.id) {
        let shouldSkipNode = false;

        const roleFilters = [
          { type: 'in', column: 'data_permission', value: ['department', 'all'] },
          { type: 'eq', column: 'status', value: true }
        ];

        const roles = await select('role_group', 'role_id, data_permission', roleFilters);

        if (!roles || roles.length === 0) {
          shouldSkipNode = true;
        } else {
          const rolePermissionMap = roles.reduce((map, role) => {
            map[role.role_id] = role.data_permission;
            return map;
          }, {});

          const roleIds = roles.map(role => role.role_id);
          const deptUsers = await select('users', 'id, roles', [
            { type: 'eq', column: 'department', value: node.approver.id },
            { type: 'in', column: 'roles', value: roleIds }
          ]);

          if (deptUsers && deptUsers.length > 0) {
            const validUsers = deptUsers.filter(user =>
              rolePermissionMap[user.roles] === 'department' || rolePermissionMap[user.roles] === 'all'
            );

            if (validUsers.length > 0) {
              const departmentUsers = validUsers.filter(user => rolePermissionMap[user.roles] === 'department');
              if (departmentUsers.length > 0) {
                userId = departmentUsers[0].id;
                node.name = `${node.name} - ${departmentUsers[0].name}`;
              } else {
                const allUsers = validUsers.filter(user => rolePermissionMap[user.roles] === 'all');
                if (allUsers.length > 0) {
                  userId = allUsers[0].id;
                  node.name = `${node.name}`;
                } else {
                  shouldSkipNode = true;
                }
              }
            } else {
              shouldSkipNode = true;
            }
          } else {
            shouldSkipNode = true;
          }
        }

        if (shouldSkipNode) {
          continue;
        }
      } else if (node.approver.type === 'user' && node.approver?.id) {
        userId = node.approver.id;
        node.name = `${node.name}`;
      }

      approvalNodes.push({
        expense_id: expenseId,
        node_name: node.name,
        user_id: userId,
        comment: '',
        sort_order: nodeSortOrder++,
        approval_end_time: null,
        approval_duration_seconds: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  approvalNodes.forEach((element, index) => {
    if (index === 0) {
      element.is_current_node = true;
      element.status = 'pending';
      element.approval_start_time = new Date().toISOString();
    } else {
      element.is_current_node = false;
      element.status = 'pending';
    }
  });

  if (approvalNodes.length > 0) {
    await insert('expense_approval_nodes', approvalNodes);
  }

  return approvalNodes;
}

// 获取费用申请列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword = '', status, applicant_id, start_date, end_date, mainCategoryId, subCategoryId } = req.query;
    const offset = (page - 1) * pageSize;

    // 获取当前登录用户ID
    const currentUserId = req.user.id;

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'name', value: keyword },
        { type: 'ilike', column: 'description', value: keyword }
      );
    }

    // 构建AND过滤条件 - 只返回当前用户的数据
    const filters = [];
    filters.push({ type: 'eq', column: 'applicant_id', value: currentUserId }); // 只返回当前用户的费用申请
    
    if (status && status !== 'all') {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    if (applicant_id) {
      // 注意：这里仍然允许按applicant_id过滤，但基础过滤已经限制了只能看自己的数据
      filters.push({ type: 'eq', column: 'applicant_id', value: applicant_id });
    }
    if (start_date) {
      filters.push({ type: 'gte', column: 'date', value: start_date });
    }
    if (end_date) {
      filters.push({ type: 'lte', column: 'date', value: end_date });
    }
    if (mainCategoryId) {
      filters.push({ type: 'eq', column: 'main_category_id', value: mainCategoryId });
    }
    if (subCategoryId) {
      filters.push({ type: 'eq', column: 'sub_category_id', value: subCategoryId });
    }

    // 排序条件
    const order = { column: 'created_at', ascending: false };

    // 查询费用申请表数据
    const data = await select('expense_applications', '*', filters, pageSize, offset, order, orFilters);
    
    // 获取总数
    const totalCount = await count('expense_applications', filters, orFilters);

    const activeNodeMap = await getActiveApprovalNodesByExpenseId((data || []).map((item) => item.id));
    const activeExpenseIds = new Set(Object.keys(activeNodeMap));
    const finalData = (data || []).map((item) => ({
      ...item,
      approvalNode: activeNodeMap[item.id] || null,
      status: resolveExpenseDisplayStatus(item, activeExpenseIds)
    }));

    res.json({
      success: true,
      data: finalData,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(totalCount / pageSize)
      },
      message: '获取费用申请列表成功'
    });
  } catch (error) {
    next(error);
  }
});

// 获取所有费用申请列表（仅超级管理员）- 包括所有用户的申请记录
router.get('/list-all', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 检查用户是否是超级管理员
    const currentUserId = req.user.id;
    const userFilters = [{ type: 'eq', column: 'id', value: currentUserId }];
    const userData = await select('users', 'id, roles', userFilters, 1, 0);
    
    if (!userData || userData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentUser = userData[0];
    
    // 获取用户角色信息
    let isSuperAdmin = false;
    if (currentUser.roles) {
      const roleFilters = [{ type: 'eq', column: 'role_id', value: currentUser.roles }];
      const roleData = await select('role_group', 'role_id, role_code', roleFilters, 1, 0);
      if (roleData && roleData.length > 0 && roleData[0].role_code === 'superadmin') {
        isSuperAdmin = true;
      }
    }
    
    // 如果不是超级管理员，拒绝访问
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: '权限不足，仅超级管理员可访问'
      });
    }
    
    const { page = 1, pageSize = 10, keyword = '', status, applicant_id, applicant_name, start_date, end_date, mainCategoryId, subCategoryId, departmentId } = req.query;
    const offset = (page - 1) * pageSize;
    const queryPageSize = applicant_name ? 10000 : parseInt(pageSize, 10);
    const queryOffset = applicant_name ? 0 : offset;

    const { byId: deptById, childrenIndex } = await loadDepartmentMaps();
    const deptNameMap = {};
    Object.values(deptById).forEach((d) => {
      deptNameMap[d.id] = d.department_name;
    });

    let deptIds = [];
    let deptUserIds = [];
    if (departmentId) {
      deptIds = [...collectDescendantIds(departmentId, childrenIndex)];
      if (deptIds.length > 0) {
        const usersInDept = await select(
          'users',
          'id',
          [{ type: 'in', column: 'department', value: deptIds }],
          5000,
          0
        );
        deptUserIds = (usersInDept || []).map((u) => u.id);
      }
      if (deptIds.length === 0 && deptUserIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: parseInt(page, 10),
            pageSize: parseInt(pageSize, 10),
            totalPages: 0
          },
          message: '获取所有费用申请列表成功'
        });
      }
    }

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      console.log('[list-all] 关键词搜索:', keyword);
      orFilters.push(
        { type: 'ilike', column: 'name', value: keyword },
        { type: 'ilike', column: 'description', value: keyword }
      );
      console.log('[list-all] OR过滤条件:', JSON.stringify(orFilters, null, 2));
    }

    // 如果提供了申请人姓名或用户名筛选，先查询匹配的用户ID
    let applicantIdFilters = [];
    if (applicant_name) {
      console.log('[list-all] 搜索申请人:', applicant_name);
      // 查询匹配用户名或姓名的用户
      const userOrFilters = [
        { type: 'ilike', column: 'name', value: applicant_name },
        { type: 'ilike', column: 'username', value: applicant_name }
      ];
      const matchedUsers = await select('users', 'id, name, username', [], null, 0, null, userOrFilters);
      console.log('[list-all] 匹配到的用户:', matchedUsers);
      if (matchedUsers && matchedUsers.length > 0) {
        const matchedUserIds = matchedUsers.map(u => u.id);
        console.log('[list-all] 匹配到的用户ID:', matchedUserIds);
      } else {
        console.log('[list-all] 未找到匹配的用户，将在已删除用户中搜索');
      }
    }

    // 构建AND过滤条件 - 不限制用户，可以查看所有申请
    const filters = [];
    
    if (status && status !== 'all') {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    if (applicant_id) {
      filters.push({ type: 'eq', column: 'applicant_id', value: applicant_id });
    }
    if (start_date) {
      filters.push({ type: 'gte', column: 'date', value: start_date });
    }
    if (end_date) {
      filters.push({ type: 'lte', column: 'date', value: end_date });
    }
    if (mainCategoryId) {
      filters.push({ type: 'eq', column: 'main_category_id', value: mainCategoryId });
    }
    if (subCategoryId) {
      filters.push({ type: 'eq', column: 'sub_category_id', value: subCategoryId });
    }

    // 排序条件
    const order = { column: 'created_at', ascending: false };

    let data = [];
    let totalCount = 0;

    if (departmentId && (deptIds.length > 0 || deptUserIds.length > 0)) {
      const client = getSupabaseClient();
      let query = client.from('expense_applications').select('*', { count: 'exact' });

      filters.forEach((filter) => {
        if (filter.type === 'eq') query = query.eq(filter.column, filter.value);
        else if (filter.type === 'gte') query = query.gte(filter.column, filter.value);
        else if (filter.type === 'lte') query = query.lte(filter.column, filter.value);
        else if (filter.type === 'in') query = query.in(filter.column, filter.value);
      });

      if (orFilters.length) {
        const orConditions = orFilters.map((filter) => {
          if (filter.type === 'ilike') {
            const escaped = String(filter.value).replace(/%/g, '\\%').replace(/_/g, '\\_');
            return `${filter.column}.ilike.*${escaped}*`;
          }
          return '';
        }).filter(Boolean).join(',');
        if (orConditions) query = query.or(orConditions);
      }

      const deptOrParts = [];
      if (deptUserIds.length > 0) {
        deptOrParts.push(`applicant_id.in.(${deptUserIds.join(',')})`);
      }
      if (deptIds.length > 0) {
        deptOrParts.push(`applicant_department_id.in.(${deptIds.join(',')})`);
      }
      if (deptOrParts.length > 0) {
        query = query.or(deptOrParts.join(','));
      }

      query = query.order(order.column, { ascending: order.ascending });
      query = query.range(queryOffset, queryOffset + queryPageSize - 1);

      const { data: rows, error: queryError, count } = await query;
      if (queryError) throw queryError;
      data = rows || [];
      totalCount = count ?? 0;
    } else {
      console.log('[list-all] 查询参数:', { filters: JSON.stringify(filters), orFilters: JSON.stringify(orFilters), pageSize: queryPageSize, offset: queryOffset });
      data = await select('expense_applications', '*', filters, queryPageSize, queryOffset, order, orFilters);
      totalCount = await count('expense_applications', filters, orFilters);
    }

    console.log('[list-all] 数据库查询结果数量:', data?.length || 0);
    console.log('[list-all] 数据库查询总数:', totalCount);

    // 获取申请人信息（包含 username）
    const applicantIds = [...new Set((data || []).map(item => item.applicant_id).filter(id => id !== null))];
    const applicantsMap = {};
    if (applicantIds.length > 0) {
      const applicantFilters = [{ type: 'in', column: 'id', value: applicantIds }];
      const applicants = await select('users', 'id, name, username, email, department', applicantFilters, applicantIds.length, 0);
      if (applicants) {
        applicants.forEach(applicant => {
          applicantsMap[applicant.id] = applicant;
        });
      }
    }
    
    const resolveDeptName = (deptId) => {
      if (!deptId) return '-';
      return deptNameMap[deptId] || deptId;
    };

    // 为每条记录添加申请人信息
    // 如果申请人已被删除，使用申请时保存的申请人姓名
    let enrichedData = (data || []).map((item) => {
      const userDeptId = applicantsMap[item.applicant_id]?.department || item.applicant_department_id;
      const departmentName = resolveDeptName(userDeptId);
      return {
        ...item,
        department_name: departmentName,
        applicant_info: {
          ...(applicantsMap[item.applicant_id] || {
            id: item.applicant_id,
            name: item.applicant_name || '已删除用户',
            username: null,
            email: null,
            department: item.applicant_department_id || null
          }),
          department: userDeptId,
          department_name: departmentName
        },
        is_timeout_rejection: false
      };
    });

    // 检查所有 rejected 状态的订单是否有超时拒绝的节点
    const rejectedExpenseIds = enrichedData
      .filter(item => item.status === 'rejected')
      .map(item => item.id);
    
    if (rejectedExpenseIds.length > 0) {
      // 查询这些订单的审批节点，检查是否有超时拒绝的
      const nodeFilters = [
        { type: 'in', column: 'expense_id', value: rejectedExpenseIds },
        { type: 'eq', column: 'status', value: 'rejected' }
      ];
      const rejectedNodes = await select('expense_approval_nodes', 'expense_id, comment', nodeFilters);
      
      // 构建超时拒绝的订单ID集合
      const timeoutRejectedIds = new Set();
      if (rejectedNodes && rejectedNodes.length > 0) {
        rejectedNodes.forEach(node => {
          const comment = node.comment || '';
          if (comment.includes('审核超时') || comment.includes('超时')) {
            timeoutRejectedIds.add(node.expense_id);
          }
        });
      }
      
      // 更新 enrichedData 中的 is_timeout_rejection 标记
      enrichedData = enrichedData.map(item => {
        if (timeoutRejectedIds.has(item.id)) {
          return { ...item, is_timeout_rejection: true };
        }
        return item;
      });
    }

    // 如果提供了申请人姓名筛选，且没有找到匹配的用户（可能是已删除用户），在前端进行补充筛选
    let finalData = enrichedData;
    let finalTotalCount = totalCount;
    
    if (applicant_name) {
      // 统一匹配用户表姓名/用户名和申请单保存的申请人名，避免 admin 历史单据被 applicant_id 漏掉
      console.log('[list-all] 申请人搜索后处理，原始数据量:', enrichedData.length);
      finalData = enrichedData.filter(item => {
        const name = item.applicant_info?.name || item.applicant_name || '';
        const username = item.applicant_info?.username || '';
        const savedApplicantName = item.applicant_name || '';
        const searchTerm = applicant_name.toLowerCase();
        const matches =
          name.toLowerCase().includes(searchTerm) ||
          username.toLowerCase().includes(searchTerm) ||
          savedApplicantName.toLowerCase().includes(searchTerm);
        if (matches) {
          console.log('[list-all] 匹配到申请人记录:', { name, username, savedApplicantName, item_name: item.name });
        }
        return matches;
      });
      console.log('[list-all] 筛选后数据量:', finalData.length);
      // 注意：这里的总数不准确，因为是在内存中筛选的
      // 如果需要准确的总数，需要在数据库层面进行JOIN查询
      finalTotalCount = finalData.length;
    }
    
    // 如果有关键词搜索，也需要在已删除用户的数据中进行筛选
    // 因为关键词搜索可能没有匹配到已删除用户的数据
    if (keyword) {
      console.log('[list-all] 关键词搜索后处理，原始数据量:', finalData.length);
      const keywordLower = keyword.toLowerCase();
      finalData = finalData.filter(item => {
        const name = item.name || '';
        const description = item.description || '';
        const applicantName = item.applicant_info?.name || item.applicant_name || '';
        const applicantUsername = item.applicant_info?.username || '';
        const matches = 
          name.toLowerCase().includes(keywordLower) || 
          description.toLowerCase().includes(keywordLower) ||
          applicantName.toLowerCase().includes(keywordLower) ||
          applicantUsername.toLowerCase().includes(keywordLower);
        if (matches) {
          console.log('[list-all] 关键词匹配到记录:', { name, description, applicantName, applicantUsername });
        }
        return matches;
      });
      console.log('[list-all] 关键词筛选后数据量:', finalData.length);
      finalTotalCount = finalData.length;
    }

    const activeNodeMap = await getActiveApprovalNodesByExpenseId(finalData.map((item) => item.id));
    const activeExpenseIds = new Set(Object.keys(activeNodeMap));
    finalData = finalData.map((item) => ({
      ...item,
      approvalNode: activeNodeMap[item.id] || null,
      status: resolveExpenseDisplayStatus(item, activeExpenseIds)
    }));

    if (applicant_name) {
      finalData = finalData.slice(offset, offset + parseInt(pageSize, 10));
    }

    res.json({
      success: true,
      data: finalData,
      pagination: {
        total: finalTotalCount,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(finalTotalCount / pageSize)
      },
      message: '获取所有费用申请列表成功'
    });
  } catch (error) {
    next(error);
  }
});

// 创建费用申请
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { 
      name, 
      main_category_id, 
      sub_category_id, 
      amount, 
      date, 
      description,
      applicant_id,
      applicant_name,
      applicant_department_id,
      attachments = [],
      payment_method = '',
      payee_name = '',
      account_name = '',
      account_type = ''
    } = req.body;

    // 验证必填字段
    if (!name || !main_category_id || !sub_category_id || !amount || !date) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段：name, main_category_id, sub_category_id, amount, date'
      });
    }

    // 验证附件格式 - 如果是字符串，先尝试转换为数组
    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: '附件格式错误，字符串格式不正确'
        });
      }
    }
    
    if (!Array.isArray(attachments)) {
      return res.status(400).json({
        success: false,
        message: '附件格式错误，应为数组'
      });
    }

    // 创建费用申请数据
    const expenseData = {
      name,
      main_category_id,
      sub_category_id,
      amount: parseFloat(amount),
      date,
      description: description || '',
      status: 'pending',
      applicant_id: req.user.id,
      applicant_name: req.user.name,
      applicant_department_id: req.user.department,
      attachments: JSON.stringify(attachments),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      payment_method: payment_method || '',
      payee_name: payee_name || '',
      account_name: account_name || '',
      account_type: account_type || ''
    };

    // 插入费用申请表
    const expenseResult = await insert('expense_applications', expenseData);
    
    if (!expenseResult || expenseResult.length === 0) {
      return res.status(500).json({
        success: false,
        message: '创建费用申请失败'
      });
    }

    const expenseApplication = expenseResult[0];
    const expenseId = expenseApplication.id;

    try {
      // 查询对应的审批流程配置
      let flowConfig = null;
      let nodes = [];
      
      if (!flowConfig) {
        // 如果没有指定流程配置ID或指定的流程不存在，使用默认流程
        const flowFilters = [
          { type: 'eq', column: 'flow_type', value: 'expense' },
          { type: 'eq', column: 'status', value: 'active' }
        ];
        const flowConfigs = await select('approval_flow_config', '*', flowFilters, 1, 0);
        if (flowConfigs && flowConfigs.length > 0) {
          flowConfig = flowConfigs[0];
          nodes = flowConfig.nodes || [];
        }
      }
      
      if (!flowConfig) {
        console.warn('未找到活动的费用审批流程配置');
        return res.status(201).json({
          success: true,
          data: expenseApplication,
          message: '创建费用申请成功，但未找到对应的审批流程配置'
        });
      }

      // 生成审批节点记录
      const approvalNodes = [];
      let currentNodeIndex = 0;
      let nodeSortOrder = 1;
      let letisCurrentNode=false
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
       
        
        // 处理直属部门审批类型
        if (node.approvalType === 'dept_manager') {
          const hierarchical = node.hierarchical || false;
          const approvers = await getDepartmentApprovers(expenseData.applicant_department_id, hierarchical);
          
          if (approvers && approvers.length > 0) {
            // 为每个审批人创建一个审批节点
            for (let j = 0; j < approvers.length; j++) {
              const approver = approvers[j];
              const isFirstNode = (j === 0);
              if(j==0 && approver.id==req.user.id){
                continue;
              }
              if(!approver.id){
                continue;
              }
              let isCurrentNode=false;
              if(letisCurrentNode===false){
                isCurrentNode=true
                letisCurrentNode=true
              }
              else
              {
                isCurrentNode=false;
              }
              
              
              
              approvalNodes.push({
                expense_id: expenseId,
                node_name: `${node.name}`,
                user_id: approver.id,
                status: (isCurrentNode && isFirstNode) ? 'pending' : 'pending',
                comment: '',
                sort_order: nodeSortOrder++,
                is_current_node: (isCurrentNode && isFirstNode),
                approval_start_time: (isCurrentNode && isFirstNode) ? new Date().toISOString() : null,
                approval_end_time: null,
                approval_duration_seconds: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
          } else {
            // // 没有找到审批人，创建一个空节点
            // approvalNodes.push({
            //   expense_id: expenseId,
            //   node_name: `${node.name} - 未找到审批人`,
            //   user_id: null,
            //   status: isCurrentNode ? 'pending' : 'pending',
            //   comment: '',
            //   sort_order: nodeSortOrder++,
            //   is_current_node: isCurrentNode,
            //   approval_start_time: isCurrentNode ? new Date().toISOString() : null,
            //   approval_end_time: null,
            //   approval_duration_seconds: null,
            //   created_at: new Date().toISOString(),
            //   updated_at: new Date().toISOString()
            // });
          }
        } else {
          // 处理其他审批类型（保持原有逻辑）
          let userId = null;
          
          if (node.approvalType === 'auto') {
            // 自动审批，不需要用户ID
            userId = null;
          } else if (node.approver.type === 'role' && node.approver?.id) {
           
              // 获取申请人部门中该角色的用户
              const roleUsers = await select('users', 'id, roles', [
                { type: 'eq', column: 'roles', value: node.approver.id }
              ]);
              
              if (roleUsers && roleUsers.length > 0) {
                      userId = roleUsers[0].id;
            }
          } else if (node.approver.type === 'department' && node.approver?.id) {
            // 根据部门获取用户，优先选择数据权限为department或all的用户
            let shouldSkipNode = false;
            
            // 首先从角色组表中获取具有department或all数据权限的角色
            const roleFilters = [
              { type: 'in', column: 'data_permission', value: ['department', 'all'] },
              { type: 'eq', column: 'status', value: true }
            ];
            
            const roles = await select('role_group', 'role_id, data_permission', roleFilters);
            
            if (!roles || roles.length === 0) {
              // 如果没有找到具有有效数据权限的角色，跳过当前节点
              shouldSkipNode = true;
            } else {
              // 创建角色ID到数据权限的映射
              const rolePermissionMap = roles.reduce((map, role) => {
                map[role.role_id] = role.data_permission;
                return map;
              }, {});
              
              const roleIds = roles.map(role => role.role_id);
              
              // 获取指定部门中这些角色的用户
              const deptUsers = await select('users', 'id, roles', [
                { type: 'eq', column: 'department', value: node.approver.id },
                { type: 'in', column: 'roles', value: roleIds }
              ]);
              
              if (deptUsers && deptUsers.length > 0) {
                // 检查用户的数据权限（现在基于角色）
                const validUsers = deptUsers.filter(user => {
                  // 获取用户角色的数据权限
                  return rolePermissionMap[user.roles] === 'department' || rolePermissionMap[user.roles] === 'all';
                });
                
                if (validUsers.length > 0) {
                  // 优先选择department权限的用户
                  const departmentUsers = validUsers.filter(user => rolePermissionMap[user.roles] === 'department');
                  if (departmentUsers.length > 0) {
                    userId = departmentUsers[0].id;
                     node.name = `${node.name} - ${departmentUsers[0].name}`;
                  } else {
                    // 如果没有department权限的用户，选择all权限的用户
                    const allUsers = validUsers.filter(user => rolePermissionMap[user.roles] === 'all');
                    if (allUsers.length > 0) {
                      userId = allUsers[0].id;
                      node.name = `${node.name}`;
                    } else {
                      // 如果都没有，跳过当前节点
                      shouldSkipNode = true;
                    }
                  }
                } else {
                  // 如果没有有效权限的用户，跳过当前节点
                  shouldSkipNode = true;
                }
              } else {
                // 如果指定部门中没有用户，跳过当前节点
                shouldSkipNode = true;
              }
            }
            
            if (shouldSkipNode) {
              continue; // 跳过当前节点
            }
          } else if (node.approver.type === 'user' && node.approver?.id) {
            // 指定用户
            userId = node.approver.id;
            node.name = `${node.name}`;
          }

          approvalNodes.push({
            expense_id: expenseId,
            node_name: node.name,
            user_id: userId,
           
            comment: '',
            sort_order: nodeSortOrder++,
            approval_end_time: null,
            approval_duration_seconds: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
      approvalNodes.forEach((element,index) => {
        if(index===0){
          element.is_current_node=true;
          element.status= 'pending';
          element.approval_start_time=new Date().toISOString();
        }
        else{
          element.is_current_node=false;
          element.status='pending';
        }
      });

      // 批量插入审批节点
      if (approvalNodes.length > 0) {
        await insert('expense_approval_nodes', approvalNodes);
      }

    } catch (flowError) {
      console.error('创建审批流程失败:', flowError);
      // 如果审批流程创建失败，删除已创建的费用申请
      await deleteData('expense_applications', [{ type: 'eq', column: 'id', value: expenseId }]);
      
      return res.status(500).json({
        success: false,
        message: '创建审批流程失败',
        error: flowError.message
      });
    }

    // 记录操作日志
    await operationLogger.recordOperation('expense_applications', 'create', {
      expense_id: expenseId,
      name: name,
      amount: parseFloat(amount),
      main_category_id: main_category_id,
      sub_category_id: sub_category_id,
      date: date,
      description: description || '',
      applicant_id: req.user.id,
      applicant_name: req.user.name,
      status: 'pending'
    }, req.user?.id);

    res.status(201).json({
      success: true,
      data: expenseApplication,
      message: '创建费用申请成功，已生成审批流程'
    });
  } catch (error) {
    next(error);
  }
});

// 重新提交已拒绝/已取消的费用申请（申请人本人）
router.post('/:id/resubmit', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      name,
      main_category_id,
      sub_category_id,
      amount,
      date,
      description,
      payment_method = '',
      payee_name = '',
      account_name = '',
      account_type = ''
    } = req.body;
    let { attachments = [] } = req.body;

    if (!name || !main_category_id || !sub_category_id || !amount || !date) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段：name, main_category_id, sub_category_id, amount, date'
      });
    }

    if (typeof attachments === 'string') {
      try {
        attachments = JSON.parse(attachments);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: '附件格式错误，字符串格式不正确'
        });
      }
    }

    if (!Array.isArray(attachments)) {
      return res.status(400).json({
        success: false,
        message: '附件格式错误，应为数组'
      });
    }

    const expenseRows = await select(
      'expense_applications',
      '*',
      [
        { type: 'eq', column: 'id', value: id },
        { type: 'eq', column: 'applicant_id', value: userId }
      ],
      1,
      0
    );

    if (!expenseRows || expenseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '费用申请不存在或无权操作'
      });
    }

    const existingExpense = expenseRows[0];
    if (!['rejected', 'cancelled'].includes(existingExpense.status)) {
      return res.status(400).json({
        success: false,
        message: '只有已拒绝或已取消的费用申请可以重新提交'
      });
    }

    const now = new Date().toISOString();
    const updateData = {
      name,
      main_category_id,
      sub_category_id,
      amount: parseFloat(amount),
      date,
      description: description || '',
      status: 'pending',
      attachments: JSON.stringify(attachments),
      created_at: now,
      updated_at: now,
      payment_method: payment_method || '',
      payee_name: payee_name || '',
      account_name: account_name || '',
      account_type: account_type || ''
    };

    const updatedRows = await update(
      'expense_applications',
      updateData,
      [
        { type: 'eq', column: 'id', value: id },
        { type: 'eq', column: 'applicant_id', value: userId }
      ]
    );

    await deleteData('expense_approval_nodes', [{ type: 'eq', column: 'expense_id', value: id }]);
    const updatedExpense = {
      ...existingExpense,
      ...updateData,
      id,
      applicant_id: existingExpense.applicant_id,
      applicant_name: existingExpense.applicant_name,
      applicant_department_id: existingExpense.applicant_department_id
    };
    await createExpenseApprovalNodes(id, updatedExpense, req.user);

    await operationLogger.recordOperation('expense_applications', 'resubmit', {
      expense_id: id,
      name,
      amount: parseFloat(amount),
      main_category_id,
      sub_category_id,
      date,
      applicant_id: userId,
      previous_status: existingExpense.status,
      new_status: 'pending'
    }, req.user?.id);

    res.json({
      success: true,
      data: updatedRows?.[0] || updatedExpense,
      message: '费用申请已重新提交，等待审批'
    });
  } catch (error) {
    console.error('重新提交费用申请失败:', error);
    next(error);
  }
});

// 获取审批统计信息
router.get('/approval-statistics', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    try {
      // 获取用户待审批数量
      const pendingFilters = [
        { type: 'eq', column: 'user_id', value: userId },
        { type: 'eq', column: 'status', value: 'pending' },
        { type: 'eq', column: 'is_current_node', value: true }
      ];
      
      const pendingCount = await count('expense_approval_nodes', pendingFilters);

      // 获取用户已审批数量（最近30天）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const approvedFilters = [
        { type: 'eq', column: 'user_id', value: userId },
        { type: 'in', column: 'status', value: ['approved', 'rejected'] },
        { type: 'gte', column: 'updated_at', value: thirtyDaysAgo.toISOString() }
      ];
      
      const approvedCount = await count('expense_approval_nodes', approvedFilters);

      // 获取用户审批的平均耗时（最近30天）
      const client = getSupabaseClient();
      const { data: avgData, error: avgError } = await client
        .from('expense_approval_nodes')
        .select('approval_duration_seconds')
        .eq('user_id', userId)
        .in('status', ['approved', 'rejected'])
        .gte('updated_at', thirtyDaysAgo.toISOString())
        .not('approval_duration_seconds', 'is', null);

      let avgDuration = 0;
      if (!avgError && avgData && avgData.length > 0) {
        const totalDuration = avgData.reduce((sum, node) => sum + (node.approval_duration_seconds || 0), 0);
        avgDuration = Math.round(totalDuration / avgData.length);
      }

      res.json({
        success: true,
        data: {
          pending_count: pendingCount,
          approved_count: approvedCount,
          avg_duration_seconds: avgDuration,
          statistics_date_range: {
            start: thirtyDaysAgo.toISOString(),
            end: new Date().toISOString()
          }
        },
        message: '获取审批统计信息成功'
      });

    } catch (error) {
      console.error('获取审批统计失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取审批统计失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取我的审批记录（包含通过和拒绝状态）
router.get('/my-approvals', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const superAdmin = isSuperAdmin(req.user);
    const { page = 1, pageSize = 10, keyword = '', status, start_date, end_date, mainCategoryId, subCategoryId, main_category_id, sub_category_id } = req.query;
    const offset = (page - 1) * pageSize;

    try {
      // 构建查询条件
      const nodeFilters = [
        { type: 'in', column: 'status', value: ['approved', 'rejected'] }
      ];
      if (!superAdmin) {
        nodeFilters.push({ type: 'eq', column: 'user_id', value: userId });
      }

      if (status && !['approved', 'rejected'].includes(status)) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: 0
          },
          message: '该状态不属于已审批记录'
        });
      }

      // 添加时间范围筛选
      if (start_date) {
        nodeFilters.push({ type: 'gte', column: 'updated_at', value: start_date });
      }
      if (end_date) {
        nodeFilters.push({ type: 'lte', column: 'updated_at', value: end_date });
      }

      // 如果指定了状态筛选
      if (status && ['approved', 'rejected'].includes(status)) {
        nodeFilters.push({ type: 'eq', column: 'status', value: status });
      }

      const order = { column: 'updated_at', ascending: false };
      const approvalNodes = await select('expense_approval_nodes', '*', nodeFilters, 10000, 0, order);
      
      if (!approvalNodes || approvalNodes.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: 0
          },
          message: '暂无审批记录'
        });
      }

      // 获取对应的费用申请ID
      const expenseIds = [...new Set(approvalNodes.map(node => node.expense_id))];
      
      // 查询费用申请详情
      const expenseFilters = [{ type: 'in', column: 'id', value: expenseIds }];
      
      // 添加主分类和子分类筛选条件
      const resolvedMainCategoryId = mainCategoryId || main_category_id;
      const resolvedSubCategoryId = subCategoryId || sub_category_id;
      if (resolvedMainCategoryId) {
        expenseFilters.push({ type: 'eq', column: 'main_category_id', value: resolvedMainCategoryId });
      }
      if (resolvedSubCategoryId) {
        expenseFilters.push({ type: 'eq', column: 'sub_category_id', value: resolvedSubCategoryId });
      }
      
      let expenses = await selectByIdBatchesLocal(
        'expense_applications',
        '*',
        expenseIds,
        expenseFilters.filter(filter => filter.column !== 'id'),
        100
      );
      expenses = expenses.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      
      // 构建费用申请映射
      const expenseMap = expenses.reduce((map, expense) => {
        map[expense.id] = expense;
        return map;
      }, {});

      // 获取申请人信息
      const applicantIds = [...new Set(expenses.map(expense => expense.applicant_id))];
      let applicantMap = {};
      if (applicantIds.length > 0) {
        const applicants = await selectByIdBatchesLocal('users', 'id, name, username, department', applicantIds, [], 100);
        applicantMap = applicants.reduce((map, user) => {
          map[user.id] = user;
          return map;
        }, {});
      }

      const { byId: deptById } = await loadDepartmentMaps();

      // 构建返回数据，转换为前端期望的扁平结构
      let data = approvalNodes.map(node => {
        const expense = expenseMap[node.expense_id];
        const applicant = applicantMap[expense?.applicant_id];
        
        if (!expense) return null;
        const departmentId = expense.applicant_department_id || applicant?.department || null;
        const departmentName = departmentId ? (deptById[departmentId]?.department_name || departmentId) : '未知';
        
        // 转换为前端期望的格式（扁平结构，驼峰命名）
        return {
          id: expense.id,
          name: expense.name,
          amount: expense.amount,
          date: expense.expense_date || expense.date,
          status: expense.status,
          description: expense.description,
          // 转换字段名为驼峰命名法
          mainCategoryId: expense.main_category_id,
          subCategoryId: expense.sub_category_id,
          applicantId: expense.applicant_id,
          createdAt: expense.created_at,
          updatedAt: expense.updated_at,
           attachments: expense.attachments,
          paymentMethod: expense.payment_method,
          payeeName: expense.payee_name,
          accountName: expense.account_name,
          accountType: expense.account_type,
          // 申请人信息
          applicant: applicant
            ? { ...applicant, department: departmentName, department_id: departmentId }
            : { name: expense.applicant_name || '未知', username: '', department: departmentName, department_id: departmentId },
          // 审批节点信息（简化版）
          approvalNode: {
            id: node.id,
            status: node.status,
            comment: node.comment,
            updatedAt: node.updated_at
          }
        };
      }).filter(item => item !== null); // 过滤掉没有对应费用申请的记录

      if (keyword) {
        const searchTerm = String(keyword).toLowerCase();
        data = data.filter(item =>
          String(item.name || '').toLowerCase().includes(searchTerm) ||
          String(item.description || '').toLowerCase().includes(searchTerm) ||
          String(item.applicant?.name || '').toLowerCase().includes(searchTerm) ||
          String(item.applicant?.username || '').toLowerCase().includes(searchTerm) ||
          String(item.applicant?.department || '').toLowerCase().includes(searchTerm)
        );
      }

      const totalCount = data.length;
      data = data.slice(offset, offset + parseInt(pageSize, 10));

      res.json({
        success: true,
        data: data,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取我的审批记录成功'
      });

    } catch (error) {
      console.error('获取我的审批记录失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取我的审批记录失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取费用申请审批节点信息
router.get('/:id/approval-nodes', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    try {
      // 获取审批节点，按sort_order升序排列
      const nodeFilters = [{ type: 'eq', column: 'expense_id', value: id }];
      const nodeOrder = { column: 'sort_order', ascending: true };
      const approvalNodes = await select('expense_approval_nodes', '*', nodeFilters, null, 0, nodeOrder);
      
      if (!approvalNodes || approvalNodes.length === 0) {
        return res.json({
          success: true,
          data: [],
          message: '暂无审批节点信息'
        });
      }

      // 获取所有相关的用户ID
      const userIds = [...new Set(approvalNodes.map(node => node.user_id).filter(id => id !== null))];
      
      // 获取用户信息（包括 name 和 username）
      let userMap = {};
      if (userIds.length > 0) {
        const userFilters = [{ type: 'in', column: 'id', value: userIds }];
        const users = await select('users', 'id, name, username, department', userFilters);
        console.log(`[审批节点API] 查询到 ${users?.length || 0} 个用户，用户ID列表:`, userIds);
        userMap = users.reduce((map, user) => {
          map[user.id] = user;
          console.log(`[审批节点API] 用户映射: ${user.id} -> ${user.name || user.username || '无名称'}`);
          return map;
        }, {});
        
        // 检查是否有用户ID未找到对应的用户信息
        const missingUserIds = userIds.filter(id => !userMap[id]);
        if (missingUserIds.length > 0) {
          console.warn(`[审批节点API] 以下用户ID未找到用户信息:`, missingUserIds);
        }
      }

      // 构建返回数据，包含用户信息
      const nodesWithUserInfo = approvalNodes.map(node => {
        const userInfo = node.user_id ? userMap[node.user_id] || null : null;
        
        // 添加调试日志
        console.log(`[审批节点 ${node.id}] user_id: ${node.user_id}, user_info:`, userInfo);
        
        return {
          ...node,
          user_info: userInfo
        };
      });

      // 添加汇总日志
      console.log(`[审批节点API] 费用ID: ${id}, 节点总数: ${nodesWithUserInfo.length}, 有用户信息的节点数: ${nodesWithUserInfo.filter(n => n.user_info).length}`);

      res.json({
        success: true,
        data: nodesWithUserInfo,
        message: '获取审批节点信息成功'
      });
    } catch (error) {
      console.error('获取审批节点信息失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取审批节点信息失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取待审批费用列表
router.get('/pending-approvals', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const superAdmin = isSuperAdmin(req.user);
    const { page = 1, pageSize = 10, keyword = '', status, mainCategoryId, subCategoryId, main_category_id, sub_category_id, start_date, end_date } = req.query;
    const offset = (page - 1) * pageSize;

    try {
      // 查询当前用户需要审批的节点
      const nodeFilters = [
        { type: 'in', column: 'status', value: ['pending', 'approving'] },
        { type: 'eq', column: 'is_current_node', value: true }
      ];
      if (!superAdmin) {
        nodeFilters.push({ type: 'eq', column: 'user_id', value: userId });
      }
      console.log('nodeFilters', nodeFilters);
      const pendingNodes = await select('expense_approval_nodes', '*', nodeFilters);
      
      if (!pendingNodes || pendingNodes.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: 0
          },
          message: '暂无待审批费用'
        });
      }

      // 获取对应的费用申请ID
      const expenseIds = pendingNodes.map(node => node.expense_id);
      
      // 查询费用申请详情
      const expenseFilters = [{ type: 'in', column: 'id', value: expenseIds }];
      
      // 添加主分类和子分类筛选条件
      const resolvedMainCategoryId = mainCategoryId || main_category_id;
      const resolvedSubCategoryId = subCategoryId || sub_category_id;
      if (resolvedMainCategoryId) {
        expenseFilters.push({ type: 'eq', column: 'main_category_id', value: resolvedMainCategoryId });
      }
      if (resolvedSubCategoryId) {
        expenseFilters.push({ type: 'eq', column: 'sub_category_id', value: resolvedSubCategoryId });
      }
      if (start_date) {
        expenseFilters.push({ type: 'gte', column: 'date', value: start_date });
      }
      if (end_date) {
        expenseFilters.push({ type: 'lte', column: 'date', value: end_date });
      }
      
      const allExpenseList = (await selectByIdBatchesLocal(
        'expense_applications',
        '*',
        expenseIds,
        expenseFilters.filter(filter => filter.column !== 'id'),
        100
      )).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      // 获取申请人信息
      const applicantIds = [...new Set(allExpenseList.map(expense => expense.applicant_id).filter(Boolean))];
      let applicantMap = {};
      if (applicantIds.length > 0) {
        const applicants = await selectByIdBatchesLocal('users', 'id, name, username, department', applicantIds, [], 100);
        applicantMap = applicants.reduce((map, user) => {
          map[user.id] = user;
          return map;
        }, {});
      }

      const { byId: deptById } = await loadDepartmentMaps();

      // 构建返回数据，转换字段名为驼峰命名法以匹配前端期望
      let data = allExpenseList.map(expense => {
        const applicant = applicantMap[expense.applicant_id] || null;
        const departmentId = expense.applicant_department_id || applicant?.department || null;
        const departmentName = departmentId ? (deptById[departmentId]?.department_name || departmentId) : '未知';
        const approvalNode = pendingNodes.find(node => node.expense_id === expense.id);

        return {
          id: expense.id,
          name: expense.name,
          amount: expense.amount,
          date: expense.expense_date || expense.date,
          mainCategoryId: expense.main_category_id,
          subCategoryId: expense.sub_category_id,
          status: expense.status,
          description: expense.description,
          // 转换字段名为驼峰命名法
          applicantId: expense.applicant_id,
          createdAt: expense.created_at,
          updatedAt: expense.updated_at,
          attachments: expense.attachments,
          paymentMethod: expense.payment_method,
          payeeName: expense.payee_name,
          accountName: expense.account_name,
          accountType: expense.account_type,
          // 申请人信息
          applicant: applicant
            ? { ...applicant, department: departmentName, department_id: departmentId }
            : { name: expense.applicant_name || '未知', username: '', department: departmentName, department_id: departmentId },
          approvalNode
        };
      });

      if (keyword) {
        const searchTerm = String(keyword).toLowerCase();
        data = data.filter(item =>
          String(item.name || '').toLowerCase().includes(searchTerm) ||
          String(item.description || '').toLowerCase().includes(searchTerm) ||
          String(item.applicant?.name || '').toLowerCase().includes(searchTerm) ||
          String(item.applicant?.username || '').toLowerCase().includes(searchTerm) ||
          String(item.applicant?.department || '').toLowerCase().includes(searchTerm)
        );
      }

      if (status) {
        data = data.filter(item => {
          if (status === 'payment_pending') return isFinanceApprovalNode(item.approvalNode);
          if (status === 'approval_pending') return !isFinanceApprovalNode(item.approvalNode);
          return item.status === status || item.approvalNode?.status === status;
        });
      }

      const totalCount = data.length;
      data = data.slice(offset, offset + parseInt(pageSize, 10));

      res.json({
        success: true,
        data: data,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取待审批费用列表成功'
      });
    } catch (error) {
      console.error('获取待审批费用列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取待审批费用列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 审批费用申请（通过或拒绝）
router.post('/:id/approve', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { action, comment = '' } = req.body;
    let { attachments = {} } = req.body;
    const superAdmin = isSuperAdmin(req.user);

    // 验证审批动作
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: '无效的审批动作，只能是 approve 或 reject'
      });
    }

    // 首先验证费用申请是否存在
    const expenseFilters = [{ type: 'eq', column: 'id', value: id }];
    const expenseData = await select('expense_applications', '*', expenseFilters, 1, 0);
    
    if (!expenseData || expenseData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '费用申请不存在'
      });
    }

    const expenseApplication = expenseData[0];
    const activeExpenseIdsBeforeApproval = await getExpensesWithActiveApprovalNode([id]);
    if (activeExpenseIdsBeforeApproval.has(id) && expenseApplication.status === 'approved') {
      await update('expense_applications', {
        status: 'approving',
        updated_at: new Date().toISOString()
      }, [{ type: 'eq', column: 'id', value: id }]);
      expenseApplication.status = 'approving';
    }

    // 验证状态：只有待审批和审批中的申请可以审批
    if (!['pending', 'approving'].includes(expenseApplication.status)) {
      return res.status(400).json({
        success: false,
        message: '当前状态不允许审批',
        current_status: expenseApplication.status
      });
    }

    try {
      // 查询需要处理的当前审批节点；超级管理员可跨级处理任意当前节点
      const nodeFilters = [
        { type: 'eq', column: 'expense_id', value: id },
        { type: 'eq', column: 'is_current_node', value: true },
        { type: 'in', column: 'status', value: ['pending', 'approving'] }
      ];
      if (!superAdmin) {
        nodeFilters.push({ type: 'eq', column: 'user_id', value: userId });
      }
      
      let currentNodes = await select('expense_approval_nodes', '*', nodeFilters);

      // 容错：老数据如果没有 current_node，超级管理员仍可处理最前面的待审批节点
      if (superAdmin && (!currentNodes || currentNodes.length === 0)) {
        currentNodes = await select(
          'expense_approval_nodes',
          '*',
          [
            { type: 'eq', column: 'expense_id', value: id },
            { type: 'in', column: 'status', value: ['pending', 'approving'] }
          ],
          1,
          0,
          { column: 'sort_order', ascending: true }
        );
      }
      
      if (!currentNodes || currentNodes.length === 0) {
        return res.status(403).json({
          success: false,
          message: superAdmin ? '该费用申请没有可处理的审批节点' : '您无权审批此费用申请或该申请不在您的审批节点'
        });
      }

      const currentNode = currentNodes[0];
      const now = new Date().toISOString();

      if (superAdmin && isFinanceApprovalNode(currentNode) && String(currentNode.user_id) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: '该费用已流转至财务，必须由财务审批付款'
        });
      }
      
      // 计算审批耗时（秒）
      const startTime = new Date(currentNode.approval_start_time || currentNode.created_at);
      const endTime = new Date(now);
      const durationSeconds = Math.floor((endTime - startTime) / 1000)-8*3600;

      // 验证附件格式 - 如果是字符串，先尝试转换为数组
      if (typeof attachments === 'string') {
        try {
          attachments = JSON.parse(attachments);
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: '附件格式错误，字符串格式不正确'
          });
        }
      }
      
      if (!Array.isArray(attachments)) {
        return res.status(400).json({
          success: false,
          message: '附件格式错误，应为数组'
        });
      }

      let allNodesForApproval = [];
      let pendingNodesForApproval = [];
      let financeNodeAfterCurrent = null;
      if (action === 'approve') {
        allNodesForApproval = await select(
          'expense_approval_nodes',
          '*',
          [{ type: 'eq', column: 'expense_id', value: id }],
          null,
          0,
          { column: 'sort_order', ascending: true }
        );
        pendingNodesForApproval = (allNodesForApproval || []).filter((node) =>
          ['pending', 'approving'].includes(node.status)
        );
        financeNodeAfterCurrent = pendingNodesForApproval
          .filter((node) => node.sort_order > currentNode.sort_order)
          .find(isFinanceApprovalNode);

        if (!isFinanceApprovalNode(currentNode) && !financeNodeAfterCurrent) {
          return res.status(400).json({
            success: false,
            message: '审批流程缺少后续财务节点，不能直接完成订单'
          });
        }
      }

      // 更新当前节点状态
      const nodeUpdateData = {
        status: action === 'approve' ? 'approved' : 'rejected',
        comment: comment,
        attachments: JSON.stringify(attachments),
        is_current_node: false,
        approval_end_time: now,
        approval_duration_seconds: durationSeconds,
        updated_at: now
      };
      if (superAdmin) {
        nodeUpdateData.user_id = userId;
        nodeUpdateData.comment = comment
          ? `超级管理员跨级审批：${comment}`
          : '超级管理员跨级审批';
      }

      await update('expense_approval_nodes', nodeUpdateData, [{ type: 'eq', column: 'id', value: currentNode.id }]);

      // 确定费用申请的新状态
      let newExpenseStatus = expenseApplication.status;
      let message = '';

      if (action === 'reject') {
        // 如果拒绝，直接更新费用申请状态为已拒绝
        newExpenseStatus = 'rejected';
        message = '费用申请已拒绝';
        
        // 更新所有后续待处理节点为取消
        const subsequentFilters = [
          { type: 'eq', column: 'expense_id', value: id },
          { type: 'in', column: 'status', value: ['pending', 'approving'] }
        ];
        
        await update('expense_approval_nodes', {
          status: 'cancelled',
          comment: '前置节点已拒绝，流程终止',
          updated_at: now
        }, subsequentFilters);
        
      } else {
        if (superAdmin) {
          if (!isFinanceApprovalNode(currentNode) && financeNodeAfterCurrent) {
            const skippedNodes = pendingNodesForApproval.filter((node) =>
              node.id !== financeNodeAfterCurrent.id &&
              node.sort_order > currentNode.sort_order &&
              node.sort_order < financeNodeAfterCurrent.sort_order
            );

            for (const node of skippedNodes) {
              await update('expense_approval_nodes', {
                status: 'cancelled',
                comment: '超级管理员已跨级审批通过，跳转至财务处理',
                is_current_node: false,
                updated_at: now
              }, [{ type: 'eq', column: 'id', value: node.id }]);
            }

            await update('expense_approval_nodes', {
              status: 'approving',
              is_current_node: true,
              approval_start_time: now,
              updated_at: now
            }, [{ type: 'eq', column: 'id', value: financeNodeAfterCurrent.id }]);

            newExpenseStatus = 'approving';
            message = '超级管理员已跨级审批通过，已流转至财务处理';
          } else if (isFinanceApprovalNode(currentNode)) {
            const pendingAfterFinance = pendingNodesForApproval
              .filter((node) => node.sort_order > currentNode.sort_order && node.id !== currentNode.id);
            if (pendingAfterFinance.length === 0) {
              newExpenseStatus = 'approved';
              message = '财务审批已通过，费用申请审批完成';
            } else {
              const nextNode = pendingAfterFinance.sort((a, b) => a.sort_order - b.sort_order)[0];
              await update('expense_approval_nodes', {
                is_current_node: true,
                approval_start_time: now,
                status: 'approving',
                updated_at: now
              }, [{ type: 'eq', column: 'id', value: nextNode.id }]);
              newExpenseStatus = 'approving';
              message = '审批已通过，进入下一节点';
            }
          } else {
            newExpenseStatus = 'approving';
            message = '超级管理员已跨级审批通过，等待财务处理';
          }
        } else {
        // 如果通过，检查是否还有后续节点
        const nextNodeFilters = [
          { type: 'eq', column: 'expense_id', value: id },
          { type: 'eq', column: 'status', value: 'pending' }
        ];
        
        const remainingNodes = await select('expense_approval_nodes', '*', nextNodeFilters);
        
        if (remainingNodes.length === 0) {
          // 没有后续节点，流程完成
          newExpenseStatus = 'approved';
          message = '费用申请审批完成，已通过';
        } else {
          // 还有后续节点，找到下一个节点并激活
          const nextNode = remainingNodes.sort((a, b) => a.sort_order - b.sort_order)[0];
          
          // 更新下一个节点为当前节点
          await update('expense_approval_nodes', {
            is_current_node: true,
            approval_start_time: now,
            status: 'approving',
            updated_at: now
          }, [{ type: 'eq', column: 'id', value: nextNode.id }]);
          
          newExpenseStatus = 'approving';
          message = '审批已通过，进入下一节点';
        }
        }
      }

      // 更新费用申请状态
      await update('expense_applications', {
        status: newExpenseStatus,
        updated_at: now
      }, [{ type: 'eq', column: 'id', value: id }]);

      // 记录操作日志
      await operationLogger.recordOperation('expense_applications', action === 'approve' ? 'approve' : 'reject', {
        expense_id: id,
        node_id: currentNode.id,
        action: action,
        is_super_admin_approval: superAdmin,
        new_status: newExpenseStatus,
        comment: comment,
        approval_time: now,
        duration_seconds: durationSeconds,
        expense_name: expenseApplication.name,
        applicant_id: expenseApplication.applicant_id,
        amount: expenseApplication.amount
      }, req.user?.id);

      res.json({
        success: true,
        data: {
          expense_id: id,
          node_id: currentNode.id,
          action: action,
          new_status: newExpenseStatus,
          approval_time: now,
          duration_seconds: durationSeconds
        },
        message: message
      });

    } catch (error) {
      console.error('审批处理失败:', error);
      return res.status(500).json({
        success: false,
        message: '审批处理失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 检查并处理超时的审批（48小时未完成自动拒绝）- API端点（用于手动触发）
router.post('/check-timeout', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { checkExpenseApprovalTimeout, APPROVAL_TIMEOUT_ENABLED } = await import('../utils/approvalTimeoutChecker.js');

    if (!APPROVAL_TIMEOUT_ENABLED) {
      return res.json({
        success: true,
        data: { checked: 0, timeout: 0, timeoutIds: [], disabled: true },
        message: '费用审批超时自动拒绝功能已关闭'
      });
    }

    const result = await checkExpenseApprovalTimeout();
    
    res.json({
      success: true,
      data: result,
      message: `检查完成，发现 ${result.timeout} 个超时的审批申请已自动拒绝`
    });
  } catch (error) {
    console.error('[超时检查API] 检查超时审批失败:', error);
    return res.status(500).json({
      success: false,
      message: '检查超时审批失败',
      error: error.message
    });
  }
});

// 取消费用申请
router.post('/:id/cancel', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // 检查申请是否存在且属于当前用户
    const filters = [{ type: 'eq', column: 'id', value: id }];
    const expenseData = await select('expense_applications', '*', filters, 1, 0);
    
    if (!expenseData || expenseData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '费用申请不存在'
      });
    }
    
    const expense = expenseData[0];
    
    if (expense.applicant_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '只能取消自己的费用申请'
      });
    }
    
    if (expense.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '只能取消待审批的费用申请'
      });
    }
    
    // 更新申请状态
    const updateData = {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    };
    
    await update('expense_applications', updateData, filters);
    
    // 更新相关的审批节点状态
    const nodeFilters = [{ type: 'eq', column: 'expense_id', value: id }];
    const nodeUpdateData = {
      status: 'cancelled',
      comment: '申请已取消',
      updated_at: new Date().toISOString()
    };
    
    await update('expense_approval_nodes', nodeUpdateData, nodeFilters);
    
    // 记录操作日志
    await operationLogger.recordOperation('expense_applications', 'cancel', {
      expense_id: id,
      status: 'cancelled',
      applicant_id: expense.applicant_id,
      name: expense.name,
      amount: expense.amount,
      main_category_id: expense.main_category_id,
      sub_category_id: expense.sub_category_id
    }, req.user?.id);
    
    res.json({
      success: true,
      data: {
        id,
        status: 'cancelled'
      },
      message: '费用申请已取消'
    });
  } catch (error) {
    console.error('取消费用申请失败:', error);
    res.status(500).json({
      success: false,
      message: '取消费用申请失败',
      error: error.message
    });
  }
});

// 删除费用申请（仅超级管理员）
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const currentUserRoleCode = req.user.roleInfo?.role_code;

    // 检查是否为超级管理员
    if (currentUserRoleCode !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: '无权限删除费用申请，仅超级管理员可执行此操作'
      });
    }

    // 检查申请是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    const expenseData = await select('expense_applications', '*', filters, 1, 0);
    
    if (!expenseData || expenseData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '费用申请不存在'
      });
    }

    const expense = expenseData[0];

    // 删除关联的审批节点
    const nodeFilters = [{ type: 'eq', column: 'expense_id', value: id }];
    await deleteData('expense_approval_nodes', nodeFilters);

    // 删除费用申请
    await deleteData('expense_applications', filters);

    // 记录操作日志
    await operationLogger.recordOperation(
      'expense_applications',
      'delete',
      {
        expense_id: id,
        expense_name: expense.name,
        amount: expense.amount,
        applicant_id: expense.applicant_id,
        deleted_by: req.user.id
      },
      req.user.id
    );

    res.json({
      success: true,
      message: '费用申请删除成功'
    });
  } catch (error) {
    console.error('删除费用申请失败:', error);
    return res.status(500).json({
      success: false,
      message: '删除费用申请失败',
      error: error.message
    });
  }
});

// 批量删除费用申请（仅限超级管理员）
// 注意：Express的DELETE请求需要特殊处理body，使用POST方法更可靠
router.post('/batch-delete', verifySignatureAndToken, async (req, res, next) => {
  try {
    console.log('[批量删除] 请求体:', req.body);
    console.log('[批量删除] 请求体类型:', typeof req.body);
    console.log('[批量删除] 请求体字符串:', JSON.stringify(req.body));
    const { ids } = req.body;
    console.log('[批量删除] 接收到的IDs:', ids);
    console.log('[批量删除] IDs类型:', typeof ids);
    console.log('[批量删除] IDs是否为数组:', Array.isArray(ids));
    
    // 确保 ids 是数组
    let idsArray = ids;
    if (!Array.isArray(ids)) {
      if (ids && typeof ids === 'object') {
        // 如果是对象，尝试转换为数组
        idsArray = Object.values(ids);
        console.log('[批量删除] 将对象转换为数组:', idsArray);
      } else {
        return res.status(400).json({
          success: false,
          message: 'IDs参数必须是数组格式'
        });
      }
    }
    
    const currentUserRoleCode = req.user.roleInfo?.role_code;

    // 检查是否为超级管理员
    if (currentUserRoleCode !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: '无权限批量删除费用申请，仅超级管理员可执行此操作'
      });
    }

    // 验证参数
    if (!idsArray || !Array.isArray(idsArray) || idsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要删除的费用申请ID数组'
      });
    }

    // 限制一次最多删除100条
    if (idsArray.length > 100) {
      return res.status(400).json({
        success: false,
        message: '一次最多只能删除100条记录'
      });
    }

    // 检查申请是否存在
    const filters = [{ type: 'in', column: 'id', value: idsArray }];
    const expenseData = await select('expense_applications', '*', filters, idsArray.length, 0);
    
    if (!expenseData || expenseData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到要删除的费用申请'
      });
    }

    const foundIds = expenseData.map(expense => expense.id);
    const notFoundIds = idsArray.filter(id => !foundIds.includes(id));

    console.log('[批量删除] 找到的记录数:', foundIds.length);
    console.log('[批量删除] 未找到的记录数:', notFoundIds.length);

    // 删除关联的审批节点 - 使用循环删除（因为单个删除已验证可用）
    try {
      if (foundIds.length > 0) {
        console.log('[批量删除] 开始删除审批节点，IDs数量:', foundIds.length);
        const client = getSupabaseClient();
        let deletedNodesCount = 0;
        
        // 循环删除每个费用申请的审批节点
        for (const expenseId of foundIds) {
          try {
            const { data, error } = await client
              .from('expense_approval_nodes')
              .delete()
              .eq('expense_id', expenseId)
              .select();
            
            if (error) {
              console.error(`[批量删除] 删除审批节点失败 (expense_id: ${expenseId}):`, error.message);
            } else {
              deletedNodesCount += (data?.length || 0);
            }
          } catch (nodeError) {
            console.error(`[批量删除] 删除审批节点异常 (expense_id: ${expenseId}):`, nodeError.message);
          }
        }
        console.log(`[批量删除] 审批节点删除完成，共删除 ${deletedNodesCount} 条`);
      }
    } catch (nodeError) {
      console.error('[批量删除] 删除审批节点失败:', nodeError);
      console.error('[批量删除] 审批节点错误详情:', nodeError.message);
      // 继续执行，不中断删除流程
    }

    // 批量删除费用申请 - 使用循环删除（因为单个删除已验证可用）
    try {
      console.log('[批量删除] 开始删除费用申请，IDs数量:', foundIds.length);
      let deletedCount = 0;
      const failedIds = [];
      const actuallyDeletedIds = [];
      
      // 循环删除每个费用申请 - 使用与单个删除相同的逻辑
      for (const id of foundIds) {
        try {
          // 使用与单个删除相同的 deleteData 函数
          const filters = [{ type: 'eq', column: 'id', value: id }];
          await deleteData('expense_applications', filters);
          deletedCount++;
          actuallyDeletedIds.push(id);
          console.log(`[批量删除] 成功删除费用申请 (id: ${id})`);
        } catch (deleteError) {
          console.error(`[批量删除] 删除费用申请失败 (id: ${id}):`, deleteError.message);
          failedIds.push(id);
        }
      }
      
      console.log(`[批量删除] 费用申请删除完成，成功: ${deletedCount}/${foundIds.length}`);
      
      // 如果全部失败，抛出错误
      if (deletedCount === 0 && foundIds.length > 0) {
        throw new Error(`批量删除失败，所有记录都无法删除`);
      }
      
      // 记录操作日志（如果失败不影响删除结果）
      if (actuallyDeletedIds.length > 0) {
        try {
          await operationLogger.recordOperation(
            'expense_applications',
            'batch_delete',
            {
              expense_ids: actuallyDeletedIds,
              count: actuallyDeletedIds.length,
              deleted_by: req.user.id
            },
            req.user.id
          );
          console.log('[批量删除] 操作日志记录成功');
        } catch (logError) {
          console.error('[批量删除] 记录操作日志失败:', logError);
          // 不中断流程，删除已经成功
        }
      }
      
      // 构建返回消息
      let message = `成功删除 ${deletedCount} 条费用申请`;
      if (failedIds.length > 0) {
        message += `，${failedIds.length} 条删除失败`;
      }
      if (notFoundIds.length > 0) {
        message += `，${notFoundIds.length} 条未找到`;
      }

      res.json({
        success: true,
        message: message,
        deletedCount: deletedCount,
        failedCount: failedIds.length,
        notFoundCount: notFoundIds.length
      });
    } catch (deleteError) {
      console.error('[批量删除] 删除费用申请失败:', deleteError);
      console.error('[批量删除] 费用申请错误详情:', deleteError.message);
      console.error('[批量删除] 错误堆栈:', deleteError.stack);
      throw deleteError; // 重新抛出，因为这是关键步骤
    }
  } catch (error) {
    console.error('[批量删除] 批量删除费用申请失败:', error);
    console.error('[批量删除] 错误消息:', error.message);
    console.error('[批量删除] 错误堆栈:', error.stack);
    console.error('[批量删除] 完整错误对象:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // 返回详细的错误信息
    const errorResponse = {
      success: false,
      message: '批量删除费用申请失败',
      error: error.message || '未知错误'
    };
    
    // 如果是Supabase错误，添加更多详情
    if (error.code || error.details || error.hint) {
      errorResponse.details = {
        code: error.code,
        details: error.details,
        hint: error.hint
      };
    }
    
    // 开发环境返回堆栈信息
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
    }
    
    return res.status(500).json(errorResponse);
  }
});

// 获取费用申请详情（必须放在所有具体路由之后，避免路由冲突）
router.get('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    try {
      // 获取费用申请详情
      const expenseFilters = [{ type: 'eq', column: 'id', value: id }];
      const expenseList = await select('expense_applications', '*', expenseFilters, 1, 0);
      
      if (!expenseList || expenseList.length === 0) {
        return res.status(404).json({
          success: false,
          message: '费用申请不存在'
        });
      }
      
      const expense = expenseList[0];
      const activeExpenseIds = await getExpensesWithActiveApprovalNode([expense.id]);
      const displayStatus = resolveExpenseDisplayStatus(expense, activeExpenseIds);
      
      // 获取申请人信息
      const applicantFilters = [{ type: 'eq', column: 'id', value: expense.applicant_id }];
      const applicants = await select('users', 'id, name, email, department', applicantFilters, 1, 0);
      const applicant = applicants && applicants.length > 0 ? applicants[0] : null;
      
      // 转换字段名为驼峰命名法
      const formattedExpense = {
        id: expense.id,
        name: expense.name,
        amount: expense.amount,
        date: expense.expense_date || expense.date,
        mainCategoryId: expense.main_category_id,
        subCategoryId: expense.sub_category_id,
        status: displayStatus,
        description: expense.description,
        applicantId: expense.applicant_id,
        createdAt: expense.created_at,
        updatedAt: expense.updated_at,
        attachments: expense.attachments,
        paymentMethod: expense.payment_method,
        payeeName: expense.payee_name,
        accountName: expense.account_name,
        accountType: expense.account_type,
        // 申请人信息
        applicant: applicant ? {
          id: applicant.id,
          name: applicant.name,
          email: applicant.email,
          department: applicant.department
        } : null
      };
      
      res.json({
        success: true,
        data: formattedExpense,
        message: '获取费用申请详情成功'
      });
    } catch (error) {
      console.error('获取费用申请详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取费用申请详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;