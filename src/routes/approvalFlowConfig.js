import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

const router = express.Router();

// 获取审批流程配置列表（分页）
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword = '', type, status } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'flow_name', value: keyword },
        { type: 'ilike', column: 'description', value: keyword },
        { type: 'ilike', column: 'creator', value: keyword }
      );
    }

    // 构建AND过滤条件
    const filters = [];
    if (type && type !== 'all') {
      filters.push({ type: 'eq', column: 'flow_type', value: type });
    }
    if (status && status !== 'all') {
      filters.push({ type: 'eq', column: 'status', value: status });
    }

    // 排序条件
    const order = { column: 'created_at', ascending: false };

    try {
      // 使用封装的select函数查询数据
      const data = await select('approval_flow_config', '*', filters, pageSize, offset, order, orFilters);
      
      // 获取总数
      const totalCount = await count('approval_flow_config', filters, orFilters);

      res.json({
        success: true,
        data: data || [],
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取审批流程配置列表成功'
      });
    } catch (error) {
      console.error('获取审批流程配置列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取审批流程配置列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取单个审批流程配置详情 - 必须放在具体路由之后
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const flowData = await select('approval_flow_config', '*', filters, 1, 0);
      
      if (!flowData || flowData.length === 0) {
        return res.status(404).json({
          success: false,
          message: '审批流程配置不存在'
        });
      }
      
      const flow = flowData[0];

      res.json({
        success: true,
        data: flow,
        message: '获取审批流程配置详情成功'
      });
    } catch (error) {
      console.error('获取审批流程配置详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取审批流程配置详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 创建审批流程配置
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { flow_name, flow_type, description, status = 'active', nodes = [], creator } = req.body;

    // 检查流程名称是否已存在
    const filters = [{ type: 'eq', column: 'flow_name', value: flow_name }];
    
    try {
      const existingFlow = await select('approval_flow_config', 'id', filters, 1, 0);
      
      if (existingFlow && existingFlow.length > 0) {
        return res.status(409).json({
          success: false,
          message: '流程名称已存在'
        });
      }
    } catch (error) {
      console.error('检查流程名称失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查流程名称失败',
        error: error.message
      });
    }

    // 验证节点数据格式
    if (!Array.isArray(nodes)) {
      return res.status(400).json({
        success: false,
        message: '节点数据格式错误'
      });
    }

    // 创建流程配置
    const flowData = {
      flow_name,
      flow_type,
      description: description || '',
      status: status || 'active',
      nodes: nodes, // 转换为JSON字符串存储
      creator: creator || '系统管理员',
      created_at: new Date().toISOString()
    };

    try {
      const data = await insert('approval_flow_config', flowData);
      
      res.status(201).json({
        success: true,
        data: data[0],
        message: '创建审批流程配置成功'
      });
    } catch (error) {
      console.error('创建审批流程配置失败:', error);
      return res.status(500).json({
        success: false,
        message: '创建审批流程配置失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新审批流程配置
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { flow_name, flow_type, description, status, nodes } = req.body;

    // 检查流程是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingFlow = await select('approval_flow_config', 'id', filters, 1, 0);
      
      if (!existingFlow || existingFlow.length === 0) {
        return res.status(404).json({
          success: false,
          message: '审批流程配置不存在'
        });
      }
    } catch (error) {
      console.error('检查流程失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查流程失败',
        error: error.message
      });
    }

    // 如果修改了流程名称，检查是否已存在
    if (flow_name) {
      const nameFilters = [
        { type: 'eq', column: 'flow_name', value: flow_name },
        { type: 'neq', column: 'id', value: id }
      ];
      
      try {
        const existingName = await select('approval_flow_config', 'id', nameFilters, 1, 0);
        
        if (existingName && existingName.length > 0) {
          return res.status(409).json({
            success: false,
            message: '流程名称已存在'
          });
        }
      } catch (error) {
        console.error('检查流程名称失败:', error);
        return res.status(500).json({
          success: false,
          message: '检查流程名称失败',
          error: error.message
        });
      }
    }

    // 构建更新数据
    const updateData = {};
    if (flow_name !== undefined) updateData.flow_name = flow_name;
    if (flow_type !== undefined) updateData.flow_type = flow_type;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (nodes !== undefined) {
      updateData.nodes = nodes;
    }

    try {
      const data = await update('approval_flow_config', updateData, filters);
      
      res.json({
        success: true,
        data: data[0],
        message: '更新审批流程配置成功'
      });
    } catch (error) {
      console.error('更新审批流程配置失败:', error);
      return res.status(500).json({
        success: false,
        message: '更新审批流程配置失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 删除审批流程配置
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查流程是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingFlow = await select('approval_flow_config', 'id', filters, 1, 0);
      
      if (!existingFlow || existingFlow.length === 0) {
        return res.status(404).json({
          success: false,
          message: '审批流程配置不存在'
        });
      }
    } catch (error) {
      console.error('检查流程失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查流程失败',
        error: error.message
      });
    }

    try {
      await deleteData('approval_flow_config', filters);
      
      res.json({
        success: true,
        message: '删除审批流程配置成功'
      });
    } catch (error) {
      console.error('删除审批流程配置失败:', error);
      return res.status(500).json({
        success: false,
        message: '删除审批流程配置失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 更新流程状态
router.patch('/:id/status', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 检查流程是否存在
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      const existingFlow = await select('approval_flow_config', 'id', filters, 1, 0);
      
      if (!existingFlow || existingFlow.length === 0) {
        return res.status(404).json({
          success: false,
          message: '审批流程配置不存在'
        });
      }
    } catch (error) {
      console.error('检查流程失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查流程失败',
        error: error.message
      });
    }

    try {
      const data = await update('approval_flow_config', { status:status }, filters);
      
      res.json({
        success: true,
        data: data[0],
        message: '更新流程状态成功'
      });
    } catch (error) {
      console.error('更新流程状态失败:', error);
      return res.status(500).json({
        success: false,
        message: '更新流程状态失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;