import express from 'express';
import { getSupabaseClient, select, count, insert, update, deleteData } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';

const operationLogger = new OperationLogger();

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Menu:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         id:
 *           type: integer
 *           description: 菜单ID
 *         name:
 *           type: string
 *           description: 菜单名称
 *         path:
 *           type: string
 *           description: 菜单路径
 *         icon:
 *           type: string
 *           description: 菜单图标（FontAwesome类名）
 *         parent_id:
 *           type: integer
 *           description: 父菜单ID，NULL表示顶级菜单
 *         sort_order:
 *           type: integer
 *           description: 排序权重，数字越大越靠前
 *         type:
 *           type: string
 *           enum: [menu, function]
 *           description: 菜单类型
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           description: 菜单状态
 *         description:
 *           type: string
 *           description: 菜单描述
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: 创建时间
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: 更新时间
 *         created_by:
 *           type: integer
 *           description: 创建人ID
 *         updated_by:
 *           type: integer
 *           description: 更新人ID
 */

/**
 * @swagger
 * tags:
 *   name: Menus
 *   description: 菜单管理接口
 */

/**
 * @swagger
 * /menus/tree:
 *   get:
 *     summary: 获取菜单树结构
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: 按状态筛选
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [menu, function]
 *         description: 按类型筛选
 *     responses:
 *       200:
 *         description: 菜单树获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Menu'
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.get('/tree', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { status, type } = req.query;
    
    // 构建过滤条件
    const filters = [];
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    if (type) {
      filters.push({ type: 'eq', column: 'type', value: type });
    }

    // 排序条件
    const order = { column: 'sort_order', ascending: true };
    
    try {
      // 使用封装的select函数查询数据
      const data = await select('menus', '*', filters, 1000, 0, order);
      
      // 构建树结构
      const buildTree = (menus, parentId = null) => {
        return menus
          .filter(menu => menu.parent_id === parentId)
          .map(menu => ({
            ...menu,
            children: buildTree(menus, menu.id)
          }));
      };

      const treeData = buildTree(data || []);

      res.json({
        success: true,
        data: treeData,
        message: '获取菜单树成功'
      });
    } catch (error) {
      console.error('获取菜单树失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取菜单树失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/list:
 *   get:
 *     summary: 获取菜单列表（分页）
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 每页条数
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: 按状态筛选
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [menu, function]
 *         description: 按类型筛选
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 搜索关键词（名称或路径）
 *     responses:
 *       200:
 *         description: 菜单列表获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Menu'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     pageSize:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, status, type, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建过滤条件
    const filters = [];
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    if (type) {
      filters.push({ type: 'eq', column: 'type', value: type });
    }

    // 构建OR过滤条件（用于搜索）
    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'name', value: keyword },
        { type: 'ilike', column: 'path', value: keyword }
      );
    }

    // 排序条件
    const order = { column: 'sort_order', ascending: false };
    
    try {
      // 使用封装的select函数查询数据
      const data = await select('menus', '*', filters, pageSize, offset, order, orFilters);
      
      // 获取总数
      const totalCount = await count('menus', filters, orFilters);

      res.json({
        success: true,
        data: data || [],
        pagination: {
          total: totalCount,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(totalCount / pageSize)
        },
        message: '获取菜单列表成功'
      });
    } catch (error) {
      console.error('获取菜单列表失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取菜单列表失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/options:
 *   get:
 *     summary: 获取菜单选项（用于下拉选择）
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 菜单选项获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       parent_id:
 *                         type: integer
 *                 message:
 *                   type: string
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.get('/options', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 获取所有菜单，只返回必要字段
    const order = { column: 'sort_order', ascending: false };
    
    try {
      const data = await select('menus', 'id, name, parent_id', [], 1000, 0, order);
      
      res.json({
        success: true,
        data: data || [],
        message: '获取菜单选项成功'
      });
    } catch (error) {
      console.error('获取菜单选项失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取菜单选项失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/{id}:
 *   get:
 *     summary: 获取单个菜单详情
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 菜单ID (UUID格式)
 *     responses:
 *       200:
 *         description: 菜单详情获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Menu'
 *                 message:
 *                   type: string
 *       404:
 *         description: 菜单不存在
 *       500:
 *         description: 服务器错误
 */
router.get('/details/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    try {
      // 使用封装的select函数查询数据
      const data = await select('menus', '*', filters, 1, 0);
      
      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          message: '菜单不存在'
        });
      }

      res.json({
        success: true,
        data: data[0],
        message: '获取菜单详情成功'
      });
    } catch (error) {
      console.error('获取菜单详情失败:', error);
      return res.status(500).json({
        success: false,
        message: '获取菜单详情失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus:
 *   post:
 *     summary: 创建菜单
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: 菜单名称
 *               path:
 *                 type: string
 *                 description: 菜单路径
 *               icon:
 *                 type: string
 *                 description: 菜单图标
 *               parent_id:
 *                 type: integer
 *                 description: 父菜单ID
 *               sort_order:
 *                 type: integer
 *                 description: 排序权重
 *               type:
 *                 type: string
 *                 enum: [menu, function]
 *                 description: 菜单类型
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: 菜单状态
 *               description:
 *                 type: string
 *                 description: 菜单描述
 *     responses:
 *       201:
 *         description: 菜单创建成功
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 服务器错误
 */
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { name, path, icon, parent_id, sort_order = 0, type = 'menu', status = 'active', description } = req.body;

    // 检查父菜单是否存在
    if (parent_id) {
      const filters = [{ type: 'eq', column: 'id', value: parent_id }];
      
      try {
        const parentMenu = await select('menus', 'id', filters, 1, 0);
        
        if (!parentMenu || parentMenu.length === 0) {
          return res.status(400).json({
            success: false,
            message: '父菜单不存在'
          });
        }
      } catch (error) {
        console.error('检查父菜单失败:', error);
        return res.status(500).json({
          success: false,
          message: '检查父菜单失败',
          error: error.message
        });
      }
    }

    // 检查路径是否已存在（如果提供了路径）
    if (path) {
      const pathFilters = [{ type: 'eq', column: 'path', value: path }];
      
      try {
        const existingMenu = await select('menus', 'id', pathFilters, 1, 0);
        
        if (existingMenu && existingMenu.length > 0) {
          return res.status(400).json({
            success: false,
            message: '菜单路径已存在'
          });
        }
      } catch (error) {
        console.error('检查路径失败:', error);
        return res.status(500).json({
          success: false,
          message: '检查路径失败',
          error: error.message
        });
      }
    }

    // 创建菜单数据
    const menuData = {
      name,
      path: path || null,
      icon: icon || null,
      parent_id: parent_id || null,
      sort_order: sort_order || 0,
      type: type || 'menu',
      status: status || 'active',
      description: description || ''
    };
    
    try {
      const insertedData = await insert('menus', menuData);
      const data = insertedData[0]; // insert返回数组，取第一个元素

      // 记录操作日志
      await operationLogger.recordOperation(
        'menus',
        'create',
        {
          menu_id: data.id,
          name: data.name,
          path: data.path,
          icon: data.icon,
          parent_id: data.parent_id,
          type: data.type,
          status: data.status,
          created_by: req.user.id
        },
        req.user.id
      );

      res.status(201).json({
        success: true,
        data,
        message: '菜单创建成功'
      });
    } catch (error) {
      console.error('创建菜单失败:', error);
      return res.status(500).json({
        success: false,
        message: '创建菜单失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/{id}:
 *   put:
 *     summary: 更新菜单
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 菜单ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 菜单名称
 *               path:
 *                 type: string
 *                 description: 菜单路径
 *               icon:
 *                 type: string
 *                 description: 菜单图标
 *               parent_id:
 *                 type: integer
 *                 description: 父菜单ID
 *               sort_order:
 *                 type: integer
 *                 description: 排序权重
 *               type:
 *                 type: string
 *                 enum: [menu, function]
 *                 description: 菜单类型
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: 菜单状态
 *               description:
 *                 type: string
 *                 description: 菜单描述
 *     responses:
 *       200:
 *         description: 菜单更新成功
 *       400:
 *         description: 请求参数错误
 *       404:
 *         description: 菜单不存在
 *       500:
 *         description: 服务器错误
 */
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, path, icon, parent_id, sort_order, type, status, description } = req.body;

    // 检查菜单是否存在
    const filters = [{ type: 'eq', column: 'id', value: id}];
    
    try {
      const existingMenu = await select('menus', 'id', filters, 1, 0);
      
      if (!existingMenu || existingMenu.length === 0) {
        return res.status(404).json({
          success: false,
          message: '菜单不存在'
        });
      }
    } catch (error) {
      console.error('检查菜单失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查菜单失败',
        error: error.message
      });
    }
    // 更新菜单信息
    const updateData = {
    };
    if (name) {
      updateData.name = name;
    }
    if (path) {
      updateData.path = path;
    }
    if (icon) {
      updateData.icon = icon;
    }
    if (parent_id) {
      updateData.parent_id = parent_id;
    }
    if (sort_order) {
      updateData.sort_order = sort_order;
    }
    if (type) {
      updateData.type = type;
    }
    if (status) {
      updateData.status = status;
    }
    if (description) {
      updateData.description = description;
    }
    
    try {
      const updatedData = await update('menus', updateData, filters);
      const data = updatedData[0]; // update返回数组，取第一个元素

      // 记录操作日志
      await operationLogger.recordOperation(
        'menus',
        'update',
        {
          menu_id: id,
          name: updateData.name,
          path: updateData.path,
          icon: updateData.icon,
          parent_id: updateData.parent_id,
          type: updateData.type,
          status: updateData.status,
          updated_by: req.user.id
        },
        req.user.id
      );

      res.json({
        success: true,
        data,
        message: '菜单更新成功'
      });
    } catch (error) {
      console.error('更新菜单失败:', error);
      return res.status(500).json({
        success: false,
        message: '更新菜单失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/{id}:
 *   delete:
 *     summary: 删除菜单
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 菜单ID
 *     responses:
 *       200:
 *         description: 菜单删除成功
 *       400:
 *         description: 存在子菜单，无法删除
 *       404:
 *         description: 菜单不存在
 *       500:
 *         description: 服务器错误
 */
router.delete('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 检查菜单是否存在并获取详细信息
    const filters = [{ type: 'eq', column: 'id', value: id }];
    
    let menuToDelete;
    try {
      const existingMenu = await select('menus', '*', filters, 1, 0);
      if (!existingMenu || existingMenu.length === 0) {
        return res.status(404).json({
          success: false,
          message: '菜单不存在'
        });
      }
      menuToDelete = existingMenu[0];
    } catch (error) {
      console.error('检查菜单失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查菜单失败',
        error: error.message
      });
    }

    // 删除菜单
    try {
      await deleteData('menus', filters);

      // 记录操作日志
      await operationLogger.recordOperation(
        'menus',
        'delete',
        {
          menu_id: id,
          name: menuToDelete.name,
          path: menuToDelete.path,
          deleted_by: req.user.id
        },
        req.user.id
      );

      res.json({
        success: true,
        message: '删除菜单成功'
      });
    } catch (error) {
      console.error('删除菜单失败:', error);
      return res.status(500).json({
        success: false,
        message: '删除菜单失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/check-code:
 *   get:
 *     summary: 检查菜单编码是否已存在
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: 菜单编码（名称）
 *       - in: query
 *         name: exclude_id
 *         schema:
 *           type: integer
 *         description: 排除的菜单ID（用于编辑时）
 *     responses:
 *       200:
 *         description: 检查结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 exists:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 参数错误
 *       500:
 *         description: 服务器错误
 */
router.get('/check-code', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { code, exclude_id } = req.query;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: '请提供菜单编码'
      });
    }

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'name', value: code }];
    
    if (exclude_id) {
      filters.push({ type: 'neq', column: 'id', value: exclude_id });
    }
    
    try {
      const existingMenu = await select('menus', 'id', filters, 1, 0);
      const exists = existingMenu && existingMenu.length > 0;

      res.json({
        success: true,
        exists,
        message: exists ? '菜单编码已存在' : '菜单编码可用'
      });
    } catch (error) {
      console.error('检查菜单编码失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查菜单编码失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/check-path:
 *   get:
 *     summary: 检查菜单路径是否已存在
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: 菜单路径
 *       - in: query
 *         name: exclude_id
 *         schema:
 *           type: integer
 *         description: 排除的菜单ID（用于编辑时）
 *     responses:
 *       200:
 *         description: 检查结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 exists:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 参数错误
 *       500:
 *         description: 服务器错误
 */
router.get('/check-path', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { path, exclude_id } = req.query;
    
    if (!path) {
      return res.status(400).json({
        success: false,
        message: '请提供菜单路径'
      });
    }

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'path', value: path }];
    
    if (exclude_id) {
      filters.push({ type: 'neq', column: 'id', value: exclude_id });
    }
    
    try {
      const existingMenu = await select('menus', 'id', filters, 1, 0);
      const exists = existingMenu && existingMenu.length > 0;

      res.json({
        success: true,
        exists,
        message: exists ? '菜单路径已存在' : '菜单路径可用'
      });
    } catch (error) {
      console.error('检查菜单路径失败:', error);
      return res.status(500).json({
        success: false,
        message: '检查菜单路径失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /menus/batch:
 *   delete:
 *     summary: 批量删除菜单
 *     tags: [Menus]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: 要删除的菜单ID数组
 *     responses:
 *       200:
 *         description: 批量删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 参数错误或存在子菜单
 *       500:
 *         description: 服务器错误
 */
router.delete('/batch', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要删除的菜单ID数组'
      });
    }

    // 验证所有ID是否有效（UUID格式）
    const validIds = ids.filter(id => id && typeof id === 'string' && id.length > 0);
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '无效的菜单ID数组'
      });
    }

    // 检查是否有菜单存在子菜单
    for (const id of validIds) {
      const childrenFilters = [{ type: 'eq', column: 'parent_id', value: id }];
      try {
        const children = await select('menus', 'id', childrenFilters);
        if (children && children.length > 0) {
          return res.status(400).json({
            success: false,
            message: `菜单ID ${id} 存在子菜单，无法批量删除`
          });
        }
      } catch (error) {
        console.error(`检查子菜单失败 (ID: ${id}):`, error);
        return res.status(500).json({
          success: false,
          message: `检查子菜单失败 (ID: ${id})`,
          error: error.message
        });
      }
    }

    // 批量删除菜单
    try {
      const deleteFilters = [{ type: 'in', column: 'id', value: validIds }];
      await deleteData('menus', deleteFilters);

      res.json({
        success: true,
        message: `成功删除 ${validIds.length} 个菜单`
      });
    } catch (error) {
      console.error('批量删除菜单失败:', error);
      return res.status(500).json({
        success: false,
        message: '批量删除菜单失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;