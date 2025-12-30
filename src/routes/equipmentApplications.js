import express from 'express';
import { select, insert, update, deleteData, count } from '../config/supabase.js';
import { getSupabaseClient } from '../config/supabase.js';
// import { generateApprovalNodes, getNextApprover, getApprovalFlowByBusinessType } from '../utils/approvalFlow.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { v4 as uuidv4 } from 'uuid';
import { default as OperationLogger } from '../utils/operationLogger.js';

const router = express.Router();
const operationLogger = new OperationLogger();

// 获取直属部门审批用户（支持层级审批）- 递归实现
const getDepartmentApprovers = async (departmentId, hierarchical = false) => {
  try {
 
    
    const approvers = [];
    
    // 首先从角色组表中查找数据权限为department的角色
    const deptRoleFilters = [{ type: 'eq', column: 'data_permission', value: 'department' },
      { type: 'eq', column: 'status', value: true }
    ];
    const deptRoles = await select('role_group', 'role_id', deptRoleFilters);
    const deptRoleIds = deptRoles.map(role => role.role_id);
    
    if (deptRoleIds.length > 0) {
      // 查找属于这些角色且在当前部门的用户
      const deptUsers = await select('users', 'id, name, email, department', [
        { type: 'eq', column: 'department', value: departmentId },
        { type: 'in', column: 'roles', value: deptRoleIds }
      ], 100, 0);
      
      if (deptUsers && deptUsers.length > 0) {
        approvers.push(...deptUsers);
      }
    }
    
    // 如果没有department权限的用户，查找all权限的用户
    if (approvers.length === 0) {
      // 从角色组表中查找数据权限为all的角色
      const allRoleFilters = [{ type: 'eq', column: 'data_permission', value: 'all' },
        { type: 'eq', column: 'status', value: true }
      ];
      const allRoles = await select('role_group', 'role_id', allRoleFilters);
      const allRoleIds = allRoles.map(role => role.role_id);
      
      if (allRoleIds.length > 0) {
        // 查找属于这些角色且在当前部门的用户
        const allUsers = await select('users', 'id, name, email, department', [
          { type: 'eq', column: 'department', value: departmentId },
          { type: 'in', column: 'roles', value: allRoleIds }
        ], 100, 0);
        
        if (allUsers && allUsers.length > 0) {
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
      
      if (deptResult && deptResult.length > 0 && deptResult[0].parent_id) {
        // 递归查找上级部门的审批人
        const parentApprovers = await getDepartmentApprovers(
          deptResult[0].parent_id, 
          hierarchical
        );
        approvers.push(...parentApprovers);
      }
    }
    
    return approvers;
  } catch (error) {
    console.error('获取部门审批人失败:', error);
    return [];
  }
};

// 获取设备申请列表（分页）
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
    filters.push({ type: 'eq', column: 'applicant_id', value: currentUserId }); // 只返回当前用户的设备申请
    
    if (status && status !== 'all') {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    if (applicant_id) {
      // 注意：这里仍然允许按applicant_id过滤，但基础过滤已经限制了只能看自己的数据
      filters.push({ type: 'eq', column: 'applicant_id', value: applicant_id });
    }
    if (start_date) {
      filters.push({ type: 'gte', column: 'application_date', value: start_date });
    }
    if (end_date) {
      filters.push({ type: 'lte', column: 'application_date', value: end_date });
    }
    if (mainCategoryId) {
      filters.push({ type: 'eq', column: 'main_category_id', value: mainCategoryId });
    }
    if (subCategoryId) {
      filters.push({ type: 'eq', column: 'sub_category_id', value: subCategoryId });
    }

    // 排序条件
    const order = { column: 'created_at', ascending: false };

    try {
      // 查询设备申请表数据
      const data = await select('equipment_applications', '*', filters, pageSize, offset, order, orFilters);
      
      // 获取总数
      const totalCount = await count('equipment_applications', filters, orFilters);

      // 获取申请人信息
      const applicantIds = [...new Set(data.map(item => item.applicant_id))];
      let applicantMap = {};
      if (applicantIds.length > 0) {
        const applicantFilters = [{ type: 'in', column: 'id', value: applicantIds }];
        const applicants = await select('users', 'id, name, email, department', applicantFilters);
        applicantMap = applicants.reduce((map, applicant) => {
          map[applicant.id] = applicant;
          return map;
        }, {});
      }

      // 构建返回数据，转换字段名为驼峰命名法以匹配前端期望
      const result = data.map(equipment => ({
        ...equipment,
        // 转换字段名为驼峰命名法
        mainCategoryId: equipment.main_category_id,
        subCategoryId: equipment.sub_category_id,
        applicantId: equipment.applicant_id,
        applicantName: equipment.applicant_name || applicantMap[equipment.applicant_id]?.name || '',
        applicantEmail: applicantMap[equipment.applicant_id]?.email || '',
        applicantDepartmentId: equipment.applicant_department_id,
        applicationDate: equipment.application_date,
        createdAt: equipment.created_at,
        updatedAt: equipment.updated_at,
        // 申请人信息
        applicant: applicantMap[equipment.applicant_id] || { name: '未知', department: '未知' }
      }));

      res.json({
        success: true,
        data: result || [],
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取设备申请列表成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '获取设备申请列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建设备申请
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const {
      name,
      main_category_id,
      sub_category_id,
      quantity,
      description,
      application_date,
      urgency_level,
      expected_delivery_date,
      attachments = {}
    } = req.body;
    
    // 参数验证
    if (!name || !main_category_id || !quantity || !application_date) {
      return res.status(400).json({
        success: false,
        message: '缺少必填参数'
      });
    }
    
    // 验证申请数量
    if (isNaN(quantity) || parseInt(quantity) <= 0) {
      return res.status(400).json({
        success: false,
        message: '申请数量必须为正整数'
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
    
    const applicant_id = req.user.id;
    const now = new Date().toISOString();
    
    // 获取申请人信息
    const userFilters = [{ type: 'eq', column: 'id', value: applicant_id }];
    const userData = await select('users', 'name, email, department', userFilters, 1, 0);
    const applicant_name = userData && userData.length > 0 ? userData[0].name : '';
    const applicant_email = userData && userData.length > 0 ? userData[0].email : '';
    const applicant_department_id = userData && userData.length > 0 ? userData[0].department : '';
    
    // 创建设备申请
    const equipmentData = {
      name,
      main_category_id,
      sub_category_id,
      quantity: parseInt(quantity),
      description: description || '',
      application_date,
      urgency_level,
      expected_delivery_date,
      applicant_id,
      applicant_name,
      applicant_department_id,
      status: 'pending',
      created_at: now,
      updated_at: now,
      attachments: JSON.stringify(attachments)
    };
    
    const result = await insert('equipment_applications', equipmentData);
    const equipmentId = result[0].id;
    
    try {
      // 查询对应的审批流程配置
      let flowConfig = null;
      let nodes = [];
    
      
    
        // 如果没有指定流程配置ID或指定的流程不存在，使用默认流程
        const flowFilters = [
          { type: 'eq', column: 'flow_type', value: 'equipment' },
          { type: 'eq', column: 'status', value: 'active' }
        ];
        const flowConfigs = await select('approval_flow_config', '*', flowFilters, 1, 0);
        if (flowConfigs && flowConfigs.length > 0) {
          flowConfig = flowConfigs[0];
          nodes = flowConfig.nodes || [];
        }
      
      
      if (!flowConfig) {
        return res.status(201).json({
          success: true,
          data: {
            id: equipmentId,
            name,
            quantity: parseInt(quantity),
            status: 'pending',
            applicantName: applicant_name,
            applicantEmail: applicant_email,
            createdAt: now
          },
          message: '设备申请创建成功，但未找到对应的审批流程配置'
        });
      }

      // 生成审批节点记录
      const approvalNodes = [];
      let currentNodeIndex = 0;
      let nodeSortOrder = 1;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isCurrentNode = (i === currentNodeIndex);
        
        // 处理直属部门审批类型
        if (node.approvalType === 'dept_manager') {
          const hierarchical = node.hierarchical || false;
          const approvers = await getDepartmentApprovers(applicant_department_id, hierarchical);
          
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
              approvalNodes.push({
                equipment_id: equipmentId,
                node_name: `${node.name}`,
                user_id: approver.id,
                status: (isCurrentNode && isFirstNode) ? 'pending' : 'pending',
                comment: '',
                sort_order: nodeSortOrder++,
                is_current_node: (isCurrentNode && isFirstNode),
                approval_start_time: (isCurrentNode && isFirstNode) ? now : null,
                approval_end_time: null,
                approval_duration_seconds: null,
                created_at: now,
                updated_at: now
              });
            }
          } else {
            // 没有找到审批人，跳过当前节点
            continue;
          }
        } else {
          // 处理其他审批类型
          let userId = null;
          let shouldSkipNode = false;
          
          if (node.approvalType === 'auto') {
            // 自动审批，不需要用户ID
            userId = null;
          } else if (node.approver.type === 'role' && node.approver?.id) {
            
              const roleUsers = await select('users', 'id, name, email, department, roles', [
                { type: 'eq', column: 'roles', value: node.approver.id }
              ], 100, 0);
              
              if(roleUsers && roleUsers.length > 0){
                  userId =roleUsers[0].id;
                  node.name = `${node.name}`;
              }
            
            // 如果没找到合适的用户，跳过当前节点
            if (!userId) {
              shouldSkipNode = true;
            }
          } else if (node.approver.type === 'department' && node.approver?.id) {
            // 指定部门审批：从角色组表获取具有department或all数据权限的角色，然后查询具有相应角色的用户
            
            // 1. 先从角色组表获取具有department或all数据权限的角色
            const roleGroupFilters = [
              { type: 'in', column: 'data_permission', value: ['department', 'all'] }
            ];
            const roleGroups = await select('role_group', 'role_id, data_permission', roleGroupFilters);
            
            if (roleGroups && roleGroups.length > 0) {
              // 创建角色ID到数据权限的映射
              const rolePermissionMap = roleGroups.reduce((map, role) => {
                map[role.role_id] = role.data_permission;
                return map;
              }, {});
              
              // 2. 查询指定部门中具有这些角色的用户
              const deptUsers = await select('users', 'id, name, email, department, roles', [
                { type: 'eq', column: 'department', value: node.approver.id }
              ], 100, 0);
              
              if (deptUsers && deptUsers.length > 0) {
                // 3. 基于数据权限筛选用户
                // 优先选择数据权限为department的用户
                const deptPermissionUsers = deptUsers.filter(user => 
                  user.roles && rolePermissionMap[user.roles] === 'department'
                );
                
                if (deptPermissionUsers.length > 0) {
                  userId = deptPermissionUsers[0].id;
                  node.name = `${node.name} - ${deptPermissionUsers[0].name}`;
                } else {
                  // 如果没有department权限的用户，选择all权限的用户
                  const allPermissionUsers = deptUsers.filter(user => 
                    user.roles && rolePermissionMap[user.roles] === 'all'
                  );
                  userId = allPermissionUsers.length > 0 ? allPermissionUsers[0].id : null;
                   node.name = `${node.name}`;
                }
              }
            }
            
            // 如果在指定部门中没找到合适的用户，跳过当前节点
            if (!userId) {
              shouldSkipNode = true;
            }
          } else if (node.approver.type === 'user' && node.approver?.id) {
            // 指定用户
            userId = node.approver.id;
            node.name = `${node.name} - ${node.approver.name}`;
          }

          // 如果应该跳过当前节点，则跳过
          if (shouldSkipNode) {
            continue;
          }

          approvalNodes.push({
            equipment_id: equipmentId,
            node_name: node.name,
            user_id: userId,
           
            comment: '',
            sort_order: nodeSortOrder++,
           
            approval_end_time: null,
            approval_duration_seconds: null,
            created_at: now,
            updated_at: now
          });
        }
      }
       approvalNodes.forEach((element,index) => {
        if(index==0){
          element.is_current_node=true;
          element.status= 'pending';
          element.approval_start_time=new Date().toISOString();
          element.sort_order=index;
        }
        else{
          element.is_current_node=false;
          element.status='pending';
          element.sort_order=index;
        }
      });
      // 批量插入审批节点
      if (approvalNodes.length > 0) {
        await insert('equipment_approval_nodes', approvalNodes);
      }

    } catch (flowError) {
      console.error('创建审批流程失败:', flowError);
      // 如果审批流程创建失败，删除已创建的设备申请
      await deleteData('equipment_applications', [{ type: 'eq', column: 'id', value: equipmentId }]);
      
      return res.status(500).json({
        success: false,
        message: '创建审批流程失败',
        error: flowError.message
      });
    }
    
    // 记录创建设备申请操作日志
    await operationLogger.recordOperation('equipment_applications', 'create', equipmentId, '设备申请', {
      name: name,
      quantity: parseInt(quantity),
      main_category_id: main_category_id,
      sub_category_id: sub_category_id,
      urgency_level: urgency_level,
      applicant_name: applicant_name
    }, req.user?.id);

    res.status(201).json({
      success: true,
      data: {
        id: equipmentId,
        name,
        quantity: parseInt(quantity),
        status: 'pending',
        applicantName: applicant_name,
        applicantEmail: applicant_email,
        createdAt: now
      },
      message: '设备申请创建成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '创建设备申请失败',
      error: error.message
    });
  }
});

// 获取设备申请详情
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    
    try {
      // 获取设备申请详情
      const applicationFilters = [{ type: 'eq', column: 'id', value: id }];
      const applications = await select('equipment_applications', '*', applicationFilters);
      
      if (applications.length === 0) {
        return res.status(404).json({
          success: false,
          message: '设备申请不存在'
        });
      }
      
      const application = applications[0];
      
      // 获取审批节点
      const nodeFilters = [{ type: 'eq', column: 'equipment_id', value: id }];
      const nodeOrder = { column: 'sort_order', ascending: true };
      const nodes = await select('equipment_approval_nodes', '*', nodeFilters, null, 0, nodeOrder);
      
      // 获取用户信息
      const userIds = [...new Set(nodes.map(node => node.user_id).filter(id => id !== null))];
      const users = await select('users', 'id, name, department', 
        [{ type: 'in', column: 'id', value: userIds }]);
      
      const userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});
      
      // 格式化审批节点
      const formattedNodes = nodes.map(node => ({
        id: node.id,
        nodeOrder: node.sort_order,
        userId: node.user_id,
        username: userMap[node.user_id]?.name || '',
        realName: userMap[node.user_id]?.name || '',
        department: userMap[node.user_id]?.department || '',
        status: node.status,
        comment: node.comment,
        approvalStartTime: node.approval_start_time,
        approvalEndTime: node.approval_end_time,
        isCurrentNode: node.is_current_node,
        createdAt: node.created_at
      }));
      
      // 获取申请人信息
      const applicantFilters = [{ type: 'eq', column: 'id', value: application.applicant_id }];
      const applicants = await select('users', 'id, name, email, department', applicantFilters);
      const applicant = applicants.length > 0 ? applicants[0] : null;
      
      // 转换字段为驼峰命名
      const formattedApplication = {
        id: application.id,
        equipmentId: application.id,
        equipment: null,
        applicant: applicant ? {
          id: applicant.id,
          username: applicant.name,
          realName: applicant.name,
          department: applicant.department
        } : null,
        applicantId: application.applicant_id,
        purpose: application.description,
        quantity: application.quantity,
        estimatedCost: 0,
        actualCost: 0,
        status: application.status,
        urgency: application.urgency_level,
        comment: '',
        approvalNodes: formattedNodes,
        createdAt: application.created_at,
        updatedAt: application.updated_at
      };
      
      res.json({
        success: true,
        data: formattedApplication,
        message: '获取设备申请详情成功'
      });

    } catch (error) {
      console.error('获取设备申请详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取设备申请详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取设备申请审批节点信息
router.get('/:id/approval-nodes', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
   
    
    try {
      // 获取审批节点，按sort_order升序排列
      const nodeFilters = [{ type: 'eq', column: 'equipment_id', value: id }];
      const nodeOrder = { column: 'sort_order', ascending: true };
      const approvalNodes = await select('equipment_approval_nodes', '*', nodeFilters, null, 0, nodeOrder);
      
      if (!approvalNodes || approvalNodes.length === 0) {
        return res.json({
          success: true,
          data: [],
          message: '暂无审批节点信息'
        });
      }

      // 获取所有相关的用户ID
      const userIds = [...new Set(approvalNodes.map(node => node.user_id).filter(id => id !== null))];
      
      // 获取用户信息
      let userMap = {};
      if (userIds.length > 0) {
        const userFilters = [{ type: 'in', column: 'id', value: userIds }];
        const users = await select('users', 'id, name, department', userFilters);
        userMap = users.reduce((map, user) => {
          map[user.id] = user;
          return map;
        }, {});
      }

      // 构建返回数据，包含用户信息
      const nodesWithUserInfo = approvalNodes.map(node => ({
        ...node,
        user_info: node.user_id ? userMap[node.user_id] || null : null
      }));

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

// 取消设备申请
router.post('/:id/cancel', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // 检查申请是否存在且属于当前用户
    const filters = [{ type: 'eq', column: 'id', value: id }];
    const equipmentData = await select('equipment_applications', '*', filters, 1, 0);
    
    if (!equipmentData || equipmentData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '设备申请不存在'
      });
    }
    
    const equipment = equipmentData[0];
    
    if (equipment.applicant_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '只能取消自己的设备申请'
      });
    }
    
    if (equipment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '只能取消待审批的设备申请'
      });
    }
    
    // 更新申请状态
    const updateData = {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    };
    
    await update('equipment_applications', updateData, filters);
    
    // 更新相关的审批节点状态
    const nodeFilters = [{ type: 'eq', column: 'equipment_id', value: id }];
    const nodeUpdateData = {
      status: 'cancelled',
      comment:  '申请已取消',
      updated_at: new Date().toISOString()
    };
    
    await update('equipment_approval_nodes', nodeUpdateData, nodeFilters);
    
    // 记录操作日志
    await operationLogger.recordOperation('equipment_applications', 'cancel', {
      equipment_id: id,
      status: 'cancelled',
      applicant_id: equipment.applicant_id,
      name: equipment.name,
      quantity: equipment.quantity,
      urgency_level: equipment.urgency_level
    }, req.user?.id);
    
    res.json({
      success: true,
      data: {
        id,
        status: 'cancelled'
      },
      message: '设备申请已取消'
    });
  } catch (error) {
    console.error('取消设备申请失败:', error);
    res.status(500).json({
      success: false,
      message: '取消设备申请失败',
      error: error.message
    });
  }
});

// 获取待审批设备列表
router.get('/pending-approvals', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, pageSize = 10, mainCategoryId, subCategoryId } = req.query;
    const offset = (page - 1) * pageSize;

    try {
      // 查询当前用户需要审批的节点
      const nodeFilters = [
        { type: 'eq', column: 'user_id', value: userId },
        { type: 'in', column: 'status', value: ['pending', 'approving'] },
        { type: 'eq', column: 'is_current_node', value: true }
      ];
      
      const pendingNodes = await select('equipment_approval_nodes', '*', nodeFilters);
      
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
          message: '暂无待审批设备'
        });
      }

      // 获取对应的设备申请ID
      const equipmentIds = pendingNodes.map(node => node.equipment_id);
      
      // 查询设备申请详情
      const equipmentFilters = [{ type: 'in', column: 'id', value: equipmentIds }];
      
      // 添加主分类和子分类筛选条件
      if (mainCategoryId) {
        equipmentFilters.push({ type: 'eq', column: 'main_category_id', value: mainCategoryId });
      }
      if (subCategoryId) {
        equipmentFilters.push({ type: 'eq', column: 'sub_category_id', value: subCategoryId });
      }
      
      const order = { column: 'created_at', ascending: false };
      const equipmentList = await select('equipment_applications', '*', equipmentFilters, pageSize, offset, order);
      
      // 获取总数
      const totalCount = pendingNodes.length;

      // 获取申请人信息
      const applicantIds = [...new Set(equipmentList.map(eq => eq.applicant_id))];
      let applicantMap = {};
      if (applicantIds.length > 0) {
        const applicantFilters = [{ type: 'in', column: 'id', value: applicantIds }];
        const applicants = await select('users', 'id, name, department', applicantFilters);
        applicantMap = applicants.reduce((map, user) => {
          map[user.id] = user;
          return map;
        }, {});
      }

      // 构建返回数据，转换字段名为驼峰命名法以匹配前端期望
      const data = equipmentList.map(equipment => ({
        id: equipment.id,
        equipmentName: equipment.name,
        mainCategoryId: equipment.main_category_id,
        subCategoryId: equipment.sub_category_id,
        quantity: equipment.quantity,
        status: equipment.status,
        applicationReason: equipment.description,
        // 转换字段名为驼峰命名法
        applicantId: equipment.applicant_id,
        createdAt: equipment.application_date,
        updatedAt: equipment.updated_at,
        
        attachments: equipment.attachments || [],
        // 申请人信息
        applicant: applicantMap[equipment.applicant_id] || { name: '未知', department: '未知' },
        approvalNode: pendingNodes.find(node => node.equipment_id === equipment.id)
      }));

      res.json({
        success: true,
        data: data,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取待审批设备列表成功'
      });
    } catch (error) {
      console.error('获取待审批设备列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取待审批设备列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 审批设备申请（通过或拒绝）
router.post('/:id/approve', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { action, comment = '', attachments = [] } = req.body;

    // 验证审批动作
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: '无效的审批动作，只能是 approve 或 reject'
      });
    }

    // 首先验证设备申请是否存在
    const equipmentFilters = [{ type: 'eq', column: 'id', value: id }];
    const equipmentData = await select('equipment_applications', '*', equipmentFilters, 1, 0);
    
    if (!equipmentData || equipmentData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '设备申请不存在'
      });
    }

    const equipmentApplication = equipmentData[0];

    // 验证状态：只有待审批和审批中的申请可以审批
    if (!['pending', 'approving'].includes(equipmentApplication.status)) {
      return res.status(400).json({
        success: false,
        message: '当前状态不允许审批',
        current_status: equipmentApplication.status
      });
    }

    try {
      // 查询当前用户需要处理的审批节点
      const nodeFilters = [
        { type: 'eq', column: 'equipment_id', value: id },
        { type: 'eq', column: 'user_id', value: userId },
        { type: 'eq', column: 'is_current_node', value: true },
        { type: 'in', column: 'status', value: ['pending', 'approving'] }
      ];
      
      const currentNodes = await select('equipment_approval_nodes', '*', nodeFilters);
      
      if (!currentNodes || currentNodes.length === 0) {
        return res.status(403).json({
          success: false,
          message: '您无权审批此设备申请或该申请不在您的审批节点'
        });
      }

      const currentNode = currentNodes[0];
      const now = new Date().toISOString();
      
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

      // 更新当前节点状态
      const nodeUpdateData = {
        status: action === 'approve' ? 'approved' : 'rejected',
        comment: comment,
        attachments: JSON.stringify(attachments),
        approval_end_time: now,
        is_current_node: false,
        approval_duration_seconds: durationSeconds,
        updated_at: now
      };

      await update('equipment_approval_nodes', nodeUpdateData, [{ type: 'eq', column: 'id', value: currentNode.id }]);

      // 确定设备申请的新状态
      let newEquipmentStatus = equipmentApplication.status;
      let message = '';

      if (action === 'reject') {
        // 如果拒绝，直接更新设备申请状态为已拒绝
        newEquipmentStatus = 'rejected';
        message = '设备申请已拒绝';
        
        // 更新所有后续待处理节点为取消
        const subsequentFilters = [
          { type: 'eq', column: 'equipment_id', value: id },
          { type: 'in', column: 'status', value: ['pending', 'approving'] }
        ];
        
        await update('equipment_approval_nodes', {
          status: 'cancelled',
          comment: '前置节点已拒绝，流程终止',
          updated_at: now
        }, subsequentFilters);
        
      } else {
        // 如果通过，检查是否还有后续节点
        const nextNodeFilters = [
          { type: 'eq', column: 'equipment_id', value: id },
          { type: 'eq', column: 'status', value: 'pending' }
        ];
        
        const remainingNodes = await select('equipment_approval_nodes', '*', nextNodeFilters);
        
        if (remainingNodes.length === 0) {
          // 没有后续节点，流程完成
          newEquipmentStatus = 'approved';
          message = '设备申请审批完成，已通过';
        } else {
          // 还有后续节点，找到下一个节点并激活
          const nextNode = remainingNodes.sort((a, b) => a.sort_order - b.sort_order)[0];
          
          // 更新下一个节点为当前节点
          await update('equipment_approval_nodes', {
            is_current_node: true,
            approval_start_time: now,
            status: 'approving',
            updated_at: now
          }, [{ type: 'eq', column: 'id', value: nextNode.id }]);
          
          newEquipmentStatus = 'approving';
          message = '审批已通过，进入下一节点';
        }
      }

      // 更新设备申请状态
      await update('equipment_applications', {
        status: newEquipmentStatus,
        updated_at: now
      }, [{ type: 'eq', column: 'id', value: id }]);

      // 记录操作日志
      await operationLogger.recordOperation('equipment_applications', action === 'approve' ? 'approve' : 'reject', {
        equipment_id: id,
        node_id: currentNode.id,
        action: action,
        new_status: newEquipmentStatus,
        comment: comment,
        approval_time: now,
        duration_seconds: durationSeconds,
        equipment_name: equipmentApplication.name,
        applicant_id: equipmentApplication.applicant_id,
        urgency_level: equipmentApplication.urgency_level
      }, req.user?.id);

      res.json({
        success: true,
        data: {
          equipment_id: id,
          node_id: currentNode.id,
          action: action,
          new_status: newEquipmentStatus,
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

// 获取设备审批统计信息
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
      
      const pendingCount = await count('equipment_approval_nodes', pendingFilters);

      // 获取用户已审批数量（最近30天）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const approvedFilters = [
        { type: 'eq', column: 'user_id', value: userId },
        { type: 'in', column: 'status', value: ['approved', 'rejected'] },
        { type: 'gte', column: 'approval_end_time', value: thirtyDaysAgo.toISOString() }
      ];
      
      const approvedCount = await count('equipment_approval_nodes', approvedFilters);

      // 获取用户审批的平均耗时（最近30天）
      const client = getSupabaseClient();
      const { data: avgData, error: avgError } = await client
        .from('equipment_approval_nodes')
        .select('approval_duration_seconds')
        .eq('user_id', userId)
        .in('status', ['approved', 'rejected'])
        .gte('approval_end_time', thirtyDaysAgo.toISOString())
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
        message: '获取设备审批统计信息成功'
      });

    } catch (error) {
      console.error('获取设备审批统计失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取设备审批统计失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取我的设备审批记录
router.get('/my-approvals', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, pageSize = 10, status, start_date, end_date, mainCategoryId, subCategoryId } = req.query;
    const offset = (page - 1) * pageSize;

    try {
      // 构建查询条件
      const nodeFilters = [
        { type: 'eq', column: 'user_id', value: userId },
        { type: 'in', column: 'status', value: ['approved', 'rejected'] }
      ];

      // 添加时间范围筛选
      if (start_date) {
        nodeFilters.push({ type: 'gte', column: 'approval_end_time', value: start_date });
      }
      if (end_date) {
        nodeFilters.push({ type: 'lte', column: 'approval_end_time', value: end_date });
      }

      // 如果指定了状态筛选
      if (status && ['approved', 'rejected'].includes(status)) {
        nodeFilters.push({ type: 'eq', column: 'status', value: status });
      }

      // 查询用户的审批节点记录
      const nodeOrder = { column: 'approval_end_time', ascending: false };
      const approvalNodes = await select('equipment_approval_nodes', '*', nodeFilters, pageSize, offset, nodeOrder);
      
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

      // 获取对应的设备申请ID
      const equipmentIds = [...new Set(approvalNodes.map(node => node.equipment_id))];
      
      // 查询设备申请详情
      const equipmentFilters = [{ type: 'in', column: 'id', value: equipmentIds }];
      
      // 添加主分类和子分类筛选条件
      if (mainCategoryId) {
        equipmentFilters.push({ type: 'eq', column: 'main_category_id', value: mainCategoryId });
      }
      if (subCategoryId) {
        equipmentFilters.push({ type: 'eq', column: 'sub_category_id', value: subCategoryId });
      }
      
      const equipmentList = await select('equipment_applications', '*', equipmentFilters);
      
      // 获取申请人信息
      const applicantIds = [...new Set(equipmentList.map(eq => eq.applicant_id))];
      let applicantMap = {};
      if (applicantIds.length > 0) {
        const applicantFilters = [{ type: 'in', column: 'id', value: applicantIds }];
        const applicants = await select('users', 'id, name, department', applicantFilters);
        applicantMap = applicants.reduce((map, applicant) => {
          map[applicant.id] = applicant;
          return map;
        }, {});
      }

      // 获取总数
      const totalCount = await count('equipment_approval_nodes', nodeFilters);

      // 构建返回数据，转换为前端期望的扁平结构
      const data = approvalNodes.map(node => {
        const equipment = equipmentList.find(eq => eq.id === node.equipment_id);
        const applicant = applicantMap[equipment?.applicant_id];
        
        if (!equipment) return null;
        
        // 转换为前端期望的格式（扁平结构，驼峰命名）
        return {
          id: equipment.id,
          equipmentName: equipment.name,
          mainCategoryId: equipment.main_category_id,
          subCategoryId: equipment.sub_category_id,
          quantity: equipment.quantity,
          status: equipment.status,
          applicationReason: equipment.description,
          // 转换字段名为驼峰命名法
          applicantId: equipment.applicant_id,
          createdAt: equipment.application_date,
          updatedAt: equipment.updated_at,
          attachments: equipment.attachments,
          // 申请人信息
          applicant: applicant || { name: '未知', department: '未知' },
          // 审批节点信息（简化版）
          approvalNode: {
            id: node.id,
            nodeName: node.node_name,
            status: node.status,
            comment: node.comment,
            approvalTime: node.approval_end_time,
            approvalDuration: node.approval_duration_seconds,
            updatedAt: node.updated_at
          }
        };
      }).filter(item => item !== null); // 过滤掉没有对应设备申请的记录

      res.json({
        success: true,
        data: data,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取我的设备审批记录成功'
      });

    } catch (error) {
      console.error('获取我的设备审批记录失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取我的设备审批记录失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});







export default router;