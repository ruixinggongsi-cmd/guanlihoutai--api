-- 客户趋势统计函数（基于customer_info_view结构）
-- 包含四个核心趋势分析函数

-- 1. 客户增长趋势函数（按客户来源）
CREATE OR REPLACE FUNCTION get_customer_growth_by_source(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '1 year'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_customer_source TEXT DEFAULT NULL
)
RETURNS TABLE (
    period_date DATE,
    customer_source TEXT,
    new_customers BIGINT,
    cumulative_customers BIGINT,
    total_customers BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH monthly_data AS (
        SELECT 
            -- 确保日期类型严格为DATE
            DATE_TRUNC('month', civ.customer_created_at)::DATE as period_date,
            -- 显式转换为TEXT并处理NULL，与返回类型匹配
            COALESCE(civ.customer_source::TEXT, 'unknown') as customer_source,
            -- 显式转换为BIGINT，与返回类型匹配
            COUNT(*)::BIGINT as new_customers
        FROM public.customer_info_view civ
        WHERE 
            civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
            AND (p_customer_source IS NULL OR civ.customer_source::TEXT = p_customer_source)
        GROUP BY 
            DATE_TRUNC('month', civ.customer_created_at)::DATE, 
            COALESCE(civ.customer_source::TEXT, 'unknown')
    ),
    cumulative_data AS (
        SELECT 
            md.period_date,
            md.customer_source,
            md.new_customers,
            -- 确保累计值为BIGINT类型
            SUM(md.new_customers) OVER (
                PARTITION BY md.customer_source 
                ORDER BY md.period_date 
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )::BIGINT as cumulative_customers,
            -- 确保总计为BIGINT类型
            SUM(md.new_customers) OVER (PARTITION BY md.customer_source)::BIGINT as total_customers
        FROM monthly_data md
    )
    SELECT 
        cd.period_date::DATE,  -- 再次确认日期类型
        cd.customer_source::TEXT,  -- 确认文本类型
        cd.new_customers::BIGINT,
        cd.cumulative_customers::BIGINT,
        cd.total_customers::BIGINT
    FROM cumulative_data cd
    ORDER BY cd.customer_source, cd.period_date;
END;
$$ LANGUAGE plpgsql;

-- 2. 用户新增会员趋势函数（按创建者姓名）
CREATE OR REPLACE FUNCTION get_user_customer_growth_trend(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '1 year'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_creator_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    period_date DATE,
    creator_id UUID,
    creator_name TEXT,
    creator_department TEXT,
    new_customers BIGINT,
    cumulative_customers BIGINT,
    active_customers BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH monthly_data AS (
        SELECT 
            -- 确保日期类型为DATE
            DATE_TRUNC('month', civ.customer_created_at)::DATE as period_date,
            -- 显式转换为UUID类型，匹配返回表定义
            civ.creator_id::UUID as creator_id,
            -- 显式转换为TEXT类型，处理可能的NULL
            COALESCE(civ.creator_name::TEXT, '未知创建者') as creator_name,
            -- 显式转换为TEXT类型，处理可能的NULL
            COALESCE(civ.creator_department::TEXT, '未分配部门') as creator_department,
            -- 显式转换为BIGINT类型
            COUNT(*)::BIGINT as new_customers,
            -- 显式转换为BIGINT类型，使用CASE替代FILTER确保兼容性
            COUNT(CASE WHEN civ.customer_status = 'active' THEN 1 END)::BIGINT as active_customers
        FROM public.customer_info_view civ
        WHERE 
            civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
            AND civ.creator_id IS NOT NULL
            AND (p_creator_name IS NULL OR civ.creator_name::TEXT = p_creator_name)
        GROUP BY 
            DATE_TRUNC('month', civ.customer_created_at)::DATE, 
            civ.creator_id,
            civ.creator_name,
            civ.creator_department
    )
    SELECT 
        md.period_date::DATE,  -- 确认日期类型
        md.creator_id::UUID,   -- 确认UUID类型
        md.creator_name::TEXT, -- 确认TEXT类型
        md.creator_department::TEXT, -- 确认TEXT类型
        md.new_customers::BIGINT,
        -- 确保累计值为BIGINT类型
        SUM(md.new_customers) OVER (
            PARTITION BY md.creator_id  -- 改用ID分区更可靠（名称可能重复）
            ORDER BY md.period_date 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::BIGINT as cumulative_customers,
        md.active_customers::BIGINT
    FROM monthly_data md
    ORDER BY md.creator_name, md.period_date;
END;
$$ LANGUAGE plpgsql;

-- 3. 部门新增会员趋势函数（按部门名称）
CREATE OR REPLACE FUNCTION get_department_customer_growth_trend(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '1 year'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_department_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    period_date DATE,
    department_id UUID,
    department_name TEXT,
    new_customers BIGINT,
    cumulative_customers BIGINT,
    active_customers BIGINT,
    vip_customers BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH monthly_data AS (
        SELECT 
            -- 确保日期类型为DATE
            DATE_TRUNC('month', civ.customer_created_at)::DATE as period_date,
            -- 显式转换为UUID，处理可能的类型不匹配
            civ.department_id::UUID as department_id,
            -- 处理NULL并转换为TEXT，与返回类型匹配
            COALESCE(civ.creator_department::TEXT, '未命名部门') as department_name,
            -- 显式转换为BIGINT
            COUNT(*)::BIGINT as new_customers,
            -- 用CASE替代FILTER确保兼容性，并显式转换为BIGINT
            COUNT(CASE WHEN civ.customer_status = 'active' THEN 1 END)::BIGINT as active_customers,
            COUNT(CASE WHEN civ.customer_status = 'vip' THEN 1 END)::BIGINT as vip_customers
        FROM public.customer_info_view civ
        WHERE 
            civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
            AND civ.department_id IS NOT NULL
            -- 筛选条件也做类型转换，确保匹配
            AND (p_department_name IS NULL OR civ.creator_department::TEXT = p_department_name)
        GROUP BY 
            DATE_TRUNC('month', civ.customer_created_at)::DATE, 
            civ.department_id,
            civ.creator_department
    )
    SELECT 
        md.period_date::DATE,  -- 确认日期类型
        md.department_id::UUID,  -- 确认UUID类型
        md.department_name::TEXT,  -- 确认TEXT类型
        md.new_customers::BIGINT,
        -- 累计值显式转换为BIGINT，并用ID分区更可靠
        SUM(md.new_customers) OVER (
            PARTITION BY md.department_id 
            ORDER BY md.period_date 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::BIGINT as cumulative_customers,
        md.active_customers::BIGINT,
        md.vip_customers::BIGINT
    FROM monthly_data md
    ORDER BY md.department_name, md.period_date;
END;
$$ LANGUAGE plpgsql;


-- 4. 客户维护趋势函数（基于最后联系时间）
CREATE OR REPLACE FUNCTION get_customer_maintenance_trend(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '6 months'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_activity_level TEXT DEFAULT NULL
)
RETURNS TABLE (
    period_date DATE,
    activity_level TEXT,
    contacted_customers BIGINT,
    uncontacted_customers BIGINT,
    total_customers BIGINT,
    contact_rate NUMERIC,
    avg_days_since_contact NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH monthly_contact_data AS (
        SELECT 
            DATE_TRUNC('month', civ.customer_created_at)::DATE as period_date,
            civ.activity_level,
            CASE 
                WHEN civ.days_since_last_connect IS NOT NULL THEN 1 
                ELSE 0 
            END as was_contacted,
            civ.days_since_last_connect
        FROM public.customer_info_view civ
        WHERE 
            civ.customer_created_at::DATE <= p_end_date
            AND (p_activity_level IS NULL OR civ.activity_level = p_activity_level)
    ),
    monthly_stats AS (
        SELECT 
            mcd.period_date,
            mcd.activity_level,
            COUNT(*) FILTER (WHERE mcd.was_contacted = 1) as contacted_customers,
            COUNT(*) FILTER (WHERE mcd.was_contacted = 0) as uncontacted_customers,
            COUNT(*) as total_customers,
            ROUND(COUNT(*) FILTER (WHERE mcd.was_contacted = 1)::NUMERIC / COUNT(*) * 100, 2) as contact_rate,
            AVG(mcd.days_since_last_connect)::NUMERIC as avg_days_since_contact
        FROM monthly_contact_data mcd
        WHERE mcd.period_date BETWEEN p_start_date AND p_end_date
        GROUP BY mcd.period_date, mcd.activity_level
    )
    SELECT 
        ms.period_date,
        ms.activity_level,
        ms.contacted_customers,
        ms.uncontacted_customers,
        ms.total_customers,
        ms.contact_rate,
        ms.avg_days_since_contact
    FROM monthly_stats ms
    ORDER BY ms.activity_level, ms.period_date;
END;
$$ LANGUAGE plpgsql;

-- 添加函数注释
COMMENT ON FUNCTION get_customer_growth_by_source(DATE, DATE, TEXT) IS '获取按客户来源的增长趋势统计';
COMMENT ON FUNCTION get_user_customer_growth_trend(DATE, DATE, TEXT) IS '获取按用户（创建者姓名）的新增客户趋势';
COMMENT ON FUNCTION get_department_customer_growth_trend(DATE, DATE, TEXT) IS '获取按部门名称的新增客户趋势';
COMMENT ON FUNCTION get_customer_maintenance_trend(DATE, DATE, TEXT) IS '获取客户维护趋势，基于最后联系时间分析';