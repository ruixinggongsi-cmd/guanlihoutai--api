-- 删除现有的客户统计函数（由于参数名称变更需要重新创建）
DROP FUNCTION IF EXISTS public.get_customer_growth_trend(date, date, text);
DROP FUNCTION IF EXISTS public.get_customer_source_statistics(date, date);
DROP FUNCTION IF EXISTS public.get_customer_activity_analysis();
DROP FUNCTION IF EXISTS public.get_department_customer_statistics(date, date);
DROP FUNCTION IF EXISTS public.get_user_customer_growth_trend(text, date, date, text);
DROP FUNCTION IF EXISTS public.get_user_customer_ranking(date, date, text);

-- 重新创建所有函数，使用带前缀的参数名
-- 1. 客户增长趋势统计函数
CREATE OR REPLACE FUNCTION public.get_customer_growth_trend(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_group_by TEXT DEFAULT 'month'  -- 'day', 'week', 'month', 'year'
)
RETURNS TABLE (
    period_date DATE,
    period_label TEXT,
    new_customers BIGINT,
    total_customers BIGINT,
    growth_rate NUMERIC,
    active_customers BIGINT,
    inactive_customers BIGINT,
    vip_customers BIGINT
) AS $$
BEGIN
    -- 设置默认日期范围
    IF p_start_date IS NULL THEN
        p_start_date := CURRENT_DATE - INTERVAL '1 year';
    END IF;
    IF p_end_date IS NULL THEN
        p_end_date := CURRENT_DATE;
    END IF;

    RETURN QUERY
    WITH customer_periods AS (
        SELECT 
            CASE 
                WHEN p_group_by = 'day' THEN DATE_TRUNC('day', c.created_at)::DATE
                WHEN p_group_by = 'week' THEN DATE_TRUNC('week', c.created_at)::DATE
                WHEN p_group_by = 'month' THEN DATE_TRUNC('month', c.created_at)::DATE
                WHEN p_group_by = 'year' THEN DATE_TRUNC('year', c.created_at)::DATE
                ELSE DATE_TRUNC('month', c.created_at)::DATE
            END as period_date,
            c.status,
            c.id
        FROM public.customers c
        WHERE c.created_at::DATE BETWEEN p_start_date AND p_end_date
    ),
    period_stats AS (
        SELECT 
            period_date,
            COUNT(*) as new_customers,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_customers,
            COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_customers,
            COUNT(CASE WHEN status = 'vip' THEN 1 END) as vip_customers
        FROM customer_periods
        GROUP BY period_date
    ),
    cumulative_totals AS (
        SELECT 
            period_date,
            new_customers,
            active_customers,
            inactive_customers,
            vip_customers,
            SUM(new_customers) OVER (ORDER BY period_date) as total_customers,
            CASE 
                WHEN LAG(SUM(new_customers) OVER (ORDER BY period_date), 1) OVER (ORDER BY period_date) > 0
                THEN ROUND(((new_customers - LAG(new_customers, 1) OVER (ORDER BY period_date))::NUMERIC 
                    / LAG(new_customers, 1) OVER (ORDER BY period_date) * 100), 2)
                ELSE NULL
            END as growth_rate
        FROM period_stats
    )
    SELECT 
        ct.period_date,
        CASE 
            WHEN p_group_by = 'day' THEN TO_CHAR(ct.period_date, 'YYYY-MM-DD')
            WHEN p_group_by = 'week' THEN TO_CHAR(ct.period_date, 'YYYY-MM-DD') || ' 周'
            WHEN p_group_by = 'month' THEN TO_CHAR(ct.period_date, 'YYYY年MM月')
            WHEN p_group_by = 'year' THEN TO_CHAR(ct.period_date, 'YYYY年')
            ELSE TO_CHAR(ct.period_date, 'YYYY年MM月')
        END as period_label,
        ct.new_customers,
        ct.total_customers,
        ct.growth_rate,
        ct.active_customers,
        ct.inactive_customers,
        ct.vip_customers
    FROM cumulative_totals ct
    ORDER BY ct.period_date;
END;
$$ LANGUAGE plpgsql;

-- 2. 客户来源分析函数
CREATE OR REPLACE FUNCTION public.get_customer_source_statistics(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    customer_source TEXT,
    customer_source_cn TEXT,
    customer_count BIGINT,
    percentage NUMERIC,
    avg_total_spent NUMERIC,
    avg_order_count NUMERIC,
    conversion_rate NUMERIC
) AS $$
BEGIN
    -- 设置默认日期范围
    IF p_start_date IS NULL THEN
        p_start_date := CURRENT_DATE - INTERVAL '1 year';
    END IF;
    IF p_end_date IS NULL THEN
        p_end_date := CURRENT_DATE;
    END IF;

    RETURN QUERY
    WITH source_stats AS (
        SELECT 
            c.source as customer_source,
            CASE 
                WHEN c.source = 'online' THEN '线上'
                WHEN c.source = 'offline' THEN '线下'
                WHEN c.source = 'referral' THEN '推荐'
                WHEN c.source = 'other' THEN '其他'
                ELSE c.source::TEXT
            END as customer_source_cn,
            COUNT(*) as customer_count,
            COALESCE(AVG(c.total_spent), 0) as avg_total_spent,
            COALESCE(AVG(c.order_count), 0) as avg_order_count,
            COUNT(CASE WHEN c.order_count > 0 THEN 1 END)::NUMERIC / COUNT(*) * 100 as conversion_rate
        FROM public.customers c
        WHERE c.created_at::DATE BETWEEN p_start_date AND p_end_date
        GROUP BY c.source
    ),
    total_customers AS (
        SELECT SUM(customer_count) as total FROM source_stats
    )
    SELECT 
        ss.customer_source,
        ss.customer_source_cn,
        ss.customer_count,
        ROUND(ss.customer_count::NUMERIC / tc.total * 100, 2) as percentage,
        ROUND(ss.avg_total_spent, 2) as avg_total_spent,
        ROUND(ss.avg_order_count, 2) as avg_order_count,
        ROUND(ss.conversion_rate, 2) as conversion_rate
    FROM source_stats ss, total_customers tc
    ORDER BY ss.customer_count DESC;
END;
$$ LANGUAGE plpgsql;

-- 3. 客户活跃度分析函数
CREATE OR REPLACE FUNCTION public.get_customer_activity_analysis()
RETURNS TABLE (
    activity_level TEXT,
    customer_count BIGINT,
    percentage NUMERIC,
    avg_days_since_last_transaction INTEGER,
    avg_total_spent NUMERIC,
    total_customers BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH activity_segments AS (
        SELECT 
            c.id,
            COALESCE(c.total_spent, 0) as total_spent,
            c.last_transaction_at,
            CASE 
                WHEN c.last_transaction_at IS NULL THEN '从未联系'
                WHEN c.last_transaction_at >= CURRENT_DATE - INTERVAL '30 days' THEN '高度活跃'
                WHEN c.last_transaction_at >= CURRENT_DATE - INTERVAL '90 days' THEN '中度活跃'
                WHEN c.last_transaction_at >= CURRENT_DATE - INTERVAL '180 days' THEN '低度活跃'
                ELSE '长期未联系'
            END as activity_level,
            CASE 
                WHEN c.last_transaction_at IS NULL THEN NULL
                ELSE (CURRENT_DATE - c.last_transaction_at::DATE)::INTEGER
            END as days_since_last_transaction
        FROM public.customers c
    )
    SELECT 
        vs.activity_level,
        COUNT(*) as customer_count,
        ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM activity_segments) * 100, 2) as percentage,
        ROUND(AVG(vs.days_since_last_transaction), 0)::INTEGER as avg_days_since_last_transaction,
        ROUND(AVG(vs.total_spent), 2) as avg_total_spent,
        (SELECT COUNT(*) FROM activity_segments) as total_customers
    FROM activity_segments vs
    GROUP BY vs.activity_level
    ORDER BY 
        CASE vs.activity_level
            WHEN '高度活跃' THEN 1
            WHEN '中度活跃' THEN 2
            WHEN '低度活跃' THEN 3
            WHEN '长期未联系' THEN 4
            WHEN '从未联系' THEN 5
        END;
END;
$$ LANGUAGE plpgsql;

-- 4. 部门客户统计函数
CREATE OR REPLACE FUNCTION public.get_department_customer_statistics(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    department_name TEXT,
    customer_count BIGINT,
    active_customers BIGINT,
    total_spent NUMERIC,
    avg_spent NUMERIC,
    avg_order_count NUMERIC,
    new_customers_this_month BIGINT
) AS $$
BEGIN
    -- 设置默认日期范围
    IF p_start_date IS NULL THEN
        p_start_date := CURRENT_DATE - INTERVAL '1 month';
    END IF;
    IF p_end_date IS NULL THEN
        p_end_date := CURRENT_DATE;
    END IF;

    RETURN QUERY
    SELECT 
        civ.creator_department,
        COUNT(*) as customer_count,
        COUNT(CASE WHEN civ.customer_status = 'active' THEN 1 END) as active_customers,
        COALESCE(SUM(civ.total_spent), 0) as total_spent,
        COALESCE(AVG(civ.total_spent), 0) as avg_spent,
        COALESCE(AVG(civ.order_count), 0) as avg_order_count,
        COUNT(CASE WHEN civ.customer_created_at::DATE >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as new_customers_this_month
    FROM public.customer_info_view civ
    WHERE civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
    GROUP BY civ.creator_department
    HAVING COUNT(*) > 0
    ORDER BY customer_count DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. 用户发展客户趋势分析函数
CREATE OR REPLACE FUNCTION public.get_user_customer_growth_trend(
    p_user_name TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_group_by TEXT DEFAULT 'month'  -- 'day', 'week', 'month', 'year'
)
RETURNS TABLE (
    user_id UUID,
    user_name TEXT,
    department_name TEXT,
    period_date DATE,
    period_label TEXT,
    new_customers BIGINT,
    total_customers BIGINT,
    active_customers BIGINT,
    total_spent NUMERIC,
    avg_spent NUMERIC,
    growth_rate NUMERIC
) AS $$
BEGIN
    -- 设置默认日期范围
    IF p_start_date IS NULL THEN
        p_start_date := CURRENT_DATE - INTERVAL '1 year';
    END IF;
    IF p_end_date IS NULL THEN
        p_end_date := CURRENT_DATE;
    END IF;

    RETURN QUERY
    WITH user_periods AS (
        SELECT 
            civ.created_by as user_id,
            civ.creator_name as user_name,
            civ.creator_department as department_name,
            CASE 
                WHEN p_group_by = 'day' THEN DATE_TRUNC('day', civ.customer_created_at)::DATE
                WHEN p_group_by = 'week' THEN DATE_TRUNC('week', civ.customer_created_at)::DATE
                WHEN p_group_by = 'month' THEN DATE_TRUNC('month', civ.customer_created_at)::DATE
                WHEN p_group_by = 'year' THEN DATE_TRUNC('year', civ.customer_created_at)::DATE
                ELSE DATE_TRUNC('month', civ.customer_created_at)::DATE
            END as period_date,
            civ.customer_id,
            civ.customer_status,
            civ.total_spent
        FROM public.customer_info_view civ
        WHERE civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
            AND (p_user_name IS NULL OR civ.creator_name = p_user_name OR civ.creator_username = p_user_name)
    ),
    user_stats AS (
        SELECT 
            user_id,
            user_name,
            department_name,
            period_date,
            COUNT(*) as new_customers,
            COUNT(CASE WHEN customer_status = 'active' THEN 1 END) as active_customers,
            COALESCE(SUM(total_spent), 0) as total_spent,
            COALESCE(AVG(total_spent), 0) as avg_spent
        FROM user_periods
        GROUP BY user_id, user_name, department_name, period_date
    ),
    cumulative_totals AS (
        SELECT 
            user_id,
            user_name,
            department_name,
            period_date,
            new_customers,
            active_customers,
            total_spent,
            avg_spent,
            SUM(new_customers) OVER (
                PARTITION BY user_id 
                ORDER BY period_date 
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) as total_customers,
            CASE 
                WHEN LAG(new_customers, 1) OVER (PARTITION BY user_id ORDER BY period_date) > 0
                THEN ROUND(((new_customers - LAG(new_customers, 1) OVER (PARTITION BY user_id ORDER BY period_date))::NUMERIC 
                    / LAG(new_customers, 1) OVER (PARTITION BY user_id ORDER BY period_date) * 100), 2)
                ELSE NULL
            END as growth_rate
        FROM user_stats
    )
    SELECT 
        ct.user_id,
        ct.user_name,
        ct.department_name,
        ct.period_date,
        CASE 
            WHEN p_group_by = 'day' THEN TO_CHAR(ct.period_date, 'YYYY-MM-DD')
            WHEN p_group_by = 'week' THEN TO_CHAR(ct.period_date, 'YYYY-MM-DD') || ' 周'
            WHEN p_group_by = 'month' THEN TO_CHAR(ct.period_date, 'YYYY年MM月')
            WHEN p_group_by = 'year' THEN TO_CHAR(ct.period_date, 'YYYY年')
            ELSE TO_CHAR(ct.period_date, 'YYYY年MM月')
        END as period_label,
        ct.new_customers,
        ct.total_customers,
        ct.active_customers,
        ct.total_spent,
        ct.avg_spent,
        ct.growth_rate
    FROM cumulative_totals ct
    ORDER BY ct.user_name, ct.period_date;
END;
$$ LANGUAGE plpgsql;

-- 6. 用户客户发展排行榜函数
CREATE OR REPLACE FUNCTION public.get_user_customer_ranking(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_ranking_type TEXT DEFAULT 'total'  -- 'total', 'monthly', 'active', 'value'
)
RETURNS TABLE (
    rank_position INTEGER,
    user_id UUID,
    user_name TEXT,
    department_name TEXT,
    customer_count BIGINT,
    active_customers BIGINT,
    total_spent NUMERIC,
    avg_spent NUMERIC,
    new_customers_count BIGINT,
    performance_score NUMERIC
) AS $$
BEGIN
    -- 设置默认日期范围
    IF p_start_date IS NULL THEN
        p_start_date := CURRENT_DATE - INTERVAL '1 year';
    END IF;
    IF p_end_date IS NULL THEN
        p_end_date := CURRENT_DATE;
    END IF;

    RETURN QUERY
    WITH user_performance AS (
        SELECT 
            civ.created_by as user_id,
            civ.creator_name as user_name,
            civ.creator_department as department_name,
            COUNT(*) as customer_count,
            COUNT(CASE WHEN civ.customer_status = 'active' THEN 1 END) as active_customers,
            COALESCE(SUM(civ.total_spent), 0) as total_spent,
            COALESCE(AVG(civ.total_spent), 0) as avg_spent,
            COUNT(CASE WHEN civ.customer_created_at::DATE >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as new_customers_count,
            -- 综合绩效评分 (客户数*0.4 + 活跃客户数*0.3 + 总消费*0.0001 + 新客户数*0.3)
            (COUNT(*) * 0.4 + 
             COUNT(CASE WHEN civ.customer_status = 'active' THEN 1 END) * 0.3 + 
             COALESCE(SUM(civ.total_spent), 0) * 0.0001 +
             COUNT(CASE WHEN civ.customer_created_at::DATE >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) * 0.3) as performance_score
        FROM public.customer_info_view civ
        WHERE civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
        GROUP BY civ.created_by, civ.creator_name, civ.creator_department
        HAVING COUNT(*) > 0
    )
    SELECT 
        ROW_NUMBER() OVER (
            ORDER BY 
                CASE p_ranking_type
                    WHEN 'total' THEN up.customer_count
                    WHEN 'monthly' THEN up.new_customers_count
                    WHEN 'active' THEN up.active_customers
                    WHEN 'value' THEN up.total_spent
                    ELSE up.performance_score
                END DESC
        ) as rank_position,
        up.user_id,
        up.user_name,
        up.department_name,
        up.customer_count,
        up.active_customers,
        up.total_spent,
        up.avg_spent,
        up.new_customers_count,
        ROUND(up.performance_score, 2) as performance_score
    FROM user_performance up
    ORDER BY 
        CASE p_ranking_type
            WHEN 'total' THEN up.customer_count
            WHEN 'monthly' THEN up.new_customers_count
            WHEN 'active' THEN up.active_customers
            WHEN 'value' THEN up.total_spent
            ELSE up.performance_score
        END DESC;
END;
$$ LANGUAGE plpgsql;

-- 添加函数注释
COMMENT ON FUNCTION public.get_customer_growth_trend(DATE, DATE, TEXT) IS '获取客户增长趋势统计，支持按天/周/月/年分组';
COMMENT ON FUNCTION public.get_customer_source_statistics(DATE, DATE) IS '获取客户来源分析统计';
COMMENT ON FUNCTION public.get_customer_activity_analysis() IS '获取客户活跃度分析统计';
COMMENT ON FUNCTION public.get_department_customer_statistics(DATE, DATE) IS '获取部门客户统计信息';
COMMENT ON FUNCTION public.get_user_customer_growth_trend(TEXT, DATE, DATE, TEXT) IS '获取用户发展客户趋势分析，支持按用户名称和时间维度统计';
COMMENT ON FUNCTION public.get_user_customer_ranking(DATE, DATE, TEXT) IS '获取用户客户发展排行榜，支持多种排名方式';