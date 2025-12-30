import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';

const operationLogger = new OperationLogger();

const router = express.Router();

// 获取权限组列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword = '', status } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'role_code', value: keyword },
        { type: 'ilike', column: 'role_name', value: keyword },
        { type: 'ilike', column: 'remarks', value: keyword }
      );
    }

    // 构建AND过滤条件
    const filters = [];
    if (status !== undefined && status !== '') {
      filters.push({ type: 'eq', column: 'status', value: status === 'true' });
    }

    // 排序条件 - 使用role_id字段排序，因为create_at字段可能不存在
    const order = { column: 'role_id', ascending: false };

    try {
      // 使用封装的select函数查询数据
      const data = await select('role_group', '*', filters, pageSize, offset, order, orFilters);
      
      // 获取总数
      const totalCount = await count('role_group', filters, orFilters);

      res.json({
        success: true,
        data: data || [],
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取权限组列表成功'
      });
    } catch (error) {
      console.error('获取权限组列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取权限组列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取权限组下拉选项（用于选择）
router.get('/options', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 只获取启用的权限组
    const filters = [{ type: 'eq', column: 'status', value: true }];
    // 排序条件
    const order = { column: 'role_name', ascending: true };
    
    try {
      const data = await select('role_group', 'role_id, role_code, role_name', filters, 1000, 0, order);
      
      res.json({
        success: true,
        data: data || [],
        message: '获取权限组选项成功'
      });
    } catch (error) {
      console.error('获取权限组选项失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取权限组选项失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取单个权限组详情
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'role_id', value: id }];
    
    try {
      const roleGroupData = await select('role_group', '*', filters, 1, 0);
      
      if (!roleGroupData || roleGroupData.length === 0) {
        return res.status(404).json({
          success: false,
          message: '权限组不存在'
        });
      }
      
      const roleGroup = roleGroupData[0];

      res.json({
        success: true,
        data: roleGroup,
        message: '获取权限组详情成功'
      });
    } catch (error) {
      console.error('获取权限组详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取权限组详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建权限组
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { role_code, role_name, permission, remarks, status = true,data_permission } = req.body;

    // 检查权限组代码是否已存在
    const filters = [{ type: 'eq', column: 'role_code', value: role_code }];
    
    try {
      const existingRoleGroup = await select('role_group', 'role_id', filters, 1, 0);
      
      if (existingRoleGroup && existingRoleGroup.length > 0) {
        return res.status(409).json({
          success: false,
          message: '权限组代码已存在'
        });
      }
    } catch (error) {
      console.error('检查权限组失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查权限组失败',
        error: error.message
      });
    }

    // 创建权限组
    const roleGroupData = {
      role_code,
      role_name,
      permission: permission || {},
      remarks: remarks || '',
      status: status,
      data_permission: data_permission
    };

    try {
      const data = await insert('role_group', roleGroupData);
      
      // 记录操作日志
      await operationLogger.recordOperation(
        'role_group',
        'create',
        {
          role_id: data[0].role_id,
          role_code: data[0].role_code,
          role_name: data[0].role_name,
          status: data[0].status,
          created_by: req.user.id
        },
        req.user.id
      );
      
      res.status(201).json({
        success: true,
        data: data[0],
        message: '创建权限组成功'
      });
    } catch (error) {
      console.error('创建权限组失败:', error);
      return res.status(500).json({
        success: false,
        message: '创建权限组失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新权限组
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role_code, role_name, permission, remarks, status,data_permission } = req.body;

    // 检查权限组是否存在并获取详细信息
    const filters = [{ type: 'eq', column: 'role_id', value: id }];
    let roleGroupToDelete;
    
    try {
      const existingRoleGroup = await select('role_group', '*', filters, 1, 0);
      
      if (!existingRoleGroup || existingRoleGroup.length === 0) {
        return res.status(404).json({
          success: false,
          message: '权限组不存在'
        });
      }
      
      roleGroupToDelete = existingRoleGroup[0];
    } catch (error) {
      console.error('检查权限组失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查权限组失败',
        error: error.message
      });
    }

    // 检查权限组代码是否已存在（排除当前权限组）
    if (role_code) {
      const codeFilters = [
        { type: 'eq', column: 'role_code', value: role_code },
        { type: 'neq', column: 'role_id', value: id }
      ];
      
      try {
        const existingCode = await select('role_group', 'role_id', codeFilters, 1, 0);
        
        if (existingCode && existingCode.length > 0) {
          return res.status(409).json({
            success: false,
            message: '权限组代码已存在'
          });
        }
      } catch (error) {
        console.error('检查权限组代码失败:', error);
        return res.status(500).json({
          success: false,
          message: '检查权限组代码失败',
          error: error.message
        });
      }
    }

    // 更新权限组信息
    const updateData = {};
    if (role_code !== undefined) updateData.role_code = role_code;
    if (role_name !== undefined) updateData.role_name = role_name;
    if (permission !== undefined) updateData.permission = permission;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (status !== undefined) updateData.status = status;
    if (data_permission !== undefined) updateData.data_permission = data_permission;

    try {
      const data = await update('role_group', updateData, filters);
      
      // 记录操作日志
      await operationLogger.recordOperation(
        'role_group',
        'update',
        {
          role_id: id,
          role_code: data[0].role_code,
          role_name: data[0].role_name,
          status: data[0].status,
          updated_by: req.user.id
        },
        req.user.id
      );
      
      res.json({
        success: true,
        data: data[0],
        message: '更新权限组成功'
      });
    } catch (error) {
      console.error('更新权限组失败:', error);
      return res.status(500).json({
        success: false,
        message: '更新权限组失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 删除权限组
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查权限组是否存在
    const filters = [{ type: 'eq', column: 'role_id', value: id }];
    
    try {
      const existingRoleGroup = await select('role_group', 'role_id', filters, 1, 0);
      
      if (!existingRoleGroup || existingRoleGroup.length === 0) {
        return res.status(404).json({
          success: false,
          message: '权限组不存在'
        });
      }
    } catch (error) {
      console.error('检查权限组失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查权限组失败',
        error: error.message
      });
    }

    // 检查是否有用户正在使用此权限组
    const userFilters = [{ type: 'eq', column: 'roles', value: id }];
    
    try {
      const usersWithRole = await select('users', 'id', userFilters, 1, 0);
      
      if (usersWithRole && usersWithRole.length > 0) {
        return res.status(409).json({
          success: false,
          message: '该权限组正在被用户使用，无法删除'
        });
      }
    } catch (error) {
      console.error('检查用户使用情况失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查用户使用情况失败',
        error: error.message
      });
    }

    try {
      await deleteData('role_group', filters);
      
      // 记录操作日志
      await operationLogger.recordOperation(
        'role_group',
        'delete',
        {
          role_id: id,
          role_code: roleGroupToDelete.role_code,
          role_name: roleGroupToDelete.role_name,
          deleted_by: req.user.id
        },
        req.user.id
      );
      
      res.json({
        success: true,
        message: '删除权限组成功'
      });
    } catch (error) {
      console.error('删除权限组失败:', error);
      return res.status(500).json({
        success: false,
        message: '删除权限组失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 批量删除权限组
router.post('/batch-delete', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要删除的权限组'
      });
    }

    // 检查是否有用户正在使用这些权限组
    const userFilters = [{ type: 'in', column: 'roles', value: ids }];
    
    try {
      const usersWithRoles = await select('users', 'id', userFilters, ids.length, 0);
      
      if (usersWithRoles && usersWithRoles.length > 0) {
        return res.status(409).json({
          success: false,
          message: '部分权限组正在被用户使用，无法删除'
        });
      }
    } catch (error) {
      console.error('检查用户使用情况失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查用户使用情况失败',
        error: error.message
      });
    }

    try {
      const filters = [{ type: 'in', column: 'role_id', value: ids }];
      await deleteData('role_group', filters);
      
      res.json({
        success: true,
        message: '批量删除权限组成功'
      });
    } catch (error) {
      console.error('批量删除权限组失败:', error);
      return res.status(500).json({
        success: false,
        message: '批量删除权限组失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;