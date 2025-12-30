import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';
const router = express.Router();
const operationLogger = new OperationLogger();

// 获取部门树结构
router.get('/tree', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 排序条件
    const order = { column: 'department_name', ascending: true };
    
    try {
      // 使用封装的select函数查询数据
      const data = await select('department', '*', [], 1000, 0, order);
      
      // 构建树结构
      const buildTree = (departments, parentId = null) => {
        return departments
          .filter(dept => dept.parent_id === parentId)
          .map(dept => ({
            ...dept,
            children: buildTree(departments, dept.id)
          }));
      };

      const treeData = buildTree(data || []);

      res.json({
        success: true,
        data: treeData,
        message: '获取部门树成功'
      });
    } catch (error) {
      console.error('获取部门树失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '获取部门树失败',
        error: error.message
      });
    }
  } catch (error) {
    // 记录系统错误日志
    await operationLogger.recordSystemError({
      errorType: 'department_route_error',
      errorMessage: error.message,
      errorStack: error.stack,
      context: {
        method: req.method,
        url: req.url,
        params: req.params,
        body: req.body
      },
      success: false
    }, req);
    
    next(error);
  }
});

// 获取部门列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword = '',department = '' } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'department_name', value: keyword },
        { type: 'ilike', column: 'remarks', value: keyword }
      );
    }
    if (department) {
      orFilters.push(
        { type: 'eq', column: 'parent_id', value: department }
      );
    }

    // 排序条件
    const order = { column: 'department_name', ascending: true };

    try {
      // 使用封装的select函数查询数据
      const data = await select('department', '*', [], pageSize, offset, order, orFilters);
      
      // 获取总数
      const totalCount = await count('department', [], orFilters);

      res.json({
        success: true,
        data: data || [],
        pagination: {
          total: totalCount,
          page,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取部门列表成功'
      });
    } catch (error) {
      console.error('获取部门列表失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '获取部门列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取部门选项（用于下拉选择）- 必须放在 /:id 路由之前
router.get('/options', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 获取所有部门，只返回必要字段
    const order = { column: 'department_name', ascending: true };
    
    try {
      const data = await select('department', 'id, department_name, parent_id', [], 1000, 0, order);
      
      res.json({
        success: true,
        data: data || [],
        message: '获取部门选项成功'
      });
    } catch (error) {
      console.error('获取部门选项失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '获取部门选项失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取部门统计信息
router.get('/stats/overview', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 获取总部门数
    const totalCount = await count('department');

    // 获取顶级部门数（parent_id 为 null）
    const topLevelFilters = [{ type: 'eq', column: 'parent_id', value: null }];
    const topLevelCount = await count('department', topLevelFilters);

    // 获取有子部门的部门数
    const subDepartments = await select('department', 'parent_id', [{ type: 'neq', column: 'parent_id', value: null }]);
    const parentIds = [...new Set(subDepartments.map(dept => dept.parent_id))];
    const departmentsWithChildren = parentIds.length;

    res.json({
      success: true,
      data: {
        totalDepartments: totalCount || 0,
        topLevelDepartments: topLevelCount || 0,
        departmentsWithChildren,
        leafDepartments: (totalCount || 0) - departmentsWithChildren
      },
      message: '获取部门统计成功'
    });
  } catch (error) {
    console.error('获取部门统计失败:', error);
    
    return res.status(500).json({
      success: false,
      message: '获取部门统计失败',
      error: error.message
    });
  }
});

// 获取单个部门详情 - 必须放在具体路由之后
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: id }];

    try {
      // 使用封装的select函数查询数据
      const data = await select('department', '*', filters, 1, 0);
      
      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          message: '部门不存在'
        });
      }

      res.json({
        success: true,
        data: data[0],
        message: '获取部门详情成功'
      });
    } catch (error) {
      console.error('获取部门详情失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '获取部门详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建部门
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { department_name, parent_id, remarks } = req.body;

    // 检查父部门是否存在
    if (parent_id) {
      const filters = [{ type: 'eq', column: 'id', value: parent_id }];
      
      try {
        const parentDept = await select('department', 'id', filters, 1, 0);
        
        if (!parentDept || parentDept.length === 0) {
          return res.status(400).json({
            success: false,
            message: '父部门不存在'
          });
        }
      } catch (error) {
        console.error('检查父部门失败:', error);
        
        return res.status(500).json({
          success: false,
          message: '检查父部门失败',
          error: error.message
        });
      }
    }

    // 创建部门
    const departmentData = {
      department_name,
      parent_id: parent_id || null,
      remarks: remarks || '',
      create_at: new Date().toISOString()
    };
    
    try {
      const insertedData = await insert('department', departmentData);
      const data = insertedData[0]; // insert返回数组，取第一个元素

      // 记录数据变更日志
      await operationLogger.recordDataChange({
        tableName: 'department',
        operation: 'create',
        recordId: data.id,
        newData: data,
        success: true
      }, req);

      res.json({
        success: true,
        data,
        message: '部门创建成功'
      });
    } catch (error) {
      console.error('创建部门失败:', error);
      
      // 记录创建失败日志
      await operationLogger.recordDataChange({
        tableName: 'department',
        operation: 'create',
        recordId: null,
        newData: departmentData,
        success: false,
        error: error.message
      }, req);
      
      return res.status(500).json({
        success: false,
        message: '创建部门失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新部门
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { department_name, parent_id, remarks } = req.body;

    // 检查部门是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingDept = await select('department', 'id', filters, 1, 0);
      
      if (!existingDept || existingDept.length === 0) {
        return res.status(404).json({
          success: false,
          message: '部门不存在'
        });
      }
    } catch (error) {
      console.error('检查部门失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '检查部门失败',
        error: error.message
      });
    }

    // 获取更新前的部门数据用于日志记录
    let oldData;
    try {
      const oldDataResult = await select('department', '*', filters, 1, 0);
      oldData = oldDataResult && oldDataResult.length > 0 ? oldDataResult[0] : null;
    } catch (error) {
      console.error('获取旧部门数据失败:', error);
      oldData = null;
    }

    // 检查父部门是否存在（如果指定了父部门）
    if (parent_id) {
      const filters = [{ type: 'eq', column: 'id', value: parent_id }];
      
      try {
        const parentDept = await select('department', 'id', filters, 1, 0);
        
        if (!parentDept || parentDept.length === 0) {
          return res.status(400).json({
            success: false,
            message: '父部门不存在'
          });
        }
      } catch (error) {
      console.error('检查父部门失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '检查父部门失败',
        error: error.message
      });
    }

      // 防止循环引用：不能将部门的父部门设置为其子部门
      const checkCircular = async (deptId, targetParentId) => {
        if (deptId === targetParentId) return true;
        
        const parentFilters = [{ type: 'eq', column: 'id', value: targetParentId }];
        const parentData = await select('department', 'parent_id', parentFilters, 1, 0);
        
        if (!parentData || parentData.length === 0 || !parentData[0].parent_id) return false;
        return checkCircular(deptId, parentData[0].parent_id);
      };

      const isCircular = await checkCircular(id, parent_id);
      if (isCircular) {
        return res.status(400).json({
          success: false,
          message: '不能将部门的父部门设置为其子部门'
        });
      }
    }

    // 更新部门信息
    const updateData = {
      department_name,
      parent_id: parent_id || null,
      remarks: remarks || ''
    };
    
    try {
      const updatedData = await update('department', updateData, filters);
      const data = updatedData[0]; // update返回数组，取第一个元素

      // 记录数据变更日志
      await operationLogger.recordDataChange({
        tableName: 'department',
        operation: 'update',
        recordId: id,
        oldData: oldData,
        newData: data,
        success: true
      }, req);

      res.json({
        success: true,
        data,
        message: '部门更新成功'
      });
    } catch (error) {
      console.error('更新部门失败:', error);
      
      // 记录更新失败日志
      await operationLogger.recordDataChange({
        tableName: 'department',
        operation: 'update',
        recordId: id,
        oldData: oldData,
        newData: updateData,
        success: false,
        error: error.message
      }, req);
      
      return res.status(500).json({
        success: false,
        message: '更新部门失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 删除部门
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查部门是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingDept = await select('department', 'id', filters, 1, 0);
      
      if (!existingDept || existingDept.length === 0) {
        return res.status(404).json({
          success: false,
          message: '部门不存在'
        });
      }
    } catch (error) {
      console.error('检查部门失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '检查部门失败',
        error: error.message
      });
    }

    // 获取要删除的部门数据用于日志记录
    let deletedData;
    try {
      const deletedDataResult = await select('department', '*', filters, 1, 0);
      deletedData = deletedDataResult && deletedDataResult.length > 0 ? deletedDataResult[0] : null;
    } catch (error) {
      console.error('获取待删除部门数据失败:', error);
      deletedData = null;
    }

    // 检查是否有子部门
    const childrenFilters = [{ type: 'eq', column: 'parent_id', value: id }];
    
    try {
      const children = await select('department', 'id', childrenFilters);

      if (children && children.length > 0) {
        return res.status(400).json({
          success: false,
          message: '该部门存在子部门，无法删除'
        });
      }
    } catch (error) {
      console.error('检查子部门失败:', error);
      
      return res.status(500).json({
        success: false,
        message: '检查子部门失败',
        error: error.message
      });
    }

    // 检查是否有用户属于该部门（如果有用户表的话）
    // const { data: users } = await supabase
    //   .from('users')
    //   .select('id')
    //   .eq('department_id', id);
    
    // if (users && users.length > 0) {
    //   return res.status(400).json({
    //     success: false,
    //     message: '该部门下存在用户，无法删除'
    //   });
    // }

    // 删除部门
    try {
      await deleteData('department', filters);

      // 记录数据变更日志
      await operationLogger.recordDataChange({
        tableName: 'department',
        operation: 'delete',
        recordId: id,
        oldData: deletedData,
        success: true
      }, req);

      res.json({
        success: true,
        message: '删除部门成功'
      });
    } catch (error) {
      console.error('删除部门失败:', error);
      
      // 记录删除失败日志
      await operationLogger.recordDataChange({
        tableName: 'department',
        operation: 'delete',
        recordId: id,
        oldData: deletedData,
        success: false,
        error: error.message
      }, req);
      
      return res.status(500).json({
        success: false,
        message: '删除部门失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;