import express from 'express';
import { getSupabaseClient } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

const router = express.Router();

// 客户增长趋势统计（按客户来源）
router.get('/customer-growth-by-source', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, customerSource, timeDimension } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    // 验证时间维度参数
    const validTimeDimensions = ['day', 'month', 'year'];
    const finalTimeDimension = timeDimension && validTimeDimensions.includes(timeDimension) ? timeDimension : 'month';
    console.log({
      p_start_date: startDate,
      p_end_date: endDate,
      p_customer_source: customerSource || null,
      p_time_dimension: finalTimeDimension
    })
    const { data: result, error } = await getSupabaseClient().rpc('get_customer_growth_by_source', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_customer_source: customerSource || null,
      p_time_dimension: finalTimeDimension
    });

    if (error) {
      console.error('调用客户增长趋势函数失败:', error);
      throw error;
    }

    res.json({
      success: true,
      data: result,
      message: '获取客户增长趋势统计成功'
    });
  } catch (error) {
    console.error('获取客户增长趋势统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取客户增长趋势统计失败',
      error: error.message
    });
  }
});

// 用户新增会员趋势函数（按创建者姓名）
router.get('/user-customer-growth-trend', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, creatorName, timeDimension } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    // 验证时间维度参数
    const validTimeDimensions = ['day', 'month', 'year'];
    const finalTimeDimension = timeDimension && validTimeDimensions.includes(timeDimension) ? timeDimension : 'month';

    const { data: result, error } = await getSupabaseClient().rpc('get_user_customer_growth_trend', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_creator_name: creatorName || null,
      p_time_dimension: finalTimeDimension
    });

    if (error) {
      console.error('调用用户新增会员趋势函数失败:', error);
      throw error;
    }

    res.json({
      success: true,
      data: result,
      message: '获取用户新增会员趋势统计成功'
    });
  } catch (error) {
    console.error('获取用户新增会员趋势统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户新增会员趋势统计失败',
      error: error.message
    });
  }
});

// 部门新增会员趋势函数（按部门名称）
router.get('/department-customer-growth-trend', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, departmentName, timeDimension } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    // 验证时间维度参数
    const validTimeDimensions = ['day', 'month', 'year'];
    const finalTimeDimension = timeDimension && validTimeDimensions.includes(timeDimension) ? timeDimension : 'month';

    const { data: result, error } = await getSupabaseClient().rpc('get_department_customer_growth_trend', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_department_name: departmentName || null,
      p_time_dimension: finalTimeDimension
    });

    if (error) {
      console.error('调用部门新增会员趋势函数失败:', error);
      throw error;
    }

    res.json({
      success: true,
      data: result,
      message: '获取部门新增会员趋势统计成功'
    });
  } catch (error) {
    console.error('获取部门新增会员趋势统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取部门新增会员趋势统计失败',
      error: error.message
    });
  }
});

// 客户维护趋势函数（基于contact_records、customers、users、department表的综合分析）
router.get('/customer-maintenance-trend', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { startDate, endDate, staffName, timeDimension } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '开始日期和结束日期不能为空'
      });
    }

    // 验证时间维度参数
    const validTimeDimensions = ['day', 'month', 'year'];
    const finalTimeDimension = timeDimension && validTimeDimensions.includes(timeDimension) ? timeDimension : 'month';

    const { data: result, error } = await getSupabaseClient().rpc('get_customer_maintenance_trend', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_staff_name: staffName || null,
      p_time_dimension: finalTimeDimension
    });

    if (error) {
      console.error('调用客户维护趋势函数失败:', error);
      throw error;
    }

    res.json({
      success: true,
      data: result,
      message: '获取客户维护趋势统计成功'
    });
  } catch (error) {
    console.error('获取客户维护趋势统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取客户维护趋势统计失败',
      error: error.message
    });
  }
});

export default router;