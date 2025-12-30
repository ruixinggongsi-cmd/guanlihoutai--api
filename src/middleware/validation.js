const pool = require('../config/database');

/**
 * 验证菜单数据
 */
const validateMenuData = async (req, res, next) => {
  try {
    const { name, path, icon, parent_id, sort_order, type, status, description } = req.body;
    const errors = [];

    // 验证必填字段
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('菜单名称不能为空');
    }

    if (name && (name.length < 1 || name.length > 100)) {
      errors.push('菜单名称长度必须在1-100个字符之间');
    }

    // 验证路径格式（如果提供了路径）
    if (path !== undefined && path !== null && path !== '') {
      if (typeof path !== 'string') {
        errors.push('菜单路径必须是字符串');
      } else if (path.length > 255) {
        errors.push('菜单路径长度不能超过255个字符');
      } else if (!/^\/[a-zA-Z0-9-_\/]*$/.test(path) && path !== '/') {
        errors.push('菜单路径格式不正确，必须以/开头，只能包含字母、数字、下划线和连字符');
      }
    }

    // 验证图标格式（如果提供了图标）
    if (icon !== undefined && icon !== null && icon !== '') {
      if (typeof icon !== 'string') {
        errors.push('菜单图标必须是字符串');
      } else if (icon.length > 100) {
        errors.push('菜单图标长度不能超过100个字符');
      } else if (!/^fas? fa-[a-zA-Z0-9-]+$/.test(icon)) {
        errors.push('菜单图标格式不正确，必须是FontAwesome图标类名格式');
      }
    }

    // 验证父菜单ID（如果提供了）
    if (parent_id !== undefined && parent_id !== null && parent_id !== '') {
      if (!Number.isInteger(parent_id) || parent_id <= 0) {
        errors.push('父菜单ID必须是正整数');
      } else {
        // 检查父菜单是否存在
        const parentResult = await pool.query(
          'SELECT id FROM menus WHERE id = $1',
          [parent_id]
        );
        
        if (parentResult.rows.length === 0) {
          errors.push('父菜单不存在');
        }
      }
    }

    // 验证排序权重
    if (sort_order !== undefined && sort_order !== null) {
      if (!Number.isInteger(sort_order) || sort_order < 0) {
        errors.push('排序权重必须是非负整数');
      }
    }

    // 验证菜单类型
    if (type !== undefined && type !== null) {
      if (!['menu', 'function'].includes(type)) {
        errors.push('菜单类型必须是 menu 或 function');
      }
    }

    // 验证状态
    if (status !== undefined && status !== null) {
      if (!['active', 'inactive'].includes(status)) {
        errors.push('菜单状态必须是 active 或 inactive');
      }
    }

    // 验证描述长度
    if (description !== undefined && description !== null && description !== '') {
      if (typeof description !== 'string') {
        errors.push('菜单描述必须是字符串');
      } else if (description.length > 1000) {
        errors.push('菜单描述长度不能超过1000个字符');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: '数据验证失败',
        errors: errors
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '数据验证失败',
      error: error.message
    });
  }
};

/**
 * 检查循环引用
 */
const checkCircularReference = async (menuId, parentId, client = null) => {
  if (!parentId) {
    return false; // 顶级菜单不可能形成循环
  }

  const db = client || pool;
  
  try {
    const result = await db.query(`
      WITH RECURSIVE parent_chain AS (
        -- 从新父菜单开始向上查找
        SELECT id, parent_id, 1 as level
        FROM menus 
        WHERE id = $1
        
        UNION ALL
        
        -- 继续向上查找父菜单
        SELECT m.id, m.parent_id, pc.level + 1
        FROM menus m
        INNER JOIN parent_chain pc ON m.id = pc.parent_id
        WHERE m.parent_id IS NOT NULL
      )
      SELECT EXISTS(SELECT 1 FROM parent_chain WHERE id = $2) as is_circular
    `, [parentId, menuId]);

    return result.rows[0].is_circular;
  } catch (error) {
    throw error;
  }
};

/**
 * 验证部门数据
 */
const validateDepartmentData = async (req, res, next) => {
  try {
    const { name, code, parent_id, description, status } = req.body;
    const errors = [];

    // 验证必填字段
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('部门名称不能为空');
    }

    if (name && (name.length < 1 || name.length > 100)) {
      errors.push('部门名称长度必须在1-100个字符之间');
    }

    // 验证部门编码
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      errors.push('部门编码不能为空');
    }

    if (code && (code.length < 1 || code.length > 50)) {
      errors.push('部门编码长度必须在1-50个字符之间');
    } else if (code && !/^[A-Z0-9-_]+$/.test(code)) {
      errors.push('部门编码只能包含大写字母、数字、下划线和连字符');
    }

    // 验证父部门ID（如果提供了）
    if (parent_id !== undefined && parent_id !== null && parent_id !== '') {
      if (!Number.isInteger(parent_id) || parent_id <= 0) {
        errors.push('父部门ID必须是正整数');
      } else {
        // 检查父部门是否存在
        const parentResult = await pool.query(
          'SELECT id FROM departments WHERE id = $1',
          [parent_id]
        );
        
        if (parentResult.rows.length === 0) {
          errors.push('父部门不存在');
        }
      }
    }

    // 验证状态
    if (status !== undefined && status !== null) {
      if (!['active', 'inactive'].includes(status)) {
        errors.push('部门状态必须是 active 或 inactive');
      }
    }

    // 验证描述长度
    if (description !== undefined && description !== null && description !== '') {
      if (typeof description !== 'string') {
        errors.push('部门描述必须是字符串');
      } else if (description.length > 500) {
        errors.push('部门描述长度不能超过500个字符');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: '数据验证失败',
        errors: errors
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '数据验证失败',
      error: error.message
    });
  }
};

/**
 * 验证分页参数
 */
const validatePagination = (req, res, next) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const errors = [];

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);

    if (isNaN(pageNum) || pageNum < 1) {
      errors.push('页码必须是大于0的正整数');
    }

    if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
      errors.push('每页条数必须是1-100之间的正整数');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: '分页参数验证失败',
        errors: errors
      });
    }

    // 将验证后的值保存到请求对象中
    req.validatedPage = pageNum;
    req.validatedPageSize = pageSizeNum;

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '分页参数验证失败',
      error: error.message
    });
  }
};

/**
 * 验证搜索参数
 */
const validateSearchParams = (allowedFields) => {
  return (req, res, next) => {
    try {
      const { keyword, ...otherParams } = req.query;
      const errors = [];

      // 验证搜索关键词
      if (keyword !== undefined && keyword !== null && keyword !== '') {
        if (typeof keyword !== 'string') {
          errors.push('搜索关键词必须是字符串');
        } else if (keyword.length > 100) {
          errors.push('搜索关键词长度不能超过100个字符');
        }
      }

      // 验证其他参数
      const invalidParams = Object.keys(otherParams).filter(param => !allowedFields.includes(param));
      if (invalidParams.length > 0) {
        errors.push(`不支持的搜索参数: ${invalidParams.join(', ')}`);
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: '搜索参数验证失败',
          errors: errors
        });
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: '搜索参数验证失败',
        error: error.message
      });
    }
  };
};

/**
 * 验证文件上传
 */
const validateFileUpload = (allowedTypes = [], maxSize = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '请上传文件'
        });
      }

      const { originalname, mimetype, size } = req.file;
      const errors = [];

      // 验证文件类型
      if (allowedTypes.length > 0 && !allowedTypes.includes(mimetype)) {
        errors.push(`不支持的文件类型，请上传以下类型的文件: ${allowedTypes.join(', ')}`);
      }

      // 验证文件大小
      if (size > maxSize) {
        errors.push(`文件大小不能超过 ${maxSize / (1024 * 1024)}MB`);
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: '文件验证失败',
          errors: errors
        });
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: '文件上传验证失败',
        error: error.message
      });
    }
  };
};

module.exports = {
  validateMenuData,
  validateDepartmentData,
  validatePagination,
  validateSearchParams,
  validateFileUpload,
  checkCircularReference
};