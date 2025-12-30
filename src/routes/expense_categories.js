import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { body, param, validationResult } from 'express-validator';
import { default as OperationLogger } from '../utils/operationLogger.js';

const operationLogger = new OperationLogger();

const router = express.Router();

// 费用分类验证规则
const categoryValidation = [
  body('category_name')
    .trim()
    .notEmpty().withMessage('分类名称不能为空')
    .isLength({ min: 1, max: 100 }).withMessage('分类名称长度必须在1-100个字符之间'),

  body('icon')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('图标长度不能超过100个字符'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('描述长度不能超过1000个字符'),
];

// 获取所有费用分类（树形结构）
router.get('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 排序条件
    const order = { column: 'category_name', ascending: true };
    
    try {
      // 使用封装的select函数查询数据
      const data = await select('expense_categories', '*', [], 1000, 0, order);
      
      // 构建树结构
      const buildTree = (categories, parentId = null) => {
        return categories
          .filter(category => category.parent_id === parentId)
          .map(category => ({
            ...category,
            children: buildTree(categories, category.id)
          }));
      };

      const treeData = buildTree(data || []);

      res.json({
        success: true,
        data: treeData,
        total: data ? data.length : 0,
        message: '获取分类列表成功'
      });
    } catch (error) {
      console.error('获取分类列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取分类列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取分类详情
router.get('/details/:id', verifySignatureAndToken, [
  param('id').isUUID().withMessage('分类ID必须是有效的UUID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: '参数验证失败', 
        details: errors.array() 
      });
    }

    const { id } = req.params;
    
    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const categoryData = await select('expense_categories', '*', filters, 1, 0);
      
      if (!categoryData || categoryData.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: '分类不存在' 
        });
      }
      
      res.json({
        success: true,
        data: categoryData[0],
        message: '获取分类详情成功'
      });
    } catch (error) {
      console.error('获取分类详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取分类详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取子分类
router.get('/:id/children', verifySignatureAndToken, [
  param('id').isUUID().withMessage('分类ID必须是有效的UUID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: '参数验证失败', 
        details: errors.array() 
      });
    }

    const { id } = req.params;
    
    // 检查父分类是否存在
    const parentFilters = [{ type: 'eq', column: 'id', value: id }];
    const parentCategories = await select('expense_categories', '*', parentFilters, 1, 0);
    
    if (!parentCategories || parentCategories.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '父分类不存在' 
      });
    }
    
    // 排序条件
    const order = { column: 'sort_order,created_at', ascending: true };
    
    // 获取子分类
    const childrenFilters = [{ type: 'eq', column: 'parent_id', value: id }];
    const children = await select('expense_categories', '*', childrenFilters, 100, 0, order);
    
    res.json({
      success: true,
      data: children || [],
      total: children ? children.length : 0,
      message: '获取子分类成功'
    });
  } catch (error) {
    console.error('获取子分类失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取子分类失败',
      error: error.message
    });
  }
});

// 添加费用分类
router.post('/', verifySignatureAndToken, categoryValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: '参数验证失败', 
        details: errors.array() 
      });
    }

    const { category_name, parent_id, icon, description, sort_order } = req.body;
    let search=[{ column: 'category_name', type: 'eq', value: category_name }]
    // 检查父分类是否存在（如果提供了parent_id）
    if (parent_id) {
      search.push({ column: 'parent_id', type: 'eq', value: parent_id })
      const parentCategories = await select('expense_categories', '*', [{ column: 'id', type: 'eq', value: parent_id }]);
      if (parentCategories.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: '父分类不存在' 
        });
      }
    }
    
    // 检查同一父分类下是否已存在同名分类
    const existingCategories = await select('expense_categories', '*', search);

    
    if (existingCategories.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '同一父分类下已存在同名分类' 
      });
    }
   

    const insertData = {
      category_name,
      parent_id: parent_id || null,
      icon: icon || null,
      description: description || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const result = await insert('expense_categories', insertData);
    
    if (result && result.length > 0) {
      try
      {
      // 记录操作日志
      await operationLogger.recordOperation(
        'expense_categories',
        'create',
        {
          category_id: result[0].id,
          category_name: result[0].category_name,
          parent_id: result[0].parent_id,
          icon: result[0].icon,
          description: result[0].description,
          created_by: req.user.id
        },
        req.user.id
      );
    }
    catch (error) {
     
    }
      
      res.json({
        success: true,
        message: '分类添加成功',
        data: result[0]
      });
    } else {
      res.status(500).json({
        success: false,
        error: '添加分类失败'
      });
    }
  } catch (error) {
    console.error('添加分类错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '添加分类失败' 
    });
  }
});

// 更新费用分类
router.put('/:id', verifySignatureAndToken, [
  param('id').isUUID().withMessage('分类ID必须是有效的UUID'),
  ...categoryValidation
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: '参数验证失败', 
        details: errors.array() 
      });
    }

    const { id } = req.params;
    const { category_name, parent_id, icon, description } = req.body;
    
    // 检查分类是否存在
    const existingCategories = await select('expense_categories', '*', [{ column: 'id', type: 'eq', value: id }]);
    if (existingCategories.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '分类不存在' 
      });
    }
    
    // 检查父分类是否存在
    if (parent_id) {
      const parentCategories = await select('expense_categories', '*', [{ column: 'id', type: 'eq', value: parent_id }]);
      if (parentCategories.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: '父分类不存在' 
        });
      }
      
      // 检查循环引用（不能将自己设为父分类）
      if (parent_id === id) {
        return res.status(400).json({ 
          success: false, 
          error: '不能将自己设为父分类' 
        });
      }
    }

    const updateData = {};
    if (category_name !== undefined) updateData.category_name = category_name;
    if (parent_id !== undefined && parent_id !== null) updateData.parent_id = parent_id || null;
    if (icon !== undefined) updateData.icon = icon || null;
    if (description !== undefined) updateData.description = description || '';
    updateData.updated_at = new Date().toISOString();

    await update('expense_categories', updateData, [{ column: 'id', type: 'eq', value: id }]);
    
    // 记录操作日志
    await operationLogger.recordOperation(
      'expense_categories',
      'update',
      {
        category_id: id,
        category_name: updateData.category_name,
        parent_id: updateData.parent_id,
        icon: updateData.icon,
        description: updateData.description,
        updated_by: req.user.id
      },
      req.user.id
    );
    
    res.json({
      success: true,
      message: '分类更新成功',
      data: {
        id,
        ...updateData
      }
    });
  } catch (error) {
    console.error('更新分类错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '更新分类失败' 
    });
  }
});

// 删除费用分类
router.delete('/:id', verifySignatureAndToken, [
  param('id').isUUID().withMessage('分类ID必须是有效的UUID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: '参数验证失败', 
        details: errors.array() 
      });
    }

    const { id } = req.params;
    
    // 首先检查该分类是否存在子分类
    const childCategories = await select('expense_categories', '*', [
      { column: 'parent_id', type: 'eq', value: id }
    ]);
    
    if (childCategories.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '该分类存在子分类，无法删除' 
      });
    }

    await deleteData('expense_categories', [{ column: 'id', type: 'eq', value: id }]);

    // 记录操作日志
    await operationLogger.recordOperation(
      'expense_categories',
      'delete',
      {
        category_id: id,
        category_name: id,
        deleted_by: req.user.id
      },
      req.user.id
    );

    res.json({
      success: true,
      message: '分类删除成功'
    });
  } catch (error) {
    console.error('删除分类错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '删除分类失败' 
    });
  }
});

// 批量删除费用分类
router.delete('/batch', verifySignatureAndToken, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '请提供要删除的分类ID数组' 
      });
    }
    
    if (ids.length > 50) {
      return res.status(400).json({ 
        success: false, 
        error: '一次最多只能删除50个分类' 
      });
    }
    
    // 检查这些分类是否存在子分类
    const childCategories = await select('expense_categories', '*', [
      { field: 'parent_id', operator: 'in', value: ids }
    ]);
    
    if (childCategories.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '选中的分类中存在有子分类的分类，无法批量删除' 
      });
    }
    
    // 批量删除
    await deleteData('expense_categories', [{ column: 'id', type: 'in', value: ids }]);

    res.json({
      success: true,
      message: `成功删除 ${ids.length} 个费用分类`,
      deletedCount: ids.length
    });
  } catch (error) {
    console.error('批量删除分类错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '批量删除分类失败' 
    });
  }
});

// 检查分类名称是否可用
router.post('/check-name', verifySignatureAndToken, async (req, res) => {
  try {
    const { category_name, parent_id, exclude_id } = req.body;
    
    if (!category_name || category_name.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        error: '分类名称不能为空' 
      });
    }
    
    const conditions = [
      { column: 'category_name', type: 'eq', value: category_name.trim() },
      { column: 'parent_id', type: 'eq', value: parent_id || null }
    ];
    
    // 如果提供了exclude_id，则在检查时排除该ID（用于更新时的检查）
    if (exclude_id) {
      conditions.push({ column: 'id', type: 'neq', value: exclude_id });
    }
    
    const existingCategories = await select('expense_categories', 'id', conditions);
    
    res.json({
      success: true,
      data: {
        available: existingCategories.length === 0,
        message: existingCategories.length > 0 ? '分类名称已存在' : '分类名称可用'
      }
    });
  } catch (error) {
    console.error('检查分类名称错误:', error);
    res.status(500).json({ 
      success: false, 
      error: '检查分类名称失败' 
    });
  }
});

export default router;