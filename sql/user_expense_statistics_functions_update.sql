-- 用户费用统计函数更新版本
-- 修改了函数1和函数3，使用用户姓名而不是用户ID作为参数

-- 函数1：统计用户在指定时间段内的总费用金额（支持用户姓名查询）
CREATE OR REPLACE FUNCTION get_user_expense_total(
    p_start_date DATE,
    p_end_date DATE,
    p_user_name TEXT DEFAULT NULL
) RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    department_name TEXT,
    total_amount NUMERIC,
    application_count BIGINT,
    avg_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uedv.user_id,
        uedv.user_name,
        uedv.department_name,
        COALESCE(SUM(uedv.expense_amount), 0) as total_amount,
        COUNT(*) as application_count,
        COALESCE(AVG(uedv.expense_amount), 0) as avg_amount
    FROM user_expense_data_view uedv
    WHERE uedv.application_date >= p_start_date 
        AND uedv.application_date <= p_end_date
        AND (p_user_name IS NULL OR uedv.user_name = p_user_name)
    GROUP BY uedv.user_id, uedv.user_name, uedv.department_name
    ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- 函数2：统计指定时间段内各分类的费用情况
CREATE OR REPLACE FUNCTION get_category_expense_stats(
    p_start_date DATE,
    p_end_date DATE,
    p_main_category TEXT DEFAULT NULL
) RETURNS TABLE(
    main_category_name TEXT,
    sub_category_name TEXT,
    total_amount NUMERIC,
    application_count BIGINT,
    avg_amount NUMERIC,
    max_amount NUMERIC,
    min_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uedv.main_category_name::TEXT,  -- 明确转换为TEXT类型
        uedv.sub_category_name::TEXT,   -- 明确转换为TEXT类型
        COALESCE(SUM(uedv.expense_amount), 0)::NUMERIC as total_amount,  -- 确保为NUMERIC
        COUNT(*)::BIGINT as application_count,  -- 明确转换为BIGINT
        COALESCE(AVG(uedv.expense_amount), 0)::NUMERIC as avg_amount,   -- 确保为NUMERIC
        COALESCE(MAX(uedv.expense_amount), 0)::NUMERIC as max_amount,   -- 确保为NUMERIC
        COALESCE(MIN(uedv.expense_amount), 0)::NUMERIC as min_amount    -- 确保为NUMERIC
    FROM user_expense_data_view uedv
    WHERE uedv.application_date >= p_start_date 
        AND uedv.application_date <= p_end_date
        AND (p_main_category IS NULL OR uedv.main_category_name = p_main_category)
        AND uedv.main_category_name IS NOT NULL
    GROUP BY uedv.main_category_name, uedv.sub_category_name
    ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- 函数3：统计指定时间段内各分类的费用明细（支持指定用户或所有用户）
-- p_user_name为空时查询所有用户，非空时查询指定用户
CREATE OR REPLACE FUNCTION get_user_category_breakdown(
    p_start_date DATE,
    p_end_date DATE,
    p_user_name TEXT DEFAULT NULL  -- 默认为NULL，即查询所有用户
) RETURNS TABLE(
    user_name TEXT,
    main_category_name TEXT,
    sub_category_name TEXT,
    total_amount NUMERIC,
    application_count BIGINT,
    percentage_of_total NUMERIC
) AS $$
DECLARE
    v_overall_total NUMERIC;  -- 总费用（所有用户或指定用户在时间段内的总和）
BEGIN
    -- 1. 计算总费用（根据用户名参数动态筛选）
    SELECT COALESCE(SUM(uedv.expense_amount), 0) INTO v_overall_total
    FROM user_expense_data_view uedv
    WHERE uedv.application_date BETWEEN p_start_date AND p_end_date
        AND (p_user_name IS NULL OR uedv.user_name = p_user_name);  -- 动态用户筛选
    
    -- 总费用为0时返回空结果
    IF v_overall_total = 0 THEN
        RETURN;
    END IF;
    
    -- 2. 按用户+分类统计明细
    RETURN QUERY
    SELECT 
        uedv.user_name::TEXT,
        uedv.main_category_name::TEXT,
        uedv.sub_category_name::TEXT,
        COALESCE(SUM(uedv.expense_amount), 0)::NUMERIC as total_amount,
        COUNT(*)::BIGINT as application_count,
        -- 计算各分类占总费用的百分比（总费用为筛选范围内的总和）
        ROUND((COALESCE(SUM(uedv.expense_amount), 0) / v_overall_total * 100), 2)::NUMERIC as percentage_of_total
    FROM user_expense_data_view uedv
    WHERE uedv.application_date BETWEEN p_start_date AND p_end_date
        AND (p_user_name IS NULL OR uedv.user_name = p_user_name)  -- 动态用户筛选
        AND uedv.main_category_name IS NOT NULL
    GROUP BY uedv.user_name, uedv.main_category_name, uedv.sub_category_name
    ORDER BY 
        uedv.user_name,  -- 多用户时先按用户名分组
        total_amount DESC;  -- 再按金额降序
END;
$$ LANGUAGE plpgsql;



-- 函数4：获取时间段内费用统计概览（仅部门维度）
CREATE OR REPLACE FUNCTION get_expense_overview(
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE(
    stat_type TEXT,
    name TEXT,
    total_amount NUMERIC,
    application_count BIGINT,
    percentage NUMERIC
) AS $$
DECLARE
    v_overall_total NUMERIC;
BEGIN
    -- 获取总费用
    SELECT COALESCE(SUM(expense_amount), 0) INTO v_overall_total
    FROM user_expense_data_view
    WHERE application_date >= p_start_date 
        AND application_date <= p_end_date;
    
    -- 如果总费用为0，返回空结果
    IF v_overall_total = 0 THEN
        RETURN;
    END IF;
    
    -- 仅保留部门统计（无UNION ALL）
    RETURN QUERY
    SELECT 
        '部门'::TEXT as stat_type,  -- 明确指定统计类型为"部门"
        COALESCE(uedv.department_name, '未分配部门') as name,  -- 处理NULL部门名称
        COALESCE(SUM(uedv.expense_amount), 0)::NUMERIC as total_amount,  -- 显式类型转换
        COUNT(*)::BIGINT as application_count,  -- 显式类型转换
        ROUND((COALESCE(SUM(uedv.expense_amount), 0) / v_overall_total * 100), 2)::NUMERIC as percentage  -- 显式类型转换
    FROM user_expense_data_view uedv
    WHERE uedv.application_date >= p_start_date 
        AND uedv.application_date <= p_end_date
    GROUP BY uedv.department_name;  -- 修复：添加分号结束语句
    
END;
$$ LANGUAGE plpgsql;



-- 函数5：费用趋势统计函数
-- 按时间段统计费用趋势数据
CREATE OR REPLACE FUNCTION get_expense_trend(
    p_start_date DATE,
    p_end_date DATE,
    p_group_by TEXT DEFAULT 'month'
) RETURNS TABLE(
    period DATE,
    total_amount NUMERIC,
    application_count BIGINT,
    avg_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- 将时间戳截断后转换为DATE类型，匹配返回结构
        DATE_TRUNC(p_group_by, uedv.application_date)::TEXT as period,
        -- 显式转换为NUMERIC类型
        COALESCE(SUM(uedv.expense_amount), 0)::NUMERIC as total_amount,
        -- 显式转换为BIGINT类型
        COUNT(*)::BIGINT as application_count,
        -- 显式转换为NUMERIC类型
        COALESCE(AVG(uedv.expense_amount), 0)::NUMERIC as avg_amount
    FROM user_expense_data_view uedv
    WHERE uedv.application_date >= p_start_date 
        AND uedv.application_date <= p_end_date
    GROUP BY DATE_TRUNC(p_group_by, uedv.application_date)
    ORDER BY period ASC;
END;
$$ LANGUAGE plpgsql;
