import express from 'express';
import { select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

const router = express.Router();

// 获取职位列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 100, keyword = '', status } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建过滤条件
    const filters = [];
    const orFilters = [];
    
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'position_name', value: keyword },
        { type: 'ilike', column: 'position_code', value: keyword }
      );
    }
    
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }

    // 排序条件
    const order = { column: 'sort_order', ascending: true };

    try {
      const data = await select('positions', '*', filters, pageSize, offset, order, orFilters);
      const totalCount = await count('positions', filters, orFilters);

      res.json({
        success: true,
        data: data || [],
        pagination: {
          total: totalCount,
          page,
          pageSize,
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取职位列表成功'
      });
    } catch (error) {
      console.error('获取职位列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取职位列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取所有职位选项（用于下拉选择）
router.get('/options', verifySignatureAndToken, async (req, res, next) => {
  try {
    const filters = [{ type: 'eq', column: 'status', value: 'active' }];
    const order = { column: 'sort_order', ascending: true };

    try {
      const data = await select('positions', 'id, position_name, position_code', filters, 1000, 0, order);

      res.json({
        success: true,
        data: data || [],
        message: '获取职位选项成功'
      });
    } catch (error) {
      console.error('获取职位选项失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取职位选项失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取单个职位详情
router.get('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const filters = [{ type: 'eq', column: 'id', value: id }];

    try {
      const data = await select('positions', '*', filters, 1, 0);
      
      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          message: '职位不存在'
        });
      }

      res.json({
        success: true,
        data: data[0],
        message: '获取职位详情成功'
      });
    } catch (error) {
      console.error('获取职位详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取职位详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建职位
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { position_name, position_code, description, sort_order, status = 'active' } = req.body;

    if (!position_name) {
      return res.status(400).json({
        success: false,
        message: '职位名称不能为空'
      });
    }

    const positionData = {
      position_name,
      position_code: position_code || null,
      description: description || null,
      sort_order: sort_order || 0,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const insertedData = await insert('positions', positionData);
      const data = insertedData[0];

      res.status(201).json({
        success: true,
        data: data,
        message: '创建职位成功'
      });
    } catch (error) {
      console.error('创建职位失败:', error);
      
      if (error.code === '23505') { // 唯一约束违反
        return res.status(409).json({
          success: false,
          message: '职位名称已存在'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: '创建职位失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新职位
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { position_name, position_code, description, sort_order, status } = req.body;

    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    // 检查职位是否存在
    const existing = await select('positions', 'id', filters, 1, 0);
    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: '职位不存在'
      });
    }

    const updateData = {};
    if (position_name !== undefined) updateData.position_name = position_name;
    if (position_code !== undefined) updateData.position_code = position_code;
    if (description !== undefined) updateData.description = description;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (status !== undefined) updateData.status = status;
    updateData.updated_at = new Date().toISOString();

    try {
      const updatedData = await update('positions', updateData, filters);
      const data = updatedData[0];

      res.json({
        success: true,
        data: data,
        message: '更新职位成功'
      });
    } catch (error) {
      console.error('更新职位失败:', error);
      
      if (error.code === '23505') { // 唯一约束违反
        return res.status(409).json({
          success: false,
          message: '职位名称已存在'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: '更新职位失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 删除职位
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const filters = [{ type: 'eq', column: 'id', value: id }];

    // 检查职位是否存在
    const existing = await select('positions', 'id', filters, 1, 0);
    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: '职位不存在'
      });
    }

    // 检查是否有用户使用此职位
    const usersWithPosition = await select('users', 'id', [{ type: 'eq', column: 'position_id', value: id }], 1, 0);
    if (usersWithPosition && usersWithPosition.length > 0) {
      return res.status(409).json({
        success: false,
        message: '该职位正在被使用，无法删除'
      });
    }

    try {
      await deleteData('positions', filters);

      res.json({
        success: true,
        message: '删除职位成功'
      });
    } catch (error) {
      console.error('删除职位失败:', error);
      return res.status(500).json({
        success: false,
        message: '删除职位失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;

