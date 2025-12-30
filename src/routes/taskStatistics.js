import express from 'express';
import { getSupabaseClient } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

const router = express.Router();

// 获取用户任务基本统计信息
// 对应数据库函数：get_user_task_statistics
router.get('/basic-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { role_type = 'assignee' } = req.query; // 'assignee' 或 'creator'

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 验证角色类型参数
    if (!['assignee', 'creator'].includes(role_type)) {
      return res.status(400).json({
        success: false,
        message: 'role_type参数必须是 "assignee" 或 "creator"'
      });
    }

    try {
      const client = getSupabaseClient();
      
      // 调用PostgreSQL函数获取用户任务统计
      const { data, error } = await client
        .rpc('get_user_task_statistics', {
          p_user_id: userId,
          p_role_type: role_type
        });

      if (error) {
        console.error('调用任务统计函数失败:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        // 如果没有数据，返回默认值
        return res.json({
          success: true,
          data: {
            total_tasks: 0,
            in_progress_tasks: 0,
            completed_tasks: 0,
            wait_tasks: 0,
            pending_tasks: 0,
            cancelled_tasks: 0,
            overdue_tasks: 0
          },
          message: '获取任务统计成功'
        });
      }

      const stats = data[0];
      
      res.json({
        success: true,
        data: {
          total_tasks: stats.total_tasks || 0,
          in_progress_tasks: stats.in_progress_tasks || 0,
          completed_tasks: stats.completed_tasks || 0,
          wait_tasks: stats.wait_tasks || 0,
          pending_tasks: stats.pending_tasks || 0,
          cancelled_tasks: stats.cancelled_tasks || 0,
          overdue_tasks: stats.overdue_tasks || 0
        },
        message: '获取任务统计成功'
      });
      
    } catch (error) {
      console.error('查询任务统计失败:', error);
      return res.status(500).json({
        success: false,
        message: '查询任务统计失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取用户任务优先级统计信息
// 对应数据库函数：get_user_task_priority_statistics
router.get('/priority-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { role_type = 'assignee' } = req.query; // 'assignee' 或 'creator'

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 验证角色类型参数
    if (!['assignee', 'creator'].includes(role_type)) {
      return res.status(400).json({
        success: false,
        message: 'role_type参数必须是 "assignee" 或 "creator"'
      });
    }

    try {
      const client = getSupabaseClient();
      
      // 调用PostgreSQL函数获取用户任务优先级统计
      const { data, error } = await client
        .rpc('get_user_task_priority_statistics', {
          p_user_id: userId,
          p_role_type: role_type
        });

      if (error) {
        console.error('调用任务优先级统计函数失败:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        // 如果没有数据，返回空数组
        return res.json({
          success: true,
          data: [],
          message: '获取任务优先级统计成功'
        });
      }

      // 格式化返回数据
      const priorityStats = data.map(item => ({
        priority: item.priority || 'unknown',
        task_count: item.task_count || 0,
        percentage: item.percentage || 0
      }));
      
      res.json({
        success: true,
        data: priorityStats,
        message: '获取任务优先级统计成功'
      });
      
    } catch (error) {
      console.error('查询任务优先级统计失败:', error);
      return res.status(500).json({
        success: false,
        message: '查询任务优先级统计失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;