import express from 'express';
import { select, insert, update, deleteData, count } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { default as OperationLogger } from '../utils/operationLogger.js';

const operationLogger = new OperationLogger();

const router = express.Router();

// 获取任务列表
router.get('/list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      pageSize = 10, 
      status, 
      priority, 
      taskType,
      search,
      assignedToMe,
      createdByMe,
      executionProgress
    } = req.query;
    
    const offset = (page - 1) * pageSize;
    
    // 构建查询条件
    const filters = [];
    
    // 状态筛选
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    
    // 优先级筛选
    if (priority) {
      filters.push({ type: 'eq', column: 'priority', value: priority });
    }
    
    // 任务类型筛选
    if (taskType) {
      filters.push({ type: 'eq', column: 'task_type', value: taskType });
    }
    
    // 执行进度筛选
    if (executionProgress !== undefined) {
      filters.push({ type: 'eq', column: 'execution_progress', value: executionProgress });
    }
    
    // 搜索条件
    if (search) {
      filters.push({ type: 'ilike', column: 'task_name', value: `%${search}%` });
    }
    
    // 分配给我的任务
    if (assignedToMe === 'true') {
      filters.push({ type: 'eq', column: 'assignee_id', value: userId });
    }
    
    // 我创建的任务
    if (createdByMe === 'true') {
      filters.push({ type: 'eq', column: 'creator_id', value: userId });
    }
    
    // 排序：按优先级和创建时间
    const order ={ column: 'due_date', ascending: true };
    
    // 查询任务列表
    const taskList = await select('user_tasks', '*', filters, pageSize, offset, order);
    
    // 获取总数
    const total = await count('user_tasks', filters);
    
    // 获取相关用户信息
    const userIds = [...new Set([
      ...taskList.map(task => task.assignee_id),
      ...taskList.map(task => task.creator_id)
    ].filter(id => id !== null))];
    
    let userMap = {};
    if (userIds.length > 0) {
      const userFilters = [{ type: 'in', column: 'id', value: userIds }];
      const users = await select('users', 'id, username, name', userFilters);
      userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});
    }
    
    // 构建返回数据
    const data = taskList.map(task => ({
      id: task.id,
      title: task.task_name,
      description: task.task_description,
      taskType: task.task_type,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignee_id,
      dueDate: task.due_date,
     
      executionProgress: task.execution_progress,
      createdBy: task.creator_id,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      creatorName: task.creator_name,
      assigneeName: task.assignee_name,
      assigneeDepartmentId: task.assignee_department_id,
      assignedUser: userMap[task.assignee_id] || null,
      createdUser: userMap[task.creator_id] || null
    }));
    
    res.json({
      success: true,
      data: data,
      pagination: {
        total: total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      },
      message: '获取任务列表成功'
    });
    
  } catch (error) {
    console.error('获取任务列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取任务列表失败',
      error: error.message
    });
  }
});

// 获取任务详情
router.get('/:id/details', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 查询任务详情
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);
    
    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const task = taskData[0];
    
    // 查询任务执行明细
    const executionFilters = [{ type: 'eq', column: 'task_id', value: id }];
    const executionOrder = { column: 'created_at', ascending: false };
    const executions = await select('user_task_execution_details', '*', executionFilters, null, 0, executionOrder);

    // 获取相关用户信息
    const userIds = [
      task.assignee_id,
      task.creator_id,
      ...executions.map(exec => exec.executor_id)
    ].filter(id => id !== null);

    let userMap = {};
    if (userIds.length > 0) {
      const userFilters = [{ type: 'in', column: 'id', value: [...new Set(userIds)] }];
      const users = await select('users', 'id, username, name', userFilters);
      userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});
    }

    // 构建返回数据
    const result = {
      id: task.id,
      title: task.task_name,
      description: task.task_description,
      taskType: task.task_type,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignee_id,
      dueDate: task.due_date,
     
      executionProgress: task.execution_progress,
      createdBy: task.creator_id,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      creatorName: task.creator_name,
      assigneeName: task.assignee_name,
      assigneeDepartmentId: task.assignee_department_id,
      assignedUser: userMap[task.assignee_id] || null,
      createdUser: userMap[task.creator_id] || null,
      executions: executions.map(exec => ({
        id: exec.id,
        taskId: exec.task_id,
        actionType: exec.action_type,
        actionDescription: exec.action_description,
        statusBefore: exec.status_before,
        statusAfter: exec.status_after,
        comment: exec.comment,
        executedBy: exec.executor_id,
        executedUser: userMap[exec.executor_id] || null,
        currentProgress: exec.current_progress,
        createdAt: exec.created_at
      }))
    };
    
    res.json({
      success: true,
      data: result,
      message: '获取任务详情成功'
    });
    
  } catch (error) {
    console.error('获取任务详情失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取任务详情失败',
      error: error.message
    });
  }
});

// 创建任务
router.post('/', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      title,
      description,
      taskType,
      priority = 'medium',
      status = 'pending',
      assignedTo,
      dueDate,
      executionProgress = 0,
      assigneeName,
      assigneeDepartmentId
    } = req.body;
    
    // 参数验证
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: '任务标题不能为空'
      });
    }
    
    if (!taskType || !taskType.trim()) {
      return res.status(400).json({
        success: false,
        message: '任务类型不能为空'
      });
    }
    
    // 执行进度验证
    if (executionProgress !== undefined && (executionProgress < 0 || executionProgress > 100)) {
      return res.status(400).json({
        success: false,
        message: '执行进度必须在0-100之间'
      });
    }
    
    const now = new Date().toISOString();
    
    // 构建任务数据
    const taskData = {
      task_name: title.trim(),
      task_description: description?.trim() || '',
      task_type: taskType.trim(),
      priority: priority,
      status: assignedTo ? '1_wait' : '2_pending', // 如果指定了负责人，则状态为待执行
      assignee_id: assignedTo || null,
      assignee_name: assigneeName || null,
      assignee_department_id: assigneeDepartmentId || null,
      due_date: dueDate || null,
      creator_id: userId,
      creator_name:req.user.name,
      created_at: now,
      updated_at: now,
      execution_progress: executionProgress
    };
    
    // 创建任务
    const result = await insert('user_tasks', taskData);
    const taskId = result[0].id;
    
    // 记录数据变更日志
    await operationLogger.recordDataChange({
      tableName: 'user_tasks',
      operation: 'create',
      recordId: taskId,
      newData: result[0],
      success: true
    }, req);
    
    res.json({
      success: true,
      data: { id: taskId },
      message: '任务创建成功'
    });
    
  } catch (error) {
    console.error('创建任务失败:', error);
    return res.status(500).json({
      success: false,
      message: '创建任务失败',
      error: error.message
    });
  }
});

// 更新任务
router.put('/:id', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      title,
      description,
      taskType,
      priority,
     
      assignedTo,
      dueDate,
      executionProgress,
      assigneeName,
      assigneeDepartmentId
    } = req.body;
    
    // 查询原任务
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);
    
    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const originalTask = taskData[0];
    const now = new Date().toISOString();
    
    // 构建更新数据
    const updateData = {
      updated_at: now
    };
    
    // 只更新提供的字段
    if (title !== undefined) updateData.task_name = title.trim();
    if (description !== undefined) updateData.task_description = description?.trim() || '';
    if (priority !== undefined) updateData.priority = priority;
   
    if (assignedTo !== undefined) updateData.assignee_id = assignedTo || null;
    if (assigneeName !== undefined) updateData.assignee_name = assigneeName || null;
    if (assigneeDepartmentId !== undefined) updateData.assignee_department_id = assigneeDepartmentId || null;
    if (dueDate !== undefined) updateData.due_date = dueDate || null;
    if (executionProgress !== undefined) updateData.execution_progress = executionProgress;
    
    // 更新任务
    await update('user_tasks', updateData, taskFilters);
    
    // 记录数据变更日志
    await operationLogger.recordDataChange({
      tableName: 'user_tasks',
      operation: 'update',
      recordId: id,
      oldData: originalTask,
      newData: { ...originalTask, ...updateData },
      success: true
    }, req);

    res.json({
      success: true,
      message: '任务更新成功'
    });
    
  } catch (error) {
    console.error('更新任务失败:', error);
    return res.status(500).json({
      success: false,
      message: '更新任务失败',
      error: error.message
    });
  }
});

// 更新任务状态
router.put('/:id/status', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { status } = req.body;
    
    // 参数验证
    if (!status || !status.trim()) {
      return res.status(400).json({
        success: false,
        message: '状态不能为空'
      });
    }
    
    const validStatuses = ['2_pending', '1_wait', '0_in_progress', '3_completed', '4_cancelled', '5_failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: '无效的状态值'
      });
    }
    
    // 查询原任务
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);
    
    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const originalTask = taskData[0];
    const now = new Date().toISOString();
    
    // 更新任务状态
    const updateData = {
      status: status,
      updated_at: now
    };
    
    // 如果是开始状态（进行中），则设置开始时间
    if (status === '0_in_progress' && originalTask.status !== '0_in_progress') {
      updateData.start_time = now;
    }
    
    // 如果是完成状态，则设置完成时间
    if (status === '3_completed' && originalTask.status !== '3_completed') {
      updateData.completed_at = now;
    }
    
    await update('user_tasks', updateData, taskFilters);
    
    // 记录数据变更日志
    await operationLogger.recordDataChange({
      tableName: 'user_tasks',
      operation: 'update_status',
      recordId: id,
      oldData: originalTask,
      newData: { ...originalTask, status: status, ...updateData },
      success: true
    }, req);
  
    res.json({
      success: true,
      message: '任务状态更新成功'
    });
    
  } catch (error) {
    console.error('更新任务状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '更新任务状态失败',
      error: error.message
    });
  }
});

// 分配任务
router.put('/:id/assign', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { assignedTo, assigneeName, assigneeDepartmentId } = req.body;
    
    // 参数验证
    if (!assignedTo || !assignedTo.trim()) {
      return res.status(400).json({
        success: false,
        message: '分配对象不能为空'
      });
    }
    
    // 查询原任务
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);
    
    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const originalTask = taskData[0];
    const now = new Date().toISOString();
    
    // 更新任务分配
    const updateData = {
      assignee_id: assignedTo,
      assignee_name: assigneeName || null,
      assignee_department_id: assigneeDepartmentId || null,
      updated_at: now
    };
    
    await update('user_tasks', updateData, taskFilters);
    
    // 记录数据变更日志
    await operationLogger.recordDataChange({
      tableName: 'user_tasks',
      operation: 'assign',
      recordId: id,
      oldData: originalTask,
      newData: { ...originalTask, ...updateData },
      success: true
    }, req);
    
    res.json({
      success: true,
      message: '任务分配成功'
    });
    
  } catch (error) {
    console.error('分配任务失败:', error);
    return res.status(500).json({
      success: false,
      message: '分配任务失败',
      error: error.message
    });
  }
});

// 删除任务
router.delete('/:id/delete', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // 查询任务
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);
    
    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const task = taskData[0];
    
    // 只能删除自己创建的任务
    if (task.creator_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '只能删除自己创建的任务'
      });
    }
    
    // 只能删除特定状态的任务
    const deletableStatuses = ['pending', 'cancelled'];
    if (!deletableStatuses.includes(task.status)) {
      return res.status(400).json({
        success: false,
        message: '当前状态的任务不能删除'
      });
    }
    
    const now = new Date().toISOString();
    // 删除任务（软删除，实际更新状态）
    const updateData = {
      status: 'deleted',
      updated_at: now
    };
    
    await update('user_tasks', updateData, taskFilters);
    
    // 记录数据变更日志
    await operationLogger.recordDataChange({
      tableName: 'user_tasks',
      operation: 'delete',
      recordId: id,
      oldData: task,
      newData: { ...task, status: 'deleted', updated_at: now },
      success: true
    }, req);
    
    res.json({
      success: true,
      message: '任务删除成功'
    });
    
  } catch (error) {
    console.error('删除任务失败:', error);
    return res.status(500).json({
      success: false,
      message: '删除任务失败',
      error: error.message
    });
  }
});

// 获取任务统计信息
router.get('/statistics/summary', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // 我的任务统计 - 按状态分组统计
    const myTaskStats = {};
    const statuses = ['pending', 'wait', 'in_progress', 'completed', 'cancelled', 'on_hold'];
    
    for (const status of statuses) {
      const countResult = await count('user_tasks', [
        { type: 'eq', column: 'assignee_id', value: userId },
        { type: 'eq', column: 'status', value: status }
      ]);
      myTaskStats[status] = countResult;
    }
    
    // 我创建的任务统计 - 按状态分组统计
    const myCreatedTaskStats = {};
    
    for (const status of statuses) {
      const countResult = await count('user_tasks', [
        { type: 'eq', column: 'creator_id', value: userId },
        { type: 'eq', column: 'status', value: status }
      ]);
      myCreatedTaskStats[status] = countResult;
    }
    
    // 今日到期任务
    const today = new Date().toISOString().split('T')[0];
    const todayDueCount = await count('user_tasks', [
      { type: 'eq', column: 'assignee_id', value: userId },
      { type: 'eq', column: 'due_date', value: today },
      { type: 'neq', column: 'status', value: 'completed' },
      { type: 'neq', column: 'status', value: 'deleted' }
    ]);
    
    // 逾期任务
    const overdueCount = await count('user_tasks', [
      { type: 'eq', column: 'assignee_id', value: userId },
      { type: 'lt', column: 'due_date', value: today },
      { type: 'neq', column: 'status', value: 'completed' },
      { type: 'neq', column: 'status', value: 'deleted' }
    ]);
    
    res.json({
      success: true,
      data: {
        myTasks: {
          total: Object.values(myTaskStats).reduce((sum, count) => sum + count, 0),
          pending: myTaskStats.pending || 0,
          inProgress: myTaskStats.in_progress || 0,
          completed: myTaskStats.completed || 0,
          cancelled: myTaskStats.cancelled || 0,
          onHold: myTaskStats.on_hold || 0
        },
        myCreatedTasks: {
          total: Object.values(myCreatedTaskStats).reduce((sum, count) => sum + count, 0),
          pending: myCreatedTaskStats.pending || 0,
          inProgress: myCreatedTaskStats.in_progress || 0,
          completed: myCreatedTaskStats.completed || 0,
          cancelled: myCreatedTaskStats.cancelled || 0,
          onHold: myCreatedTaskStats.on_hold || 0
        },
        todayDue: todayDueCount,
        overdue: overdueCount
      },
      message: '获取任务统计成功'
    });
    
  } catch (error) {
    console.error('获取任务统计失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取任务统计失败',
      error: error.message
    });
  }
});

// 更新任务进度
router.put('/:id/progress', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { executionProgress, comment = '' } = req.body;
    
    // 参数验证
    if (executionProgress === undefined || executionProgress === null) {
      return res.status(400).json({
        success: false,
        message: '执行进度不能为空'
      });
    }
    
    if (executionProgress < 0 || executionProgress > 100) {
      return res.status(400).json({
        success: false,
        message: '执行进度必须在0-100之间'
      });
    }
    
    // 查询原任务
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);
    
    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    const originalTask = taskData[0];
    const now = new Date().toISOString();
    
    // 更新任务进度
    const updateData = {
      execution_progress: executionProgress,
      updated_at: now
    };
    
    await update('user_tasks', updateData, taskFilters);
    
    // 记录数据变更日志
    await operationLogger.recordDataChange({
      tableName: 'user_tasks',
      operation: 'update_progress',
      recordId: id,
      oldData: originalTask,
      newData: { ...originalTask, execution_progress: executionProgress, updated_at: now },
      success: true
    }, req);
    
    // 记录进度更新日志
    const executionData = {
      task_id: id,
      action_type: 'progress_update',
      action_description: `进度更新: ${originalTask.execution_progress}% → ${executionProgress}%`,
      status_before: originalTask.status,
      status_after: originalTask.status,
      comment: comment.trim(),
      executor_id: userId,
      created_at: now,
      current_progress: executionProgress
    };
    
    await insert('user_task_execution_details', executionData);
    
    res.json({
      success: true,
      message: '任务进度更新成功'
    });
    
  } catch (error) {
    console.error('更新任务进度失败:', error);
    return res.status(500).json({
      success: false,
      message: '更新任务进度失败',
      error: error.message
    });
  }
});

// 获取任务进度历史
router.get('/:id/progress-history', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20 } = req.query;
    
    const limit = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * limit;
    const order = { column: 'created_at', ascending: false };
    // 查询进度更新记录
    const progressRecords = await select('user_task_execution_details', '*', [
      { type: 'eq', column: 'task_id', value: id },
      { type: 'eq', column: 'action_type', value: 'progress_update' }
    ], limit, offset, order);
    
    // 获取执行记录的用户信息
    const userIds = progressRecords.map(record => record.executor_id).filter(Boolean);
    let userMap = {};
    if (userIds.length > 0) {
      const users = await select('users', 'id, username, name', [
        { type: 'in', column: 'id', value: userIds }
      ]);
      userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});
    }
    
    // 构建返回数据
    const result = progressRecords.map(record => ({
      id: record.id,
      taskId: record.task_id,
      actionType: record.action_type,
      actionDescription: record.action_description,
      comment: record.comment,
      executedBy: record.executor_id,
      executedUser: userMap[record.executor_id] || null,
      currentProgress: record.current_progress,
      createdAt: record.created_at
    }));
    
    // 获取总记录数
    const totalCount = await count('user_task_execution_details', [
      { type: 'eq', column: 'task_id', value: id }
    ]);
    
    res.json({
      success: true,
      data: {
        records: result,
        pagination: {
          page: parseInt(page),
          pageSize: limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('获取任务进度历史失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取任务进度历史失败',
      error: error.message
    });
  }
});



// 获取任务进度统计
router.get('/stats/progress', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { taskType, status } = req.query;
    
    // 构建查询条件
    const filters = [];
    
    // 任务类型筛选
    if (taskType) {
      filters.push({ type: 'eq', column: 'task_type', value: taskType });
    }
    
    // 状态筛选
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    
    // 排除已删除的任务
    filters.push({ type: 'neq', column: 'status', value: 'deleted' });
    
    // 获取当前用户的任务
    filters.push({ type: 'eq', column: 'assignee_id', value: userId });
    
    // 查询任务进度分布 - 使用select查询获取进度分布
    const progressStats = await select('user_tasks', 'execution_progress, count(*) as count', filters);
    
    // 查询平均进度
    const avgProgress = await select('user_tasks', 'avg(execution_progress) as avg_progress', filters);
    
    // 查询进度区间统计
    const progressRanges = [
      { name: '未开始', min: 0, max: 0 },
      { name: '进行中(1-25%)', min: 1, max: 25 },
      { name: '进行中(26-50%)', min: 26, max: 50 },
      { name: '进行中(51-75%)', min: 51, max: 75 },
      { name: '进行中(76-99%)', min: 76, max: 99 },
      { name: '已完成(100%)', min: 100, max: 100 }
    ];
    
    const rangeStats = [];
    for (const range of progressRanges) {
      const rangeFilters = [...filters];
      if (range.min === range.max) {
        rangeFilters.push({ type: 'eq', column: 'execution_progress', value: range.min });
      } else {
        rangeFilters.push({ type: 'gte', column: 'execution_progress', value: range.min });
        rangeFilters.push({ type: 'lte', column: 'execution_progress', value: range.max });
      }
      
      const rangeCount = await count('user_tasks', rangeFilters);
      rangeStats.push({
        name: range.name,
        count: rangeCount,
        percentage: avgProgress[0].avg_progress ? Math.round((rangeCount / progressStats.reduce((sum, stat) => sum + stat.count, 0)) * 100) : 0
      });
    }
    
    res.json({
      success: true,
      data: {
        totalTasks: progressStats.reduce((sum, stat) => sum + stat.count, 0),
        averageProgress: avgProgress[0].avg_progress ? Math.round(avgProgress[0].avg_progress) : 0,
        progressDistribution: progressStats,
        rangeStats: rangeStats
      }
    });
    
  } catch (error) {
    console.error('获取任务进度统计失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取任务进度统计失败',
      error: error.message
    });
  }
});

// 添加任务执行记录
router.post('/:id/executions', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      actionType,
      actionDescription,
      statusAfter,
      currentProgress
    } = req.body;
    let updateCurrentProgress=currentProgress;
    // 参数验证
    if (!actionType || !actionType.trim()) {
      return res.status(400).json({
        success: false,
        message: '操作类型不能为空'
      });
    }

    if (!actionDescription || !actionDescription.trim()) {
      return res.status(400).json({
        success: false,
        message: '操作描述不能为空'
      });
    }

    if (currentProgress !== undefined && (currentProgress < 0 || currentProgress > 100)) {
      return res.status(400).json({
        success: false,
        message: '执行进度必须在0-100之间'
      });
    }

    // 查询原任务
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);

    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    const originalTask = taskData[0];
    const now = new Date().toISOString();

    // 如果有状态变更，同步更新任务状态
    const updateTaskData = {};
    if (statusAfter && statusAfter !== originalTask.status) {
      updateTaskData.status = statusAfter;
      updateTaskData.updated_at = now;
      
      // 如果是完成状态，设置完成时间和进度
      if (statusAfter === '3_completed') {
        updateTaskData.end_time = now;
        updateTaskData.execution_progress = 100; // 完成时进度设置为100%
        updateCurrentProgress=100;
        
        // 计算总耗时（如果存在开始时间）
        if (originalTask.started_at) {
          const startedTime = new Date(originalTask.started_at).getTime();
          const completedTime = new Date(now).getTime();
          const totalDurationSeconds = Math.floor((completedTime - startedTime) / 1000)-8*3600;
          updateTaskData.actual_duration_seconds = totalDurationSeconds;
        }
      }
    }

    // 如果有进度更新，同步更新任务进度
    if (currentProgress !== undefined && currentProgress !== originalTask.execution_progress) {
      updateTaskData.execution_progress = currentProgress;
      updateTaskData.updated_at = now;
      
      // 如果进度为100%，自动标记为完成状态
      if (currentProgress === 100 && originalTask.status !== '3_completed') {
        updateTaskData.status = '3_completed';
        updateTaskData.end_time = now;
        updateCurrentProgress=100;
        
        // 计算总耗时（如果存在开始时间）
        if (originalTask.started_at) {
          const startedTime = new Date(originalTask.started_at).getTime();
          const completedTime = new Date(now).getTime();
          const totalDurationSeconds = Math.floor((completedTime - startedTime) / 1000);
          updateTaskData.actual_duration_seconds = totalDurationSeconds-8*3600;
        }
      } else if (currentProgress < 100 && originalTask.status !== '0_in_progress') {
        // 如果进度小于100%，则状态改为进行中
        updateTaskData.status = '0_in_progress';
      }
    }

    // 更新任务表
    if (Object.keys(updateTaskData).length > 0) {
      await update('user_tasks', updateTaskData, taskFilters);
    }

    // 创建执行记录
    const executionData = {
      task_id: id,
      action_type: actionType.trim(),
      action_description: actionDescription.trim(),
      executor_id: userId,
      created_at: now,
      current_progress: updateCurrentProgress !== undefined ? updateCurrentProgress : originalTask.execution_progress,
      execution_result: statusAfter === 'completed' ? 'success' : 
                       statusAfter === 'failed' ? 'failure' : 
                       statusAfter === 'cancelled' ? 'cancelled' : 'in_progress'
    };

    const result = await insert('user_task_execution_details', executionData);

    res.json({
      success: true,
      data: { id: result[0].id },
      message: '任务执行记录添加成功'
    });

  } catch (error) {
    console.error('添加任务执行记录失败:', error);
    return res.status(500).json({
      success: false,
      message: '添加任务执行记录失败',
      error: error.message
    });
  }
});

// 修改任务执行记录
router.put('/:id/executions/:executionId', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { id, executionId } = req.params;
    const userId = req.user.id;
    const {
      actionType,
      actionDescription,
      statusAfter,
      currentProgress
    } = req.body;

    // 参数验证
    if (actionType !== undefined && (!actionType || !actionType.trim())) {
      return res.status(400).json({
        success: false,
        message: '操作类型不能为空'
      });
    }

    if (actionDescription !== undefined && (!actionDescription || !actionDescription.trim())) {
      return res.status(400).json({
        success: false,
        message: '操作描述不能为空'
      });
    }

    if (currentProgress !== undefined && (currentProgress < 0 || currentProgress > 100)) {
      return res.status(400).json({
        success: false,
        message: '执行进度必须在0-100之间'
      });
    }

    // 查询原任务
    const taskFilters = [{ type: 'eq', column: 'id', value: id }];
    const taskData = await select('user_tasks', '*', taskFilters, 1, 0);

    if (!taskData || taskData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    const originalTask = taskData[0];

    // 查询执行记录
    const executionFilters = [
      { type: 'eq', column: 'id', value: executionId },
      { type: 'eq', column: 'task_id', value: id }
    ];
    const executionData = await select('user_task_execution_details', '*', executionFilters, 1, 0);

    if (!executionData || executionData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '执行记录不存在'
      });
    }

    const originalExecution = executionData[0];
    const now = new Date().toISOString();

    // 构建更新数据
    const updateData = {
      updated_at: now
    };

    // 只更新提供的字段
    if (actionType !== undefined) updateData.action_type = actionType.trim();
    if (actionDescription !== undefined) updateData.action_description = actionDescription.trim();
    if (currentProgress !== undefined) updateData.current_progress = currentProgress;
    if (statusAfter !== undefined) {
      updateData.execution_result = statusAfter === 'completed' ? 'success' : 
                                 statusAfter === 'failed' ? 'failure' : 
                                 statusAfter === 'cancelled' ? 'cancelled' : 'in_progress';
    }

    // 更新执行记录
    await update('user_task_execution_details', updateData, executionFilters);

    // 如果有状态或进度变更，同步更新任务表
    const updateTaskData = {};
    if (statusAfter && statusAfter !== originalTask.status) {
      updateTaskData.status = statusAfter;
      updateTaskData.updated_at = now;
    }
    if (currentProgress !== undefined && currentProgress !== originalTask.execution_progress) {
      updateTaskData.execution_progress = currentProgress;
      updateTaskData.updated_at = now;
    }

    // 更新任务表
    if (Object.keys(updateTaskData).length > 0) {
      await update('user_tasks', updateTaskData, taskFilters);
    }

    res.json({
      success: true,
      message: '任务执行记录修改成功'
    });

  } catch (error) {
    console.error('修改任务执行记录失败:', error);
    return res.status(500).json({
      success: false,
      message: '修改任务执行记录失败',
      error: error.message
    });
  }
});

// 根据任务等级统计当前登录用户的任务
router.get('/statistics/priority', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { taskType, status } = req.query;
    
    // 优先级列表
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const priorityStats = {};
    
    // 统计每个优先级的任务数量
    for (const priority of priorities) {
      const filters = [
        { type: 'eq', column: 'assignee_id', value: userId },
        { type: 'eq', column: 'priority', value: priority }
      ];
      
      // 任务类型筛选
      if (taskType) {
        filters.push({ type: 'eq', column: 'task_type', value: taskType });
      }
      
      // 状态筛选
      if (status) {
        filters.push({ type: 'eq', column: 'status', value: status });
      } else {
        // 默认排除已删除和已取消的任务
        filters.push({ type: 'neq', column: 'status', value: 'deleted' });
        filters.push({ type: 'neq', column: 'status', value: 'cancelled' });
      }
      
      const countResult = await count('user_tasks', filters);
      priorityStats[priority] = {
        count: countResult,
        label: getPriorityLabel(priority)
      };
    }
    
    // 计算总数和百分比
    const total = Object.values(priorityStats).reduce((sum, item) => sum + item.count, 0);
    
    // 为每个优先级添加百分比
    Object.keys(priorityStats).forEach(priority => {
      priorityStats[priority].percentage = total > 0 ? 
        Math.round((priorityStats[priority].count / total) * 100) : 0;
    });
    
    res.json({
      success: true,
      data: {
        priorities: priorityStats,
        total: total,
        userId: userId
      },
      message: '获取任务优先级统计成功'
    });
    
  } catch (error) {
    console.error('获取任务优先级统计失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取任务优先级统计失败',
      error: error.message
    });
  }
});

// 辅助函数：获取优先级标签
function getPriorityLabel(priority) {
  const labels = {
    'low': '低优先级',
    'medium': '中优先级', 
    'high': '高优先级',
    'urgent': '紧急'
  };
  return labels[priority] || priority;
}

// 获取我的任务（分配给我的任务）
router.get('/my-tasks', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      pageSize = 10, 
      status, 
      priority, 
      search 
    } = req.query;
    
    const offset = (page - 1) * pageSize;
    
    // 构建查询条件 - 分配给我的任务
    const filters = [
      { type: 'eq', column: 'assignee_id', value: userId },
      { type: 'neq', column: 'status', value: 'deleted' }
    ];
    
    // 状态筛选
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    
    // 优先级筛选
    if (priority) {
      filters.push({ type: 'eq', column: 'priority', value: priority });
    }
    
    // 搜索条件
    if (search) {
      filters.push({ type: 'ilike', column: 'task_name', value: `%${search}%` });
    }
    
    // 排序：按优先级和创建时间
    const order = [{ column: 'status', ascending: true }, { column: 'priority', ascending: false }, { column: 'due_date', ascending: false }]; 

    ;
    
    // 查询任务列表
    const taskList = await select('user_tasks', '*', filters, pageSize, offset, order);
    
    // 获取总数
    const total = await count('user_tasks', filters);
    // 获取相关用户信息
    const userIds = [...new Set([
      ...taskList.map(task => task.assignee_id),
      ...taskList.map(task => task.creator_id)
    ].filter(id => id !== null))];
    
    let userMap = {};
    if (userIds.length > 0) {
      const userFilters = [{ type: 'in', column: 'id', value: userIds }];
      const users = await select('users', 'id, username, name', userFilters);
      userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});
    }
    
    // 构建返回数据
    const data = taskList.map(task => ({
      id: task.id,
      title: task.task_name,
      description: task.task_description,
      taskType: task.task_type,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignee_id,
      dueDate: task.due_date,
     
      executionProgress: task.execution_progress,
      createdBy: task.creator_id,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      assignedUser: userMap[task.assignee_id] || null,
      createdUser: userMap[task.creator_id] || null,
      creatorName: task.creator_name,
      assigneeName: task.assignee_name,
      assigneeDepartmentId: task.assignee_department_id
    }));
    
    res.json({
      success: true,
      data: data,
      pagination: {
        total: total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      },
      message: '获取我的任务成功'
    });
    
  } catch (error) {
    console.error('获取我的任务失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取我的任务失败',
      error: error.message
    });
  }
});

// 获取我发布的任务（我创建的任务）
router.get('/published-tasks', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      pageSize = 10, 
      status, 
      priority, 
      search 
    } = req.query;
    
    const offset = (page - 1) * pageSize;
    
    // 构建查询条件 - 我创建的任务
    const filters = [
      { type: 'eq', column: 'creator_id', value: userId },
      { type: 'neq', column: 'status', value: 'deleted' }
    ];
    
    // 状态筛选
    if (status) {
      filters.push({ type: 'eq', column: 'status', value: status });
    }
    
    // 优先级筛选
    if (priority) {
      filters.push({ type: 'eq', column: 'priority', value: priority });
    }
    
    // 搜索条件
    if (search) {
      filters.push({ type: 'ilike', column: 'task_name', value: `%${search}%` });
    }
    
    // 排序：按创建时间倒序
    const order = [{ column: 'status', ascending: true },{ column: 'created_at', ascending: false }];
    
    // 查询任务列表
    const taskList = await select('user_tasks', '*', filters, pageSize, offset, order);
    
    // 获取总数
    const total = await count('user_tasks', filters);
    
    // 获取相关用户信息
    const userIds = [...new Set([
      ...taskList.map(task => task.assignee_id),
      ...taskList.map(task => task.creator_id)
    ].filter(id => id !== null))];
    
    let userMap = {};
    if (userIds.length > 0) {
      const userFilters = [{ type: 'in', column: 'id', value: userIds }];
      const users = await select('users', 'id, username, name', userFilters);
      userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});
    }
    
    // 构建返回数据
    const data = taskList.map(task => ({
      id: task.id,
      title: task.task_name,
      description: task.task_description,
      taskType: task.task_type,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignee_id,
      dueDate: task.due_date,
     
      executionProgress: task.execution_progress,
      createdBy: task.creator_id,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      assignedUser: userMap[task.assignee_id] || null,
      createdUser: userMap[task.creator_id] || null,
      creatorName: task.creator_name,
      assigneeName: task.assignee_name,
      assigneeDepartmentId: task.assignee_department_id
    }));
    
    res.json({
      success: true,
      data: data,
      pagination: {
        total: total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      },
      message: '获取我发布的任务成功'
    });
    
  } catch (error) {
    console.error('获取我发布的任务失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取我发布的任务失败',
      error: error.message
    });
  }
});

export default router;