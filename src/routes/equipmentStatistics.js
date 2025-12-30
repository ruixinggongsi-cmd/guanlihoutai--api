import express from 'express';
import { getSupabaseClient } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

const router = express.Router();

// 设备申请统计相关接口

// 获取用户设备申请总量统计
router.get('/user-equipment-total', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, userName } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_user_equipment_total', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_user_name: userName || null
    });
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取用户设备申请总量统计成功'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '查询用户设备申请总量统计失败',
      error: error.message
    });
  }
});

// 获取设备分类申请统计
router.get('/category-equipment-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, mainCategory } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_equipment_category_stats', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_main_category: mainCategory || null
    });
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取设备分类申请统计成功'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '查询设备分类申请统计失败',
      error: error.message
    });
  }
});

// 获取用户设备分类申请明细
router.get('/user-equipment-category-breakdown', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { userName } = req.query;
    
  

    const { data: result, error } = await getSupabaseClient().rpc('get_user_equipment_category_breakdown', {
      p_user_name: userName
    });
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      data: result,
      message: '获取用户设备分类申请明细成功'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '查询用户设备分类申请明细失败',
      error: error.message
    });
  }
});

// 获取设备申请概览统计
router.get('/equipment-overview', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_equipment_overview', {
      p_start_date: startDate,
      p_end_date: endDate
    });
    
    if (error) {
      throw error;
    }
    
    // 按统计类型分组数据
    const groupedData = {
      department: result.filter(item => item.stat_type === '部门')
    };
    
    res.json({
      success: true,
      data: groupedData,
      rawData: result,
      message: '获取设备申请概览统计成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取设备申请概览统计失败',
      error: error.message
    });
  }
});

// 获取设备申请趋势数据
router.get('/equipment-trend', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    const { data: result, error } = await getSupabaseClient().rpc('get_equipment_trend', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_group_by: groupBy
    });
    
    if (error) {
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
      total_quantity: parseInt(item.total_quantity),
      application_count: parseInt(item.application_count),
      avg_quantity: parseFloat(item.avg_quantity)
    }));
    
    res.json({
      success: true,
      data: formattedResult,
      message: '获取设备申请趋势数据成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取设备申请趋势数据失败',
      error: error.message
    });
  }
});

// 获取设备申请统计图表数据（用于图表展示）
router.get('/equipment-chart-data', verifySignatureAndToken, async (req, res, next) => {
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
      // 用户设备分类占比饼图数据
      const { data: breakdownResult, error: breakdownError } = await getSupabaseClient().rpc('get_user_equipment_category_breakdown', {
        p_user_name: userName
      });
      
      if (breakdownError) {
        throw breakdownError;
      }
      
      chartData = breakdownResult.map(item => ({
        name: item.main_category_name,
        value: parseInt(item.total_quantity),
        percentage: parseFloat(item.percentage_of_total)
      }));
      
    } else if (chartType === 'categoryBar') {
      // 设备分类柱状图数据
      const { data: categoryResult, error: categoryError } = await getSupabaseClient().rpc('get_equipment_category_stats', {
        p_start_date: startDate,
        p_end_date: endDate
      });
      
      if (categoryError) {
        throw categoryError;
      }
      
      chartData = categoryResult.map(item => ({
        category: item.main_category_name,
        quantity: parseInt(item.total_quantity),
        count: parseInt(item.application_count)
      }));
      
    } else if (chartType === 'departmentPie') {
      // 部门设备申请饼图数据
      const { data: overviewResult, error: overviewError } = await getSupabaseClient().rpc('get_equipment_overview', {
        p_start_date: startDate,
        p_end_date: endDate
      });
      
      if (overviewError) {
        throw overviewError;
      }
      
      // 筛选部门数据
      const departmentData = overviewResult.filter(item => item.stat_type === '部门');
      
      chartData = departmentData.map(item => ({
        name: item.name,
        value: parseInt(item.total_quantity),
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
    res.status(500).json({
      success: false,
      message: '获取设备图表数据失败',
      error: error.message
    });
  }
});

export default router;