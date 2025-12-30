import express from 'express';
import { select, count, getSupabaseClient } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

// 递归获取部门及其所有子部门ID的函数
async function getDepartmentAndChildren(deptId, client) {
  const deptIds = [];
  
  // 递归获取所有子部门（包括自身）
  async function getChildren(parentId) {
    // 首先添加当前部门ID
    if (!deptIds.includes(parentId)) {
      deptIds.push(parentId);
    }
    
    const { data: children, error } = await client
      .from('department')
      .select('id')
      .eq('parent_id', parentId);
    
    if (error) {
      console.error('获取子部门失败:', error);
      return;
    }
    
    if (children && children.length > 0) {
      for (const child of children) {
        await getChildren(child.id); // 递归获取子部门的子部门
      }
    }
  }
  
  await getChildren(deptId);
  return deptIds;
}

const router = express.Router();

// 获取登录日志列表（基于数据权限）
router.get('/login/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { 
      page = 1, 
      pageSize = 10, 
      username, 
      loginResult, 
      loginType, 
      startDate, 
      endDate, 
      sortBy = 'login_time', 
      sortOrder = 'desc' 
    } = req.query;
    const offset = (page - 1) * pageSize;

    // 获取当前用户信息
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未获取到用户信息'
      });
    }

    // 获取用户详细信息（包括部门）
    const userFilters = [{ type: 'eq', column: 'id', value: userId }];
    const userData = await select('users', 'id, username, name, department, roles', userFilters, 1, 0);
    
    if (!userData || userData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentUser = userData[0];
    
    // 获取用户角色的数据权限
    let dataPermission = 'personal'; // 默认个人权限
    if (currentUser.roles) {
      const roleFilters = [{ type: 'eq', column: 'role_id', value: currentUser.roles }];
      const roleData = await select('role_group', 'role_id, data_permission', roleFilters, 1, 0);
      if (roleData && roleData.length > 0 && roleData[0].data_permission) {
        dataPermission = roleData[0].data_permission;
      }
    }

    // 构建过滤条件
    const filters = [];
    
    // 根据数据权限添加筛选条件
    if (dataPermission === 'personal') {
      // 个人权限：只能看到自己的登录日志
      filters.push({ type: 'eq', column: 'user_id', value: userId });
    } else if (dataPermission === 'department') {
      // 部门权限：查看当前部门和所有子部门的数据
      if (currentUser.department) {
        try {
          const client = getSupabaseClient();
          
          // 获取当前用户的部门信息
          const deptFilters = [{ type: 'eq', column: 'id', value: currentUser.department }];
          const deptData = await select('department', 'id, name', deptFilters, 1, 0);
          
          if (deptData && deptData.length > 0) {
            // 调用递归函数获取当前部门及其所有子部门ID
            const allDeptIds = await getDepartmentAndChildren(currentUser.department, client);
            
            // 获取这些部门下的所有用户ID
            if (allDeptIds.length > 0) {
              const userFilters = [{ type: 'in', column: 'department', value: allDeptIds }];
              const deptUsers = await select('users', 'id', userFilters);
              const userIds = deptUsers.map(user => user.id);
              
              if (userIds.length > 0) {
                filters.push({ type: 'in', column: 'user_id', value: userIds });
              } else {
                // 如果没有找到用户，只能看到自己的数据
                filters.push({ type: 'eq', column: 'user_id', value: userId });
              }
            }
          } else {
            // 如果没有部门信息，只能看到自己的数据
            filters.push({ type: 'eq', column: 'user_id', value: userId });
          }
          
        } catch (error) {
          console.error('获取部门树失败:', error);
          // 如果获取子部门失败，只使用当前部门
          const userFilters = [{ type: 'eq', column: 'department', value: currentUser.department }];
          const deptUsers = await select('users', 'id', userFilters);
          const userIds = deptUsers.map(user => user.id);
          
          if (userIds.length > 0) {
            filters.push({ type: 'in', column: 'user_id', value: userIds });
          } else {
            filters.push({ type: 'eq', column: 'user_id', value: userId });
          }
        }
      } else {
        // 如果没有部门，只能看到自己的数据
        filters.push({ type: 'eq', column: 'user_id', value: userId });
      }
    }
    // dataPermission === 'all' 时，不添加任何限制条件，查看所有数据

    // 添加搜索条件
    if (username) {
      filters.push({ type: 'ilike', column: 'username', value: `%${username}%` });
    }
    
    if (loginResult) {
      filters.push({ type: 'eq', column: 'login_result', value: loginResult });
    }
    
    if (loginType) {
      filters.push({ type: 'eq', column: 'login_type', value: loginType });
    }
    
    if (startDate) {
      filters.push({ type: 'gte', column: 'login_time', value: startDate });
    }
    
    if (endDate) {
      filters.push({ type: 'lte', column: 'login_time', value: endDate });
    }

    // 排序条件
    const order = { 
      column: ['login_time', 'username', 'login_result', 'login_type', 'created_at'].includes(sortBy) ? sortBy : 'login_time', 
      ascending: sortOrder.toLowerCase() === 'asc' 
    };

    try {
      // 查询登录日志列表
      const data = await select(
        'login_logs', 
        'id, user_id, username, login_type, login_result, fail_reason, device_info, user_agent, ip_address, ip_location, login_time, created_at', 
        filters, 
        pageSize, 
        offset, 
        order
      );
      
      // 获取总数
      const totalCount = await count('login_logs', filters);
      
      // 格式化返回数据
      const formattedData = (data || []).map(log => ({
        id: log.id,
        user_id: log.user_id,
        username: log.username,
        login_type: log.login_type,
        login_result: log.login_result,
        fail_reason: log.fail_reason,
        device_info: log.device_info,
        user_agent: log.user_agent,
        ip_address: log.ip_address,
        ip_location: log.ip_location,
        login_time: log.login_time,
        created_at: log.created_at
      }));
      
      res.json({
        success: true,
        data: formattedData,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        permissions: {
          data_permission: dataPermission,
          department_id: currentUser.department
        },
        message: '获取登录日志列表成功'
      });
      
    } catch (error) {
      console.error('获取登录日志列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取登录日志列表失败',
        error: error.message
      });
    }
    
  } catch (error) {
    next(error);
  }
});

// 获取登录日志详情
router.get('/login/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 获取当前用户信息
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未获取到用户信息'
      });
    }

    // 获取用户详细信息（包括部门）
    const userFilters = [{ type: 'eq', column: 'id', value: userId }];
    const userData = await select('users', 'id, username, name, department, roles', userFilters, 1, 0);
    
    if (!userData || userData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentUser = userData[0];
    
    // 获取用户角色的数据权限
    let dataPermission = 'personal'; // 默认个人权限
    if (currentUser.roles) {
      const roleFilters = [{ type: 'eq', column: 'role_id', value: currentUser.roles }];
      const roleData = await select('role_group', 'role_id, data_permission', roleFilters, 1, 0);
      if (roleData && roleData.length > 0 && roleData[0].data_permission) {
        dataPermission = roleData[0].data_permission;
      }
    }

    // 查询日志详情
    const logFilters = [{ type: 'eq', column: 'id', value: id }];
    const logData = await select(
      'login_logs', 
      'id, user_id, username, login_type, login_result, fail_reason, device_info, user_agent, ip_address, ip_location, login_time, created_at', 
      logFilters, 
      1, 
      0
    );

    if (!logData || logData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '登录日志不存在'
      });
    }

    const log = logData[0];

    // 根据数据权限验证访问权限
    if (dataPermission === 'personal' && log.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '无权查看其他用户的登录日志'
      });
    } else if (dataPermission === 'department') {
      if (currentUser.department && log.user_id) {
        // 检查该日志用户是否在当前用户的部门范围内
        const client = getSupabaseClient();
        const logUserFilters = [{ type: 'eq', column: 'id', value: log.user_id }];
        const logUserData = await select('users', 'id, department', logUserFilters, 1, 0);
        
        if (logUserData && logUserData.length > 0) {
          const logUserDept = logUserData[0].department;
          const allDeptIds = await getDepartmentAndChildren(currentUser.department, client);
          
          if (!allDeptIds.includes(logUserDept)) {
            return res.status(403).json({
              success: false,
              message: '无权查看其他部门的登录日志'
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            message: '无权查看该登录日志'
          });
        }
      } else if (log.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: '无权查看其他用户的登录日志'
        });
      }
    }
    // dataPermission === 'all' 时，可以查看所有日志

    // 格式化返回数据
    const responseData = {
      id: log.id,
      user_id: log.user_id,
      username: log.username,
      login_type: log.login_type,
      login_result: log.login_result,
      fail_reason: log.fail_reason,
      device_info: log.device_info,
      user_agent: log.user_agent,
      ip_address: log.ip_address,
      ip_location: log.ip_location,
      login_time: log.login_time,
      created_at: log.created_at
    };

    res.json({
      success: true,
      data: responseData,
      message: '获取登录日志详情成功'
    });
    
  } catch (error) {
    next(error);
  }
});

// 获取操作日志列表（基于数据权限）
router.get('/operation/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { 
      page = 1, 
      pageSize = 10, 
      username, 
      operationType, 
      operationResult, 
      targetType,
      startDate, 
      endDate, 
      sortBy = 'operation_time', 
      sortOrder = 'desc' 
    } = req.query;
    const offset = (page - 1) * pageSize;

    // 获取当前用户信息
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未获取到用户信息'
      });
    }

    // 获取用户详细信息（包括部门）
    const userFilters = [{ type: 'eq', column: 'id', value: userId }];
    const userData = await select('users', 'id, username, name, department, roles', userFilters, 1, 0);
    
    if (!userData || userData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentUser = userData[0];
    
    // 获取用户角色的数据权限
    let dataPermission = 'personal'; // 默认个人权限
    if (currentUser.roles) {
      const roleFilters = [{ type: 'eq', column: 'role_id', value: currentUser.roles }];
      const roleData = await select('role_group', 'role_id, data_permission', roleFilters, 1, 0);
      if (roleData && roleData.length > 0 && roleData[0].data_permission) {
        dataPermission = roleData[0].data_permission;
      }
    }

    // 构建过滤条件
    const filters = [];
    
    // 根据数据权限添加筛选条件
    if (dataPermission === 'personal') {
      // 个人权限：只能看到自己的操作日志
      filters.push({ type: 'eq', column: 'user_id', value: userId });
    } else if (dataPermission === 'department') {
      // 部门权限：查看当前部门和所有子部门的数据
      if (currentUser.department) {
        try {
          const client = getSupabaseClient();
          
          // 获取当前用户的部门信息
          const deptFilters = [{ type: 'eq', column: 'id', value: currentUser.department }];
          const deptData = await select('department', 'id, name', deptFilters, 1, 0);
          
          if (deptData && deptData.length > 0) {
            // 调用递归函数获取当前部门及其所有子部门ID
            const allDeptIds = await getDepartmentAndChildren(currentUser.department, client);
            
            // 获取这些部门下的所有用户ID
            if (allDeptIds.length > 0) {
              const userFilters = [{ type: 'in', column: 'department', value: allDeptIds }];
              const deptUsers = await select('users', 'id', userFilters);
              const userIds = deptUsers.map(user => user.id);
              
              if (userIds.length > 0) {
                filters.push({ type: 'in', column: 'user_id', value: userIds });
              } else {
                // 如果没有找到用户，只能看到自己的数据
                filters.push({ type: 'eq', column: 'user_id', value: userId });
              }
            }
          } else {
            // 如果没有部门信息，只能看到自己的数据
            filters.push({ type: 'eq', column: 'user_id', value: userId });
          }
          
        } catch (error) {
          console.error('获取部门树失败:', error);
          // 如果获取子部门失败，只使用当前部门
          const userFilters = [{ type: 'eq', column: 'department', value: currentUser.department }];
          const deptUsers = await select('users', 'id', userFilters);
          const userIds = deptUsers.map(user => user.id);
          
          if (userIds.length > 0) {
            filters.push({ type: 'in', column: 'user_id', value: userIds });
          } else {
            filters.push({ type: 'eq', column: 'user_id', value: userId });
          }
        }
      } else {
        // 如果没有部门，只能看到自己的数据
        filters.push({ type: 'eq', column: 'user_id', value: userId });
      }
    }
    // dataPermission === 'all' 时，不添加任何限制条件，查看所有数据

    // 添加搜索条件
    if (username) {
      filters.push({ type: 'ilike', column: 'username', value: `%${username}%` });
    }
    
    if (operationType) {
      filters.push({ type: 'eq', column: 'operation_type', value: operationType });
    }
    
    if (operationResult) {
      filters.push({ type: 'eq', column: 'operation_result', value: operationResult });
    }
    
    if (targetType) {
      filters.push({ type: 'eq', column: 'target_type', value: targetType });
    }
    
    if (startDate) {
      filters.push({ type: 'gte', column: 'operation_time', value: startDate });
    }
    
    if (endDate) {
      filters.push({ type: 'lte', column: 'operation_time', value: endDate });
    }

    // 排序条件
    const order = { 
      column: ['operation_time', 'username', 'operation_type', 'operation_result', 'target_type', 'created_at'].includes(sortBy) ? sortBy : 'operation_time', 
      ascending: sortOrder.toLowerCase() === 'asc' 
    };

    try {
      // 查询操作日志列表
      const data = await select(
        'operation_logs', 
        'id, user_id, username, operation_type, operation_name, operation_result, fail_reason, target_type, target_id, target_name, old_data, new_data, changed_fields, request_method, request_url, request_params, device_info, user_agent, ip_address, ip_location, execution_time_ms, memory_usage_mb, operation_time, created_at', 
        filters, 
        pageSize, 
        offset, 
        order
      );
      
      // 获取总数
      const totalCount = await count('operation_logs', filters);
      
      // 格式化返回数据
      const formattedData = (data || []).map(log => ({
        id: log.id,
        user_id: log.user_id,
        username: log.username,
        operation_type: log.operation_type,
        operation_name: log.operation_name,
        operation_result: log.operation_result,
        fail_reason: log.fail_reason,
        target_type: log.target_type,
        target_id: log.target_id,
        target_name: log.target_name,
        old_data: log.old_data,
        new_data: log.new_data,
        changed_fields: log.changed_fields,
        request_method: log.request_method,
        request_url: log.request_url,
        request_params: log.request_params,
        device_info: log.device_info,
        user_agent: log.user_agent,
        ip_address: log.ip_address,
        ip_location: log.ip_location,
        execution_time_ms: log.execution_time_ms,
        memory_usage_mb: log.memory_usage_mb,
        operation_time: log.operation_time,
        created_at: log.created_at
      }));
      
      res.json({
        success: true,
        data: formattedData,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        permissions: {
          data_permission: dataPermission,
          department_id: currentUser.department
        },
        message: '获取操作日志列表成功'
      });
      
    } catch (error) {
      console.error('获取操作日志列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取操作日志列表失败',
        error: error.message
      });
    }
    
  } catch (error) {
    next(error);
  }
});

// 获取操作日志详情
router.get('/operation/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 获取当前用户信息
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未获取到用户信息'
      });
    }

    // 获取用户详细信息（包括部门）
    const userFilters = [{ type: 'eq', column: 'id', value: userId }];
    const userData = await select('users', 'id, username, name, department, roles', userFilters, 1, 0);
    
    if (!userData || userData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentUser = userData[0];
    
    // 获取用户角色的数据权限
    let dataPermission = 'personal'; // 默认个人权限
    if (currentUser.roles) {
      const roleFilters = [{ type: 'eq', column: 'role_id', value: currentUser.roles }];
      const roleData = await select('role_group', 'role_id, data_permission', roleFilters, 1, 0);
      if (roleData && roleData.length > 0 && roleData[0].data_permission) {
        dataPermission = roleData[0].data_permission;
      }
    }

    // 查询日志详情
    const logFilters = [{ type: 'eq', column: 'id', value: id }];
    const logData = await select(
      'operation_logs', 
      'id, user_id, username, operation_type, operation_name, operation_result, fail_reason, target_type, target_id, target_name, old_data, new_data, changed_fields, request_method, request_url, request_params, device_info, user_agent, ip_address, ip_location, execution_time_ms, memory_usage_mb, operation_time, created_at', 
      logFilters, 
      1, 
      0
    );

    if (!logData || logData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '操作日志不存在'
      });
    }

    const log = logData[0];

    // 根据数据权限验证访问权限
    if (dataPermission === 'personal' && log.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '无权查看其他用户的操作日志'
      });
    } else if (dataPermission === 'department') {
      if (currentUser.department && log.user_id) {
        // 检查该日志用户是否在当前用户的部门范围内
        const client = getSupabaseClient();
        const logUserFilters = [{ type: 'eq', column: 'id', value: log.user_id }];
        const logUserData = await select('users', 'id, department', logUserFilters, 1, 0);
        
        if (logUserData && logUserData.length > 0) {
          const logUserDept = logUserData[0].department;
          const allDeptIds = await getDepartmentAndChildren(currentUser.department, client);
          
          if (!allDeptIds.includes(logUserDept)) {
            return res.status(403).json({
              success: false,
              message: '无权查看其他部门的操作日志'
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            message: '无权查看该操作日志'
          });
        }
      } else if (log.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: '无权查看其他用户的操作日志'
        });
      }
    }
    // dataPermission === 'all' 时，可以查看所有日志

    // 格式化返回数据
    const responseData = {
      id: log.id,
      user_id: log.user_id,
      username: log.username,
      operation_type: log.operation_type,
      operation_name: log.operation_name,
      operation_result: log.operation_result,
      fail_reason: log.fail_reason,
      target_type: log.target_type,
      target_id: log.target_id,
      target_name: log.target_name,
      old_data: log.old_data,
      new_data: log.new_data,
      changed_fields: log.changed_fields,
      request_method: log.request_method,
      request_url: log.request_url,
      request_params: log.request_params,
      device_info: log.device_info,
      user_agent: log.user_agent,
      ip_address: log.ip_address,
      ip_location: log.ip_location,
      execution_time_ms: log.execution_time_ms,
      memory_usage_mb: log.memory_usage_mb,
      operation_time: log.operation_time,
      created_at: log.created_at
    };

    res.json({
      success: true,
      data: responseData,
      message: '获取操作日志详情成功'
    });
    
  } catch (error) {
    next(error);
  }
});

export default router;