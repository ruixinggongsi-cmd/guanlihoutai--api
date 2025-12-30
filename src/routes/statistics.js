import express from 'express';
import { getSupabaseClient, select } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

const router = express.Router();

// 获取当前用户的基本统计数据
router.get('/user-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    const userId = req.user.id; // 从token中获取用户ID

    if (!userId) {
      return res.status(404).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    try {
      // 查询employee_application_statistics视图获取用户统计数据
      const filters = [
        { type: 'eq', column: 'applicant_id', value: userId }
      ];
      
      const userStats = await select('employee_application_statistics', '*', filters, 1, 0);
      
      if (!userStats || userStats.length === 0) {
        // 如果视图中没有数据，返回默认值
        return res.json({
          success: true,
          data: {
            applicant_id: userId,
            total_expense_amount: 0,
            pending_expense_amount: 0,
            approved_expense_amount: 0,
            rejected_expense_amount: 0,
            total_expense_count: 0,
            pending_expense_count: 0,
            approving_expense_count: 0,
            approving_expense_amount: 0,
            total_equipment_quantity: 0,
            pending_equipment_quantity: 0,
            approved_equipment_quantity: 0,
            rejected_equipment_quantity: 0,
            total_equipment_count: 0,
            pending_equipment_count: 0,
            approving_equipment_count: 0,
            approving_equipment_quantity: 0,
            total_application_value: 0,
            pending_application_value: 0,
            earliest_application_date: null,
            latest_application_date: null,
            application_details: {
              expense: null,
              equipment: null
            }
          },
          message: '获取用户统计数据成功'
        });
      }
      
      const stats = userStats[0];
      
      res.json({
        success: true,
        data: stats,
        message: '获取用户统计数据成功'
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '查询用户统计数据失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取所有用户的统计数据（管理员用）
router.get('/all-users', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, applicantId, department } = req.query;
    const offset = (page - 1) * pageSize;

    try {
      // 基础过滤条件
      let filters = [];
      
      if (applicantId) {
        filters.push({ type: 'eq', column: 'applicant_id', value: applicantId });
      }

      // 排序条件
      const order = { column: 'total_application_value', ascending: false };

      // 查询统计数据
      const statsData = await select('employee_application_statistics', '*', filters, pageSize, offset, order);
      
      // 获取总数
      const totalCount = await select('employee_application_statistics', 'count(*) as total', filters);
      const total = totalCount[0]?.total || 0;

      // 如果需要部门筛选，需要在应用层过滤（因为视图中可能没有部门信息）
      let filteredData = statsData || [];
      if (department) {
        // 这里需要根据实际业务逻辑处理部门筛选
        // 可能需要关联users表来获取部门信息
      }

      res.json({
        success: true,
        data: filteredData,
        pagination: {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(total / pageSize)
        },
        message: '获取用户统计数据成功'
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '查询用户统计数据失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取用户统计数据摘要（简化版）
router.get('/user-summary/:userId', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    try {
      const filters = [
        { type: 'eq', column: 'applicant_id', value: userId }
      ];
      
      const userStats = await select('employee_application_statistics', '*', filters, 1, 0);
      
      if (!userStats || userStats.length === 0) {
        return res.json({
          success: true,
          data: {
            applicant_id: userId,
            total_expense_amount: 0,
            pending_expense_amount: 0,
            total_equipment_quantity: 0,
            pending_equipment_quantity: 0,
            total_application_value: 0, // 仅费用金额
            pending_application_value: 0,   // 仅费用金额
            summary: {
              total_applications: 0,
              pending_applications: 0,
              total_value: 0,
              pending_value: 0
            }
          },
          message: '获取用户统计摘要成功'
        });
      }
      
      const stats = userStats[0];
      
      // 返回简化版数据
      const summaryData = {
        applicant_id: stats.applicant_id,
        total_expense_amount: stats.total_expense_amount,
        pending_expense_amount: stats.pending_expense_amount,
        total_equipment_quantity: stats.total_equipment_quantity,
        pending_equipment_quantity: stats.pending_equipment_quantity,
        total_application_value: stats.total_application_value, // 仅费用金额
        pending_application_value: stats.pending_application_value, // 仅费用金额
        summary: {
          total_applications: stats.total_expense_count + stats.total_equipment_count,
          pending_applications: stats.pending_expense_count + stats.pending_equipment_count,
          total_value: stats.total_application_value, // 仅费用金额
          pending_value: stats.pending_application_value // 仅费用金额
        }
      };

      res.json({
        success: true,
        data: summaryData,
        message: '获取用户统计摘要成功'
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '查询用户统计摘要失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取系统整体统计数据（仪表盘用）
router.get('/dashboard', verifySignatureAndToken, async (req, res, next) => {
  try {
    try {
      // 查询所有用户的统计数据
      const allStats = await select('employee_application_statistics', '*', [], 1000, 0);
      
      if (!allStats || allStats.length === 0) {
        return res.json({
          success: true,
          data: {
            total_users: 0,
            total_applications: 0,
            total_expense_amount: 0,
            pending_expense_amount: 0,
            total_equipment_quantity: 0,
            pending_equipment_quantity: 0,
            statistics_by_status: {
              pending: { count: 0, amount: 0 },
              approved: { count: 0, amount: 0 },
              rejected: { count: 0, amount: 0 },
              approving: { count: 0, amount: 0 }
            }
          },
          message: '获取系统统计数据成功'
        });
      }

      // 计算汇总数据
      const dashboardData = {
        total_users: allStats.length,
        total_applications: allStats.reduce((sum, stat) => 
          sum + stat.total_expense_count + stat.total_equipment_count, 0),
        total_expense_amount: allStats.reduce((sum, stat) => sum + stat.total_expense_amount, 0),
        pending_expense_amount: allStats.reduce((sum, stat) => sum + stat.pending_expense_amount, 0),
        total_equipment_quantity: allStats.reduce((sum, stat) => sum + stat.total_equipment_quantity, 0),
        pending_equipment_quantity: allStats.reduce((sum, stat) => sum + stat.pending_equipment_quantity, 0),
        statistics_by_status: {
          pending: {
            count: allStats.reduce((sum, stat) => sum + stat.pending_expense_count + stat.pending_equipment_count, 0),
            amount: allStats.reduce((sum, stat) => sum + stat.pending_expense_amount, 0) // 仅费用金额
          },
          approved: {
            count: allStats.reduce((sum, stat) => sum + stat.approved_expense_count + stat.approved_equipment_quantity, 0),
            amount: allStats.reduce((sum, stat) => sum + stat.approved_expense_amount, 0)
          },
          rejected: {
            count: allStats.reduce((sum, stat) => sum + stat.rejected_expense_count + stat.rejected_equipment_quantity, 0),
            amount: allStats.reduce((sum, stat) => sum + stat.rejected_expense_amount, 0)
          },
          approving: {
            count: allStats.reduce((sum, stat) => sum + stat.approving_expense_count + stat.approving_equipment_count, 0),
            amount: allStats.reduce((sum, stat) => sum + stat.approving_expense_amount, 0)
          }
        }
      };

      res.json({
        success: true,
        data: dashboardData,
        message: '获取系统统计数据成功'
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '查询系统统计数据失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;