import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { body, param, validationResult } from 'express-validator';
import { default as OperationLogger } from '../utils/operationLogger.js';

const operationLogger = new OperationLogger();

const router = express.Router();

// 设备分类验证规则
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
    .isLength({ max: 1000 }).withMessage('描述长度不能超过1000个字符')
];

// 获取所有分类（树形结构）
router.get('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 排序条件
    const order = { column: 'created_at', ascending: true };
    
    try {
      // 使用封装的select函数查询数据
      const data = await select('equipment_categories', '*', [], 1000, 0, order);
      
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

// 获取分类详情 - 必须放在具体路由之后
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
      const categoryData = await select('equipment_categories', '*', filters, 1, 0);
      
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
    const parentCategories = await select('equipment_categories', '*', parentFilters, 1, 0);
    
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
    const children = await select('equipment_categories', '*', childrenFilters, 100, 0, order);
    
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

// 创建分类
router.post('/', verifySignatureAndToken, categoryValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: '参数验证失败', 
        details: errors.array() 
      });
    }

    const { category_name, parent_id, icon, description } = req.body;
    
    // 检查父分类是否存在
    if (parent_id) {
      const parentFilters = [{ type: 'eq', column: 'id', value: parent_id }];
      const parentCategories = await select('equipment_categories', '*', parentFilters, 1, 0);
      
      if (!parentCategories || parentCategories.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: '父分类不存在' 
        });
      }
    }

    const categoryData = {
      category_name,
      parent_id: parent_id || null,
      icon: icon || null,
      description: description || ''
    };
    console.log(categoryData)
    try {
      const insertedData = await insert('equipment_categories', categoryData);
      const data = insertedData[0]; // insert返回数组，取第一个元素

      // 记录操作日志
      await operationLogger.recordOperation(
        'equipment_categories',
        'create',
        {
          category_id: data.id,
          category_name: data.category_name,
          parent_id: data.parent_id,
          icon: data.icon,
          description: data.description,
          created_by: req.user.id
        },
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: '分类创建成功',
        data: data
      });
    } catch (error) {
      console.error('创建分类失败:', error);
      return res.status(500).json({
        success: false,
        message: '创建分类失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新分类
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
    const existingCategories = await select('equipment_categories', '*', [{ column: 'id', type: 'eq', value: id }]);
    if (existingCategories.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '分类不存在' 
      });
    }
    
    // 检查父分类是否存在
    if (parent_id) {
      const parentCategories = await select('equipment_categories', '*', [{ column: 'id', type: 'eq', value: parent_id }]);
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

    const updateData = {
     
    };
    if(category_name){
      updateData.category_name = category_name;
    }
    if(parent_id){
      updateData.parent_id = parent_id;
    }
    if(icon){
      updateData.icon = icon;
    }
    if(description){
      updateData.description = description;
    }
    console.log(updateData,id)
    await update('equipment_categories', updateData, [{ column: 'id', type: 'eq', value: id }]);
    
    // 记录操作日志
    await operationLogger.recordOperation(
      'equipment_categories',
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
    res.status(500).json({ 
      success: false, 
      error: '更新分类失败' 
    });
  }
});

// 删除分类
router.delete('/:id', verifySignatureAndToken, async (req, res) => {
  try {
   
    const { id } = req.params;
  
    // 检查分类是否存在
    const existingCategories = await select('equipment_categories', '*', [{ column: 'id', type: 'eq', value: id }]);
    if (existingCategories.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '分类不存在' 
      });
    }
    
    // 检查是否有子分类
    const children = await select('equipment_categories', '*', [{ column: 'parent_id', type: 'eq', value: id }]);

    if (children.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: '该分类下有子分类，不能删除' 
      });
    }
    

    await deleteData('equipment_categories', [{ column: 'id', type: 'eq', value: id }]);
    
    // 记录操作日志
    await operationLogger.recordOperation(
      'equipment_categories',
      'delete',
      {
        category_id: id,
        category_name: existingCategories[0].category_name,
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

export default router;