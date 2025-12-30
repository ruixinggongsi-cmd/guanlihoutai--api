import express from 'express';
import { select, insert, count, getSupabaseClient } from '../config/supabase.js';
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

// 添加联系记录
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { customerId, contactTime, content } = req.body;

    // 参数验证
    if (!customerId || !contactTime || !content) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：客户ID、联系时间、沟通内容、员工ID和员工姓名都是必填项'
      });
    }

    // 创建联系记录
    const contactRecordData = {
      customer_id: customerId,
      contact_time: new Date(contactTime).toISOString(),
      content: content.trim(),
      staff_id: req.user.id,
      staff_name: req.user.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    try {
      const insertedData = await insert('contact_records', contactRecordData);
      const data = insertedData[0];

      // 返回创建的联系记录数据
      const responseData = {
        id: data.id,
        customer_id: data.customer_id,
        contact_time: data.contact_time,
        content: data.content,
        staff_id: data.staff_id,
        staff_name: data.staff_name,
        created_at: data.created_at
      };

      res.status(201).json({
        success: true,
        data: responseData,
        message: '创建联系记录成功'
      });
    } catch (error) {
      console.error('创建联系记录失败:', error);
      return res.status(500).json({
        success: false,
        message: '创建联系记录失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 按客户ID查询联系记录（支持分页和排序）
router.get('/customer/:customerId', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { page = 1, pageSize = 10, sortBy = 'contact_time', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * pageSize;

    // 参数验证
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: '客户ID不能为空'
      });
    }

    // 验证客户是否存在
    const customerFilters = [{ type: 'eq', column: 'id', value: customerId }];
    const existingCustomer = await select('customers', 'id', customerFilters, 1, 0);
    
    if (!existingCustomer || existingCustomer.length === 0) {
      return res.status(404).json({
        success: false,
        message: '客户不存在'
      });
    }

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'customer_id', value: customerId }];

    // 排序条件
    const order = { 
      column: 'contact_time', 
      ascending: false
    };

    try {
      // 查询联系记录
      const data = await select(
        'contact_records', 
        'id, customer_id, contact_time, content, staff_id, staff_name, created_at, updated_at', 
        filters, 
        pageSize, 
        offset, 
        order
      );
      
      // 获取总数
      const totalCount = await count('contact_records', filters);

      // 格式化返回数据
      const formattedData = (data || []).map(record => ({
        id: record.id,
        customer_id: record.customer_id,
        contact_time: record.contact_time,
        content: record.content,
        staff_id: record.staff_id,
        staff_name: record.staff_name,
        created_at: record.created_at,
        updated_at: record.updated_at
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
        message: '获取联系记录成功'
      });
    } catch (error) {
      console.error('获取联系记录失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取联系记录失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取联系记录列表（基于contact_records_view和数据权限）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, sortBy = 'contact_time', sortOrder = 'desc', customerName, staffName, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    console.log('req.user:', req.user);
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
      // 个人权限：只能看到自己的联系记录
      filters.push({ type: 'eq', column: 'staff_id', value: userId });
    } else if (dataPermission === 'department') {
      // 部门权限：查看当前部门和所有子部门的数据
      if (currentUser.department) {
        try {
          const client = getSupabaseClient();
          
          // 调用递归函数获取当前部门及其所有子部门ID
          const allDeptIds = await getDepartmentAndChildren(currentUser.department, client);
          
          if (allDeptIds.length > 0) {
            filters.push({ type: 'in', column: 'department_id', value: allDeptIds });
          } else {
            // 如果没有找到部门，回退到当前部门
            filters.push({ type: 'eq', column: 'department_id', value: currentUser.department });
          }
          
        } catch (error) {
          console.error('获取部门树失败:', error);
          // 如果获取子部门失败，只使用当前部门
          filters.push({ type: 'eq', column: 'department_id', value: currentUser.department });
        }
      } else {
        // 如果没有部门，只能看到自己的数据
        filters.push({ type: 'eq', column: 'staff_id', value: userId });
      }
    }
    // dataPermission === 'all' 时，不添加任何限制条件，查看所有数据

    // 添加搜索条件
    if (customerName) {
      filters.push({ type: 'ilike', column: 'customer_name', value: `%${customerName}%` });
    }
    
    if (staffName) {
      filters.push({ type: 'ilike', column: 'staff_name', value: `%${staffName}%` });
    }
    
    if (startDate) {
      filters.push({ type: 'gte', column: 'contact_time', value: startDate });
    }
    
    if (endDate) {
      filters.push({ type: 'lte', column: 'contact_time', value: endDate });
    }

    // 排序条件
    const order = { 
      column: ['contact_time', 'customer_id', 'staff_name', 'created_at'].includes(sortBy) ? sortBy : 'contact_time', 
      ascending: sortOrder.toLowerCase() === 'asc' 
    };

    try {
      // 使用封装的select函数查询contact_records_view视图
      const data = await select(
        'contact_records_view', 
        '*', 
        filters, 
        pageSize, 
        offset, 
        order
      );
      
      // 获取总数
      const totalCount = await count('contact_records_view', filters);
      
      res.json({
        success: true,
        data: data || [],
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
        message: '获取联系记录列表成功'
      });
      
    } catch (error) {
      console.error('获取联系记录列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取联系记录列表失败',
        error: error.message
      });
    }
    
  } catch (error) {
    next(error);
  }
});

export default router;