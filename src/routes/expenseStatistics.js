import express from 'express';
import { getSupabaseClient, select } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 用户费用统计相关接口

// 获取用户费用总额统计
router.get('/user-expense-total', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, userName } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_user_expense_total', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_user_name: userName || null
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取用户费用总额统计成功'
    });
    
  } catch (error) {
    console.error('查询用户费用总额统计失败:', error);
    res.status(500).json({
      success: false,
      message: '查询用户费用总额统计失败',
      error: error.message
    });
  }
});

// 获取分类费用统计
router.get('/category-expense-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, mainCategory } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_category_expense_stats', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_main_category: mainCategory || null
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取分类费用统计成功'
    });
    
  } catch (error) {
    console.error('查询分类费用统计失败:', error);
    res.status(500).json({
      success: false,
      message: '查询分类费用统计失败',
      error: error.message
    });
  }
});

// 获取用户分类费用占比
router.get('/user-category-breakdown', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, userName } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_user_category_breakdown', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_user_name: userName || null
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取用户分类费用占比成功'
    });
    
  } catch (error) {
    console.error('查询用户分类费用占比失败:', error);
    res.status(500).json({
      success: false,
      message: '查询用户分类费用占比失败',
      error: error.message
    });
  }
});

// 获取费用概览统计
router.get('/expense-overview', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_expense_overview', {
      p_start_date: startDate,
      p_end_date: endDate
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    // 按统计类型分组数据
    const groupedData = {
      department: result.filter(item => item.stat_type === '部门'),
      category: result.filter(item => item.stat_type === '主分类')
    };
    
    res.json({
      success: true,
      data: groupedData,
      rawData: result,
      message: '获取费用概览统计成功'
    });
  } catch (error) {
    console.error('获取费用概览统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取费用概览统计失败',
      error: error.message
    });
  }
});

// 获取费用统计图表数据（用于图表展示）
router.get('/expense-chart-data', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, chartType = 'pie', userName } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    let chartData = [];
    
    if (chartType === 'userBreakdown' && userName) {
      // 用户分类占比饼图数据
      const { data: breakdownResult, error: breakdownError } = await getSupabaseClient().rpc('get_user_category_breakdown', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_user_name: userName
      });
      
      if (breakdownError) {
        console.error('调用函数失败:', breakdownError);
        throw breakdownError;
      }
      
      chartData = breakdownResult.map(item => ({
        name: item.main_category_name,
        value: parseFloat(item.total_amount),
        percentage: parseFloat(item.percentage_of_total)
      }));
      
    } else if (chartType === 'categoryBar') {
      // 分类柱状图数据
      const { data: categoryResult, error: categoryError } = await getSupabaseClient().rpc('get_category_expense_stats', {
        p_start_date: startDate,
        p_end_date: endDate
      });
      
      if (categoryError) {
        console.error('调用函数失败:', categoryError);
        throw categoryError;
      }
      
      chartData = categoryResult.map(item => ({
        category: item.main_category_name,
        amount: parseFloat(item.total_amount),
        count: parseInt(item.application_count)
      }));
      
    } else if (chartType === 'departmentPie') {
      // 部门饼图数据
      const { data: overviewResult, error: overviewError } = await getSupabaseClient().rpc('get_expense_overview', {
        p_start_date: startDate,
        p_end_date: endDate
      });
      
      if (overviewError) {
        console.error('调用函数失败:', overviewError);
        throw overviewError;
      }
      
      // 筛选部门数据
      const departmentData = overviewResult.filter(item => item.stat_type === '部门');
      
      chartData = departmentData.map(item => ({
        name: item.name,
        value: parseFloat(item.total_amount),
        percentage: parseFloat(item.percentage)
      }));
    }
    
    res.json({
      success: true,
      data: chartData,
      chartType,
      message: '获取图表数据成功'
    });
  } catch (error) {
    next(error);
  }
});

// 获取费用趋势数据（按月统计）
router.get('/expense-trend', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    
    const params = [startDate, endDate, groupBy];
    const { data: result, error } = await getSupabaseClient().rpc('get_expense_trend', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_group_by: groupBy
    });
    
    if (error) {
      console.error('调用函数失败:', error);
      throw error;
    }
    
    // 格式化日期
    const formattedResult = result.map(item => ({
      period: item.period,
      periodFormatted: new Date(item.period).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: groupBy === 'day' ? 'numeric' : undefined
      }),
      total_amount: parseFloat(item.total_amount),
      application_count: parseInt(item.application_count),
      avg_amount: parseFloat(item.avg_amount)
    }));
    
    res.json({
      success: true,
      data: formattedResult,
      message: '获取费用趋势数据成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;