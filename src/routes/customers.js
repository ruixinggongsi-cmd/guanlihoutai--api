import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';
import { isSuperAdmin } from '../utils/superAdmin.js';
const router = express.Router();
const operationLogger = new OperationLogger();

async function enrichCustomersWithCreators(customers) {
  if (!customers || customers.length === 0) return customers;

  const creatorIds = [...new Set(customers.map(c => c.created_by).filter(Boolean))];
  if (creatorIds.length === 0) return customers;

  const userMap = new Map();
  const userBatchSize = 100;

  for (let i = 0; i < creatorIds.length; i += userBatchSize) {
    const batch = creatorIds.slice(i, i + userBatchSize);
    const users = await select('users', 'id, name, username', [{ type: 'in', column: 'id', value: batch }]);
    (users || []).forEach(user => {
      userMap.set(user.id, user.name || user.username || '未知用户');
    });
  }

  return customers.map(customer => ({
    ...customer,
    creator_name: customer.created_by ? (userMap.get(customer.created_by) || '未知用户') : '-'
  }));
}

async function assertCustomerDeletePermission(req, customer) {
  if (isSuperAdmin(req.user)) return true;
  if (customer.created_by && customer.created_by !== req.user.id) {
    return false;
  }
  return true;
}

// 获取客户列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword = '', status, source, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;

    // 获取当前登录用户ID
    const currentUserId = req.user.id;
    const superAdmin = isSuperAdmin(req.user);

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'name', value: keyword },
        { type: 'ilike', column: 'company', value: keyword },
        { type: 'ilike', column: 'phone', value: keyword },
        { type: 'ilike', column: 'email', value: keyword }
      );
    }

    // 构建AND过滤条件 - 普通用户只看自己创建的数据，超级管理员看全部
    const filters = [];
    if (!superAdmin) {
      filters.push({ type: 'eq', column: 'created_by', value: currentUserId });
    }
    
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    if (source) {
      filters.push({ type: 'eq', column: 'source', value: source });
    }
    if (startDate) {
      filters.push({ type: 'gte', column: 'created_at', value: startDate });
    }
    if (endDate) {
      filters.push({ type: 'lte', column: 'created_at', value: endDate });
    }

    // 排序条件
    const order = { column: 'created_at', ascending: false };

    try {
      // 使用封装的select函数查询数据
      let data = await select('customers', '*', filters, pageSize, offset, order, orFilters);

      if (superAdmin && data && data.length > 0) {
        data = await enrichCustomersWithCreators(data);
      }
      
      // 获取总数
      const totalCount = await count('customers', filters, orFilters);

      res.json({
        success: true,
        data: data || [],
        isSuperAdmin: superAdmin,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取客户列表成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '获取客户列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取单个客户详情 - 必须放在具体路由之后
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const customerData = await select('customers', '*', filters, 1, 0);
      
      if (!customerData || customerData.length === 0) {
        return res.status(404).json({
          success: false,
          message: '客户不存在'
        });
      }
      
      const customer = customerData[0];

      res.json({
        success: true,
        data: customer,
        message: '获取客户详情成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '获取客户详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建客户
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { name, company, phone, email, status, source, address, notes } = req.body;

    // 检查手机号是否已存在
    const phoneFilters = [{ type: 'eq', column: 'phone', value: phone }];
    
    try {
      const existingCustomer = await select('customers', 'id', phoneFilters, 1, 0);
      
      if (existingCustomer && existingCustomer.length > 0) {
        return res.status(409).json({
          success: false,
          message: '手机号已存在'
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查客户失败',
        error: error.message
      });
    }

    // 检查邮箱是否已存在（如果提供了邮箱）
    if (email) {
      const emailFilters = [{ type: 'eq', column: 'email', value: email }];
      
      try {
        const existingEmail = await select('customers', 'id', emailFilters, 1, 0);
        
        if (existingEmail && existingEmail.length > 0) {
          return res.status(409).json({
            success: false,
            message: '邮箱已存在'
          });
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: '检查邮箱失败',
          error: error.message
        });
      }
    }

    // 获取当前用户信息
    const userId = req.user?.id;

    // 创建客户
    const customerData = {
      name,
      company: company || null,
      phone,
      email: email || null,
      status: status || 'active',
      source: source || 'online',
      address: address || null,
      notes: notes || '',
      created_at: new Date().toISOString(),
      created_by: userId,
      updated_at: new Date().toISOString()
    };
    
    try {
      const insertedData = await insert('customers', customerData);
      const data = insertedData[0]; // insert返回数组，取第一个元素

      // 返回创建的客户数据，只包含需要的字段
      const responseData = {
        id: data.id,
        name: data.name,
        company: data.company,
        phone: data.phone,
        email: data.email,
        status: data.status,
        source: data.source,
        address: data.address,
        notes: data.notes,
        created_at: data.created_at,
        created_by: data.created_by
      };

      // 记录创建客户操作日志
      await operationLogger.recordOperation('customers', 'create', data.id, '客户', {
        name: data.name,
        company: data.company,
        phone: data.phone,
        email: data.email,
        status: data.status
      }, req.user?.id);

      res.status(201).json({
        success: true,
        data: responseData,
        message: '创建客户成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '创建客户失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新客户信息
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, company, phone, email, status, source, address, notes } = req.body;

    // 检查客户是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingCustomer = await select('customers', 'id', filters, 1, 0);
      
      if (!existingCustomer || existingCustomer.length === 0) {
        return res.status(404).json({
          success: false,
          message: '客户不存在'
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查客户失败',
        error: error.message
      });
    }

    // 检查手机号是否已被其他客户使用
    if (phone) {
      const phoneFilters = [
        { type: 'eq', column: 'phone', value: phone },
        { type: 'neq', column: 'id', value: id }
      ];
      
      try {
        const existingPhone = await select('customers', 'id', phoneFilters, 1, 0);
        
        if (existingPhone && existingPhone.length > 0) {
          return res.status(409).json({
            success: false,
            message: '手机号已被其他客户使用'
          });
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: '检查手机号失败',
          error: error.message
        });
      }
    }

    // 检查邮箱是否已被其他客户使用（如果提供了邮箱）
    if (email) {
      const emailFilters = [
        { type: 'eq', column: 'email', value: email },
        { type: 'neq', column: 'id', value: id }
      ];
      
      try {
        const existingEmail = await select('customers', 'id', emailFilters, 1, 0);
        
        if (existingEmail && existingEmail.length > 0) {
          return res.status(409).json({
            success: false,
            message: '邮箱已被其他客户使用'
          });
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: '检查邮箱失败',
          error: error.message
        });
      }
    }

    // 获取当前用户信息
    const userId = req.user?.id;

    // 准备更新数据
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (company !== undefined) updateData.company = company;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (status !== undefined) updateData.status = status;
    if (source !== undefined) updateData.source = source;
    if (address !== undefined) updateData.address = address;
    if (notes !== undefined) updateData.notes = notes;
    updateData.updated_at = new Date().toISOString();

    try {
      const updatedData = await update('customers', updateData, filters);
      const data = updatedData[0]; // update返回数组，取第一个元素

      // 返回创建后的客户数据，只包含需要的字段
      const responseData = {
        id: data.id,
        name: data.name,
        company: data.company,
        phone: data.phone,
        email: data.email,
        status: data.status,
        source: data.source,
        address: data.address,
        notes: data.notes,
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by: data.created_by
      };

      // 记录更新客户操作日志
      await operationLogger.recordOperation('customers', 'update', data.id, '客户', {
        name: data.name,
        company: data.company,
        phone: data.phone,
        email: data.email,
        status: data.status
      }, req.user?.id);

      res.json({
        success: true,
        data: responseData,
        message: '更新客户成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '更新客户失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 超级管理员：删除全部客户数据（可选按状态筛选）
router.post('/delete-all', verifySignatureAndToken, async (req, res, next) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: '权限不足，仅超级管理员可删除全部客户数据'
      });
    }

    const { statuses } = req.body || {};
    const client = getSupabaseClient();

    let countQuery = client.from('customers').select('*', { count: 'exact', head: true });
    let deleteQuery = client.from('customers').delete();

    if (Array.isArray(statuses) && statuses.length > 0) {
      countQuery = countQuery.in('status', statuses);
      deleteQuery = deleteQuery.in('status', statuses);
    } else {
      countQuery = countQuery.not('id', 'is', null);
      deleteQuery = deleteQuery.not('id', 'is', null);
    }

    const { count: deleteCount, error: countError } = await countQuery;
    if (countError) {
      return res.status(500).json({
        success: false,
        message: '统计待删除数据失败',
        error: countError.message
      });
    }

    if (!deleteCount) {
      return res.json({
        success: true,
        data: { deleted: 0 },
        message: '没有可删除的客户数据'
      });
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) {
      return res.status(500).json({
        success: false,
        message: '删除全部客户数据失败',
        error: deleteError.message
      });
    }

    await operationLogger.recordOperation('customers', 'delete_all', 'all', '客户', {
      deleted: deleteCount,
      statuses: statuses || 'all'
    }, req.user?.id);

    res.json({
      success: true,
      data: { deleted: deleteCount },
      message: `成功删除 ${deleteCount} 条客户数据`
    });
  } catch (error) {
    next(error);
  }
});

// 删除客户
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查客户是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingCustomer = await select('customers', 'id, created_by, name', filters, 1, 0);
      
      if (!existingCustomer || existingCustomer.length === 0) {
        return res.status(404).json({
          success: false,
          message: '客户不存在'
        });
      }

      const canDelete = await assertCustomerDeletePermission(req, existingCustomer[0]);
      if (!canDelete) {
        return res.status(403).json({
          success: false,
          message: '无权删除他人创建的客户'
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查客户失败',
        error: error.message
      });
    }

    // 删除客户
    try {
      await deleteData('customers', filters);

      // 记录删除客户操作日志
      await operationLogger.recordOperation('customers', 'delete', id, '客户', {
        id: id
      }, req.user?.id);

      res.json({
        success: true,
        message: '删除客户成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '删除客户失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 批量删除客户
const handleBatchDeleteCustomers = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要删除的客户'
      });
    }

    const existingCustomers = await select('customers', 'id, created_by, name', [
      { type: 'in', column: 'id', value: ids }
    ]);

    if (!existingCustomers || existingCustomers.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到要删除的客户'
      });
    }

    if (!isSuperAdmin(req.user)) {
      const unauthorized = existingCustomers.filter(
        customer => customer.created_by && customer.created_by !== req.user.id
      );
      if (unauthorized.length > 0) {
        return res.status(403).json({
          success: false,
          message: '无权删除他人创建的客户'
        });
      }
    }

    const deletableIds = existingCustomers.map(customer => customer.id);
    const filters = [{ type: 'in', column: 'id', value: deletableIds }];
    
    try {
      await deleteData('customers', filters);

      // 记录批量删除客户操作日志
      await operationLogger.recordOperation('customers', 'batch_delete', deletableIds.join(','), '客户', {
        count: deletableIds.length,
        ids: deletableIds
      }, req.user?.id);

      res.json({
        success: true,
        message: '批量删除客户成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '批量删除客户失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
};

router.delete('/batch', verifySignatureAndToken, handleBatchDeleteCustomers);
router.post('/batch-delete', verifySignatureAndToken, handleBatchDeleteCustomers);



// 修改客户创建人
router.put('/:id/change-creator', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newCreatorId } = req.body;

    // 验证参数
    if (!newCreatorId) {
      return res.status(400).json({
        success: false,
        message: '新创建人ID不能为空'
      });
    }

    // 检查客户是否存在
    const customerFilters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingCustomer = await select('customers', 'id', customerFilters, 1, 0);
      
      if (!existingCustomer || existingCustomer.length === 0) {
        return res.status(404).json({
          success: false,
          message: '客户不存在'
        });
      }
    } catch (error) {
      console.error('检查客户失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查客户失败',
        error: error.message
      });
    }

    // 获取当前用户信息（操作人）
    const userId = req.user?.id;

    // 更新客户的创建人
    const updateData = {
      created_by: newCreatorId,
      updated_by: userId
    };

    try {
      const updatedData = await update('customers', updateData, customerFilters);
      const data = updatedData[0];

      // 返回更新后的客户数据
      const responseData = {
        id: data.id,
        name: data.name,
        company: data.company,
        phone: data.phone,
        email: data.email,
        status: data.status,
        source: data.source,
        address: data.address,
        notes: data.notes,
        service_staff_id: data.service_staff_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by: data.created_by
      };

      // 记录修改创建人操作日志
      await operationLogger.recordOperation('customers', 'change_creator', data.id, '客户', {
        customer_id: data.id,
        customer_name: data.name,
        new_creator_id: newCreatorId,
        old_creator_id: data.created_by
      }, req.user?.id);

      res.json({
        success: true,
        data: responseData,
        message: '修改创建人成功'
      });
    } catch (error) {
      console.error('修改创建人失败:', error);
      return res.status(500).json({
        success: false,
        message: '修改创建人失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;