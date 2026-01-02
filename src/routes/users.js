import express from 'express';
import bcrypt from 'bcryptjs';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';
const router = express.Router();
const operationLogger = new OperationLogger();

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

// 获取用户列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword = '',status,department } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'username', value: keyword },
        { type: 'ilike', column: 'name', value: keyword },
        { type: 'ilike', column: 'email', value: keyword }
      );
    }
    if (status) {
      orFilters.push(
        { type: 'eq', column: 'status', value: status }
       
      );
    }
     if (department) {
      orFilters.push(
        { type: 'eq', column: 'department', value: department }
       
      );
    }
    const filters = [];
    // 获取用户详细信息（包括部门）
    const userFilters = [{ type: 'eq', column: 'id', value: req.user.id }];
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
    // 根据数据权限添加筛选条件
    if (dataPermission === 'personal') {
      // 个人权限：只能看到自己的联系记录
      filters.push({ type: 'eq', column: 'staff_id', value: req.user.id });
    } else if (dataPermission === 'department') {
      // 部门权限：查看当前部门和所有子部门的数据
      if (currentUser.department) {
        try {
          const client = getSupabaseClient();
          
          // 调用递归函数获取当前部门及其所有子部门ID
          const allDeptIds = await getDepartmentAndChildren(currentUser.department, client);
          
          if (allDeptIds.length > 0) {
            filters.push({ type: 'in', column: 'department', value: allDeptIds });
          } else {
            // 如果没有找到部门，回退到当前部门
            filters.push({ type: 'eq', column: 'department', value: currentUser.department });
          }
          
        } catch (error) {
          console.error('获取部门树失败:', error);
          // 如果获取子部门失败，只使用当前部门
          filters.push({ type: 'eq', column: 'department', value: currentUser.department });
        }
      } else {
        // 如果没有部门，只能看到自己的数据
        filters.push({ type: 'eq', column: 'id', value: req.user.id });
      }
    }

    // 排序条件
    const order = { column: 'create_at', ascending: false };

    try {
      // 使用封装的select函数查询数据
      const data = await select('users', '*', filters, pageSize, offset, order, orFilters);
      
      // 获取职位信息
      const positionIds = [...new Set((data || []).map(user => user.position_id).filter(id => id !== null))];
      const positionsMap = {};
      if (positionIds.length > 0) {
        const positionFilters = [{ type: 'in', column: 'id', value: positionIds }];
        const positions = await select('positions', 'id, position_name, position_code', positionFilters, positionIds.length, 0);
        if (positions) {
          positions.forEach(position => {
            positionsMap[position.id] = position;
          });
        }
      }
      
      // 为每个用户添加职位信息
      const enrichedData = (data || []).map(user => ({
        ...user,
        position: positionsMap[user.position_id] || null
      }));
      
      // 获取总数
      const totalCount = await count('users', filters, orFilters);

      res.json({
        success: true,
        data: enrichedData || [],
        pagination: {
          total: totalCount,
          page,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取用户列表成功'
      });
    } catch (error) {
      console.error('获取用户列表失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '获取用户列表失败',
        error: error.message
      });
    }
  } catch (error) {
    console.log('获取用户列表失败:', error);
    next(error);
  }
});

// 获取单个用户详情
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const userData = await select('users', '*', filters, 1, 0);
      
      if (!userData || userData.length === 0) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      const user = userData[0];

      res.json({
        success: true,
        data: user,
        message: '获取用户详情成功'
      });
    } catch (error) {
      console.error('获取用户详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取用户详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建用户
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    let { username, name, email, phone, password, department, roles, remarks, position_id } = req.body;

    // 检查用户名是否已存在
    const orFilters = [
      { type: 'eq', column: 'username', value: username },
      { type: 'eq', column: 'email', value: email }
    ];
    
    try {
      const existingUser = await select('users', 'id', [], 1, 0, null, orFilters);
      
      if (existingUser && existingUser.length > 0) {
        return res.status(409).json({
          success: false,
          message: '用户名或邮箱已存在'
        });
      }
    } catch (error) {
      console.error('检查用户失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '检查用户失败',
        error: error.message
      });
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 12);

    // 创建用户
    const userData = {
      username,
      name,
      email,
      phone: phone || null,
      loginpass: hashedPassword,
      department: department || null,
      roles: roles || null,
      position_id: position_id || null,
      status: true,
      remarks: remarks || '',
      create_at: new Date().toISOString()
    };
    
    try {
      const insertedData = await insert('users', userData);
      const data = insertedData[0]; // insert返回数组，取第一个元素

      // 返回创建的用户数据，只包含需要的字段
      const responseData = {
        id: data.id,
        username: data.username,
        name: data.name,
        email: data.email,
        phone: data.phone,
        department: data.department,
        roles: data.roles,
        position_id: data.position_id,
        status: data.status,
        remarks: data.remarks,
        create_at: data.create_at
      };

      // 记录创建用户操作日志
      await operationLogger.recordOperation('users', 'create', data.id, '用户', {
        username: data.username,
        name: data.name,
        email: data.email,
        phone: data.phone,
        department: data.department,
        status: data.status
      }, req.user?.id);

      res.status(201).json({
        success: true,
        data: responseData,
        message: '创建用户成功'
      });
    } catch (error) {
      console.error('创建用户失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '创建用户失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新用户信息
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, name, email, phone, department, roles, status, remarks, password, position_id } = req.body;

    // 检查用户是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingUser = await select('users', 'id', filters, 1, 0);
      
      if (!existingUser || existingUser.length === 0) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
    } catch (error) {
      console.error('检查用户失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查用户失败',
        error: error.message
      });
    }

    // 准备更新数据
        const updateData = {};
        
        if (username !== undefined) updateData.username = username;
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (department !== undefined) updateData.department = department;
        if (roles !== undefined) updateData.roles = roles;
        if (position_id !== undefined) updateData.position_id = position_id;
        if (status !== undefined) updateData.status = status;
        if (remarks !== undefined) updateData.remarks = remarks;
        if (password !== undefined) {
          updateData.loginpass = await bcrypt.hash(password, 12);
        }

        console.log(updateData);
    try {
      const updatedData = await update('users', updateData, filters);
      const data = updatedData[0]; // update返回数组，取第一个元素

      // 返回更新后的用户数据，只包含需要的字段
      const responseData = {
        id: data.id,
        username: data.username,
        name: data.name,
        email: data.email,
        phone: data.phone,
        department: data.department,
        roles: data.roles,
        position_id: data.position_id,
        status: data.status,
        remarks: data.remarks,
        create_at: data.create_at
      };

      // 记录更新用户操作日志
      await operationLogger.recordOperation('users', 'update', data.id, '用户', {
        username: data.username,
        name: data.name,
        email: data.email,
        phone: data.phone,
        department: data.department,
        status: data.status
      }, req.user?.id);

      res.json({
        success: true,
        data: responseData,
        message: '更新用户成功'
      });
    } catch (error) {
      console.error('更新用户失败:', error);
      return res.status(500).json({
        success: false,
        message: '更新用户失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 修改用户密码
router.put('/:id/password', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;

    // 检查用户是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingUser = await select('users', 'id', filters, 1, 0);
      
      if (!existingUser || existingUser.length === 0) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
    } catch (error) {
      console.error('检查用户失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查用户失败',
        error: error.message
      });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 更新密码
    const passwordUpdateData = { loginpass: hashedPassword };
    
    try {
      const updatedData = await update('users', passwordUpdateData, filters);
      const data = updatedData[0]; // update返回数组，取第一个元素

      // 返回修改密码后的用户数据，只包含需要的字段
      const responseData = {
        id: data.id,
        username: data.username,
        name: data.name,
        email: data.email
      };

      // 记录修改密码操作日志
      await operationLogger.recordOperation('users', 'change_password', data.id, '用户', {
        username: data.username,
        name: data.name,
        email: data.email
      }, req.user?.id);

      res.json({
        success: true,
        data: responseData,
        message: '修改密码成功'
      });
    } catch (error) {
      console.error('修改密码失败:', error);
      return res.status(500).json({
        success: false,
        message: '修改密码失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 删除用户
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查用户是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingUser = await select('users', 'id', filters, 1, 0);
      
      if (!existingUser || existingUser.length === 0) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
    } catch (error) {
      console.error('检查用户失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查用户失败',
        error: error.message
      });
    }

    // 删除用户
    try {
      await deleteData('users', filters);

      // 记录删除用户操作日志
      await operationLogger.recordOperation('users', 'delete', id, '用户', {
        id: id
      }, req.user?.id);

      res.json({
        success: true,
        message: '删除用户成功'
      });
    } catch (error) {
      console.error('删除用户失败:', error);
      return res.status(500).json({
        success: false,
        message: '删除用户失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;