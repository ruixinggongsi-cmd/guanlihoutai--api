-- 用户设备申请统计函数
-- 参考user_expense_statistics_functions_update.sql实现

-- 函数1：统计用户在指定时间段内的设备申请总量
CREATE OR REPLACE FUNCTION get_user_equipment_total(
    p_start_date DATE,
    p_end_date DATE,
    p_user_name TEXT DEFAULT NULL
) RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    department_name TEXT,
    total_quantity INTEGER,
    application_count BIGINT,
    avg_quantity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ueav.user_id,
        ueav.user_name,
        ueav.department_name,
        COALESCE(SUM(ueav.equipment_quantity), 0) as total_quantity,
        COUNT(*) as application_count,
        COALESCE(AVG(ueav.equipment_quantity), 0) as avg_quantity
    FROM user_equipment_approved_view ueav
    WHERE ueav.application_date >= p_start_date 
        AND ueav.application_date <= p_end_date
        AND (p_user_name IS NULL OR ueav.user_name = p_user_name)
    GROUP BY ueav.user_id, ueav.user_name, ueav.department_name
    ORDER BY total_quantity DESC;
END;
$$ LANGUAGE plpgsql;

-- 函数2：统计指定时间段内各设备分类的申请情况
CREATE OR REPLACE FUNCTION get_equipment_category_stats(
    p_start_date DATE,
    p_end_date DATE,
    p_main_category TEXT DEFAULT NULL
) RETURNS TABLE(
    main_category_name TEXT,
    sub_category_name TEXT,
    total_quantity INTEGER,
    application_count BIGINT,
    avg_quantity NUMERIC,
    max_quantity INTEGER,
    min_quantity INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ueav.main_category_name::TEXT,
        ueav.sub_category_name::TEXT,
        COALESCE(SUM(ueav.equipment_quantity), 0)::INTEGER as total_quantity,
        COUNT(*)::BIGINT as application_count,
        COALESCE(AVG(ueav.equipment_quantity), 0)::NUMERIC as avg_quantity,
        COALESCE(MAX(ueav.equipment_quantity), 0)::INTEGER as max_quantity,
        COALESCE(MIN(ueav.equipment_quantity), 0)::INTEGER as min_quantity
    FROM user_equipment_approved_view ueav
    WHERE ueav.application_date >= p_start_date 
        AND ueav.application_date <= p_end_date
        AND (p_main_category IS NULL OR ueav.main_category_name = p_main_category)
        AND ueav.main_category_name IS NOT NULL
    GROUP BY ueav.main_category_name, ueav.sub_category_name
    ORDER BY total_quantity DESC;
END;
$$ LANGUAGE plpgsql;

-- 函数3：统计用户在指定时间段内各设备分类的申请明细
CREATE OR REPLACE FUNCTION get_user_equipment_category_breakdown(
    p_user_name TEXT
) RETURNS TABLE(
    user_name TEXT,
    main_category_name TEXT,
    sub_category_name TEXT,
    total_quantity INTEGER,
    application_count BIGINT,
    percentage_of_total NUMERIC
) AS $$
DECLARE
    v_user_total INTEGER;
BEGIN
    -- 先获取用户的总申请数量
    SELECT COALESCE(SUM(ueav.equipment_quantity), 0) INTO v_user_total
    FROM user_equipment_approved_view ueav
    WHERE ueav.user_name = p_user_name;

    
    -- 如果总数量为0，返回空结果
    IF v_user_total = 0 THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        ueav.user_name::TEXT,
        ueav.main_category_name::TEXT,
        ueav.sub_category_name::TEXT,
        COALESCE(SUM(ueav.equipment_quantity), 0)::INTEGER as total_quantity,
        COUNT(*)::BIGINT as application_count,
        ROUND((COALESCE(SUM(ueav.equipment_quantity), 0)::NUMERIC / v_user_total * 100), 2)::NUMERIC as percentage_of_total
    FROM user_equipment_approved_view ueav
    WHERE ueav.user_name = p_user_name 
        AND ueav.main_category_name IS NOT NULL
    GROUP BY ueav.user_name, ueav.main_category_name, ueav.sub_category_name
    ORDER BY total_quantity DESC;
END;
$$ LANGUAGE plpgsql;

-- 函数4：获取时间段内设备申请统计概览
CREATE OR REPLACE FUNCTION get_equipment_overview(
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE(
    stat_type TEXT,
    name TEXT,
    total_quantity INTEGER,
    application_count BIGINT,
    percentage NUMERIC
) AS $$
DECLARE
    v_overall_total INTEGER;
BEGIN
    -- 获取总申请数量
    SELECT COALESCE(SUM(equipment_quantity), 0) INTO v_overall_total
    FROM user_equipment_approved_view
    WHERE application_date >= p_start_date 
        AND application_date <= p_end_date;
    
    -- 如果总数量为0，返回空结果
    IF v_overall_total = 0 THEN
        RETURN;
    END IF;
    
    -- 部门统计
    RETURN QUERY
    SELECT 
        '部门'::TEXT as stat_type,
        COALESCE(ueav.department_name, '未分配部门') as name,
        COALESCE(SUM(ueav.equipment_quantity), 0)::INTEGER as total_quantity,
        COUNT(*)::BIGINT as application_count,
        ROUND((COALESCE(SUM(ueav.equipment_quantity), 0)::NUMERIC / v_overall_total * 100), 2)::NUMERIC as percentage
    FROM user_equipment_approved_view ueav
    WHERE ueav.application_date >= p_start_date 
        AND ueav.application_date <= p_end_date
    GROUP BY ueav.department_name;
END;
$$ LANGUAGE plpgsql;

-- 函数5：设备申请趋势统计函数
-- 按时间段（日/月/年）统计设备申请趋势数据，优化时间显示格式
CREATE OR REPLACE FUNCTION get_equipment_trend(
    p_start_date DATE,
    p_end_date DATE,
    p_group_by TEXT DEFAULT 'month'
) RETURNS TABLE(
    period TEXT,               -- 格式化后的时间段文本
    total_quantity INTEGER,    -- 总申请数量
    application_count BIGINT,  -- 申请次数
    avg_quantity NUMERIC       -- 平均每次申请数量
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- 根据分组类型格式化时间显示
        CASE p_group_by
            WHEN 'year' THEN TO_CHAR(DATE_TRUNC(p_group_by, ueav.application_date), 'YYYY年')  -- 年：2024年
            WHEN 'month' THEN TO_CHAR(DATE_TRUNC(p_group_by, ueav.application_date), 'YYYY年MM月')  -- 月：2024年05月
            WHEN 'day' THEN TO_CHAR(DATE_TRUNC(p_group_by, ueav.application_date), 'YYYY年MM月DD日')  -- 日：2024年05月15日
            ELSE TO_CHAR(DATE_TRUNC(p_group_by, ueav.application_date), 'YYYY年MM月DD日')  -- 默认格式
        END AS period,
        COALESCE(SUM(ueav.equipment_quantity), 0)::INTEGER AS total_quantity,
        COUNT(*)::BIGINT AS application_count,
        COALESCE(AVG(ueav.equipment_quantity::NUMERIC), 0)::NUMERIC AS avg_quantity
    FROM user_equipment_approved_view ueav
    WHERE ueav.application_date >= p_start_date 
        AND ueav.application_date <= p_end_date
    GROUP BY DATE_TRUNC(p_group_by, ueav.application_date)
    ORDER BY DATE_TRUNC(p_group_by, ueav.application_date) ASC;  -- 按实际时间排序
END;
$$ LANGUAGE plpgsql;
