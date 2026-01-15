import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';

const router = express.Router();
const operationLogger = new OperationLogger();

/**
 * 检查底料是否重复
 * 检查规则：
 * 1. 如果提供了编号(code)，则检查 名称+编号 的组合是否重复
 * 2. 如果没有编号，则只检查名称是否重复
 * 3. 更新时排除当前记录
 */
async function checkDuplicate(name, code, excludeId = null) {
  const filters = [];
  
  if (code && code.trim()) {
    // 如果有编号，检查名称+编号组合
    filters.push({ type: 'eq', column: 'name', value: name.trim() });
    filters.push({ type: 'eq', column: 'code', value: code.trim() });
  } else {
    // 如果没有编号，只检查名称
    filters.push({ type: 'eq', column: 'name', value: name.trim() });
  }
  
  // 如果更新时，排除当前记录
  if (excludeId) {
    filters.push({ type: 'neq', column: 'id', value: excludeId });
  }
  
  try {
    const existing = await select('base_materials', 'id, name, code', filters, 1, 0);
    return existing && existing.length > 0 ? existing[0] : null;
  } catch (error) {
    console.error('检查底料重复失败:', error);
    throw error;
  }
}

// 获取底料列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword = '', status, category, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;

    // 获取当前登录用户ID
    const currentUserId = req.user.id;

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'name', value: keyword },
        { type: 'ilike', column: 'code', value: keyword },
        { type: 'ilike', column: 'description', value: keyword },
        { type: 'ilike', column: 'supplier', value: keyword }
      );
    }

    // 构建AND过滤条件 - 只返回当前用户创建的数据
    const filters = [];
    filters.push({ type: 'eq', column: 'created_by', value: currentUserId });
    
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    if (category) {
      filters.push({ type: 'eq', column: 'category', value: category });
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
      const data = await select('base_materials', '*', filters, pageSize, offset, order, orFilters);
      
      // 获取总数
      const totalCount = await count('base_materials', filters, orFilters);

      res.json({
        success: true,
        data: data || [],
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取底料列表成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '获取底料列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取单个底料详情
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const materialData = await select('base_materials', '*', filters, 1, 0);
      
      if (!materialData || materialData.length === 0) {
        return res.status(404).json({
          success: false,
          message: '底料不存在'
        });
      }
      
      const material = materialData[0];

      res.json({
        success: true,
        data: material,
        message: '获取底料详情成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '获取底料详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 检查底料是否重复（用于前端实时验证）
router.post('/check-duplicate', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { name, code, id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: '底料名称不能为空'
      });
    }

    try {
      const duplicate = await checkDuplicate(name, code, id);
      
      if (duplicate) {
        const duplicateInfo = code && code.trim() 
          ? `名称"${duplicate.name}"和编号"${duplicate.code}"的组合已存在`
          : `名称"${duplicate.name}"已存在`;
        
        return res.json({
          success: true,
          isDuplicate: true,
          message: duplicateInfo,
          duplicateData: duplicate
        });
      }

      res.json({
        success: true,
        isDuplicate: false,
        message: '底料不重复，可以添加'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查底料重复失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建底料
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { name, code, category, description, specification, unit, price, status, source, supplier, supplier_contact, notes } = req.body;

    // 验证必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: '底料名称不能为空'
      });
    }

    // 检查是否重复
    try {
      const duplicate = await checkDuplicate(name, code);
      
      if (duplicate) {
        const duplicateInfo = code && code.trim() 
          ? `名称"${duplicate.name}"和编号"${duplicate.code}"的组合已存在`
          : `名称"${duplicate.name}"已存在`;
        
        return res.status(409).json({
          success: false,
          message: duplicateInfo,
          duplicateData: duplicate
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查底料重复失败',
        error: error.message
      });
    }

    // 获取当前用户信息
    const userId = req.user?.id;

    // 创建底料数据
    const materialData = {
      name: name.trim(),
      code: code && code.trim() ? code.trim() : null,
      category: category || null,
      description: description || null,
      specification: specification || null,
      unit: unit || null,
      price: price || null,
      status: status || 'active',
      source: source || null,
      supplier: supplier || null,
      supplier_contact: supplier_contact || null,
      notes: notes || '',
      created_at: new Date().toISOString(),
      created_by: userId,
      updated_at: new Date().toISOString()
    };
    
    try {
      const insertedData = await insert('base_materials', materialData);
      const data = insertedData[0];

      // 记录创建底料操作日志
      await operationLogger.recordOperation('base_materials', 'create', data.id, '底料', {
        name: data.name,
        code: data.code,
        category: data.category,
        status: data.status
      }, req.user?.id);

      res.status(201).json({
        success: true,
        data: data,
        message: '创建底料成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '创建底料失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新底料信息
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, category, description, specification, unit, price, status, source, supplier, supplier_contact, notes } = req.body;

    // 验证必填字段
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: '底料名称不能为空'
      });
    }

    // 检查底料是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingMaterial = await select('base_materials', 'id', filters, 1, 0);
      
      if (!existingMaterial || existingMaterial.length === 0) {
        return res.status(404).json({
          success: false,
          message: '底料不存在'
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查底料失败',
        error: error.message
      });
    }

    // 检查是否重复（排除当前记录）
    try {
      const duplicate = await checkDuplicate(name, code, id);
      
      if (duplicate) {
        const duplicateInfo = code && code.trim() 
          ? `名称"${duplicate.name}"和编号"${duplicate.code}"的组合已存在`
          : `名称"${duplicate.name}"已存在`;
        
        return res.status(409).json({
          success: false,
          message: duplicateInfo,
          duplicateData: duplicate
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查底料重复失败',
        error: error.message
      });
    }

    // 准备更新数据
    const updateData = {};
    
    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code && code.trim() ? code.trim() : null;
    if (category !== undefined) updateData.category = category || null;
    if (description !== undefined) updateData.description = description || null;
    if (specification !== undefined) updateData.specification = specification || null;
    if (unit !== undefined) updateData.unit = unit || null;
    if (price !== undefined) updateData.price = price || null;
    if (status !== undefined) updateData.status = status;
    if (source !== undefined) updateData.source = source || null;
    if (supplier !== undefined) updateData.supplier = supplier || null;
    if (supplier_contact !== undefined) updateData.supplier_contact = supplier_contact || null;
    if (notes !== undefined) updateData.notes = notes || '';
    updateData.updated_at = new Date().toISOString();

    try {
      const updatedData = await update('base_materials', updateData, filters);
      const data = updatedData[0];

      // 记录更新底料操作日志
      await operationLogger.recordOperation('base_materials', 'update', data.id, '底料', {
        name: data.name,
        code: data.code,
        category: data.category,
        status: data.status
      }, req.user?.id);

      res.json({
        success: true,
        data: data,
        message: '更新底料成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '更新底料失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 删除底料
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查底料是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingMaterial = await select('base_materials', 'id', filters, 1, 0);
      
      if (!existingMaterial || existingMaterial.length === 0) {
        return res.status(404).json({
          success: false,
          message: '底料不存在'
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查底料失败',
        error: error.message
      });
    }

    // 删除底料
    try {
      await deleteData('base_materials', filters);

      // 记录删除底料操作日志
      await operationLogger.recordOperation('base_materials', 'delete', id, '底料', {
        id: id
      }, req.user?.id);

      res.json({
        success: true,
        message: '删除底料成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '删除底料失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 批量删除底料
router.delete('/batch', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要删除的底料'
      });
    }

    // 删除底料
    const filters = [{ type: 'in', column: 'id', value: ids }];
    
    try {
      await deleteData('base_materials', filters);

      // 记录批量删除底料操作日志
      await operationLogger.recordOperation('base_materials', 'batch_delete', ids.join(','), '底料', {
        count: ids.length,
        ids: ids
      }, req.user?.id);

      res.json({
        success: true,
        message: '批量删除底料成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '批量删除底料失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;

