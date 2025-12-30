-- 客户趋势统计函数（基于customer_info_view结构）
-- 增强版本：支持按年、月、日三种时间维度进行统计分析

-- 1. 客户增长趋势函数（按客户来源）- 支持多时间维度
CREATE OR REPLACE FUNCTION get_customer_growth_by_source(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '1 year'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_customer_source TEXT DEFAULT NULL,
    p_time_dimension TEXT DEFAULT 'month' -- 新增参数：时间维度 ('year', 'month', 'day')
)
RETURNS TABLE (
    period_date DATE,
    period_date_formatted TEXT, -- 新增字段：格式化日期（中文格式）
    customer_source TEXT,
    new_customers BIGINT,
    cumulative_customers BIGINT,
    total_customers BIGINT,
    time_dimension TEXT -- 新增字段：标识时间维度
) AS $$
BEGIN
    -- 验证时间维度参数
    IF p_time_dimension NOT IN ('year', 'month', 'day') THEN
        p_time_dimension := 'month';
    END IF;

    RETURN QUERY
    WITH time_dimension_data AS (
        SELECT 
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'day' THEN civ.customer_created_at::DATE
                ELSE DATE_TRUNC('month', civ.customer_created_at)::DATE
            END as period_date,
            COALESCE(civ.customer_source::TEXT, 'unknown') as customer_source,
            COUNT(*)::BIGINT as new_customers
        FROM public.customer_info_view civ
        WHERE 
            civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
            AND (p_customer_source IS NULL OR civ.customer_source::TEXT = p_customer_source)
        GROUP BY 
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'day' THEN civ.customer_created_at::DATE
                ELSE DATE_TRUNC('month', civ.customer_created_at)::DATE
            END,
            COALESCE(civ.customer_source::TEXT, 'unknown')
    ),
    cumulative_data AS (
        SELECT 
            tdd.period_date,
            tdd.customer_source,
            tdd.new_customers,
            SUM(tdd.new_customers) OVER (
                PARTITION BY tdd.customer_source 
                ORDER BY tdd.period_date 
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )::BIGINT as cumulative_customers,
            SUM(tdd.new_customers) OVER (PARTITION BY tdd.customer_source)::BIGINT as total_customers
        FROM time_dimension_data tdd
    )
    SELECT 
        cd.period_date::DATE,
        CASE 
            WHEN p_time_dimension = 'year' THEN TO_CHAR(cd.period_date, 'YYYY年')
            WHEN p_time_dimension = 'month' THEN TO_CHAR(cd.period_date, 'YYYY年MM月')
            WHEN p_time_dimension = 'day' THEN TO_CHAR(cd.period_date, 'YYYY年MM月DD日')
            ELSE TO_CHAR(cd.period_date, 'YYYY年MM月DD日')
        END as period_date_formatted,
        cd.customer_source::TEXT,
        cd.new_customers::BIGINT,
        cd.cumulative_customers::BIGINT,
        cd.total_customers::BIGINT,
        p_time_dimension::TEXT as time_dimension
    FROM cumulative_data cd
    ORDER BY cd.customer_source, cd.period_date;
END;
$$ LANGUAGE plpgsql;

-- 2. 用户新增会员趋势函数（按创建者姓名）- 支持多时间维度
CREATE OR REPLACE FUNCTION get_user_customer_growth_trend(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '1 year'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_creator_name TEXT DEFAULT NULL,
    p_time_dimension TEXT DEFAULT 'month' -- 新增参数：时间维度 ('year', 'month', 'day')
)
RETURNS TABLE (
    period_date DATE,
    period_date_formatted TEXT, -- 新增字段：格式化日期（中文格式）
    creator_id UUID,
    creator_name TEXT,
    creator_department TEXT,
    new_customers BIGINT,
    cumulative_customers BIGINT,
    active_customers BIGINT,
    time_dimension TEXT -- 新增字段：标识时间维度
) AS $$
BEGIN
    -- 验证时间维度参数
    IF p_time_dimension NOT IN ('year', 'month', 'day') THEN
        p_time_dimension := 'month';
    END IF;

    RETURN QUERY
    WITH time_dimension_data AS (
        SELECT 
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'day' THEN civ.customer_created_at::DATE
                ELSE DATE_TRUNC('month', civ.customer_created_at)::DATE
            END as period_date,
            civ.creator_id::UUID as creator_id,
            COALESCE(civ.creator_name::TEXT, '未知创建者') as creator_name,
            COALESCE(civ.creator_department::TEXT, '未分配部门') as creator_department,
            COUNT(*)::BIGINT as new_customers,
            COUNT(CASE WHEN civ.customer_status = 'active' THEN 1 END)::BIGINT as active_customers
        FROM public.customer_info_view civ
        WHERE 
            civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
            AND civ.creator_id IS NOT NULL
            AND (p_creator_name IS NULL OR civ.creator_name::TEXT = p_creator_name)
        GROUP BY 
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'day' THEN civ.customer_created_at::DATE
                ELSE DATE_TRUNC('month', civ.customer_created_at)::DATE
            END,
            civ.creator_id,
            civ.creator_name,
            civ.creator_department
    )
    SELECT 
        tdd.period_date::DATE,
        CASE 
            WHEN p_time_dimension = 'year' THEN TO_CHAR(tdd.period_date, 'YYYY年')
            WHEN p_time_dimension = 'month' THEN TO_CHAR(tdd.period_date, 'YYYY年MM月')
            WHEN p_time_dimension = 'day' THEN TO_CHAR(tdd.period_date, 'YYYY年MM月DD日')
            ELSE TO_CHAR(tdd.period_date, 'YYYY年MM月DD日')
        END as period_date_formatted,
        tdd.creator_id::UUID,
        tdd.creator_name::TEXT,
        tdd.creator_department::TEXT,
        tdd.new_customers::BIGINT,
        SUM(tdd.new_customers) OVER (
            PARTITION BY tdd.creator_id
            ORDER BY tdd.period_date 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::BIGINT as cumulative_customers,
        tdd.active_customers::BIGINT,
        p_time_dimension::TEXT as time_dimension
    FROM time_dimension_data tdd
    ORDER BY tdd.creator_name, tdd.period_date;
END;
$$ LANGUAGE plpgsql;

-- 3. 部门新增会员趋势函数（按部门名称）- 支持多时间维度
CREATE OR REPLACE FUNCTION get_department_customer_growth_trend(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '1 year'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_department_name TEXT DEFAULT NULL,
    p_time_dimension TEXT DEFAULT 'month' -- 新增参数：时间维度 ('year', 'month', 'day')
)
RETURNS TABLE (
    period_date DATE,
    period_date_formatted TEXT, -- 新增字段：格式化日期（中文格式）
    department_id UUID,
    department_name TEXT,
    new_customers BIGINT,
    cumulative_customers BIGINT,
    active_customers BIGINT,
    vip_customers BIGINT,
    time_dimension TEXT -- 新增字段：标识时间维度
) AS $$
BEGIN
    -- 验证时间维度参数
    IF p_time_dimension NOT IN ('year', 'month', 'day') THEN
        p_time_dimension := 'month';
    END IF;

    RETURN QUERY
    WITH time_dimension_data AS (
        SELECT 
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'day' THEN civ.customer_created_at::DATE
                ELSE DATE_TRUNC('month', civ.customer_created_at)::DATE
            END as period_date,
            civ.department_id::UUID as department_id,
            COALESCE(civ.creator_department::TEXT, '未命名部门') as department_name,
            COUNT(*)::BIGINT as new_customers,
            COUNT(CASE WHEN civ.customer_status = 'active' THEN 1 END)::BIGINT as active_customers,
            COUNT(CASE WHEN civ.customer_status = 'vip' THEN 1 END)::BIGINT as vip_customers
        FROM public.customer_info_view civ
        WHERE 
            civ.customer_created_at::DATE BETWEEN p_start_date AND p_end_date
            AND civ.department_id IS NOT NULL
            AND (p_department_name IS NULL OR civ.creator_department::TEXT = p_department_name)
        GROUP BY 
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', civ.customer_created_at)::DATE
                WHEN p_time_dimension = 'day' THEN civ.customer_created_at::DATE
                ELSE DATE_TRUNC('month', civ.customer_created_at)::DATE
            END,
            civ.department_id,
            civ.creator_department
    )
    SELECT 
        tdd.period_date::DATE,
        CASE 
            WHEN p_time_dimension = 'year' THEN TO_CHAR(tdd.period_date, 'YYYY年')
            WHEN p_time_dimension = 'month' THEN TO_CHAR(tdd.period_date, 'YYYY年MM月')
            WHEN p_time_dimension = 'day' THEN TO_CHAR(tdd.period_date, 'YYYY年MM月DD日')
            ELSE TO_CHAR(tdd.period_date, 'YYYY年MM月DD日')
        END as period_date_formatted,
        tdd.department_id::UUID,
        tdd.department_name::TEXT,
        tdd.new_customers::BIGINT,
        SUM(tdd.new_customers) OVER (
            PARTITION BY tdd.department_id 
            ORDER BY tdd.period_date 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::BIGINT as cumulative_customers,
        tdd.active_customers::BIGINT,
        tdd.vip_customers::BIGINT,
        p_time_dimension::TEXT as time_dimension
    FROM time_dimension_data tdd
    ORDER BY tdd.department_name, tdd.period_date;
END;
$$ LANGUAGE plpgsql;


-- 4. 客户维护趋势函数（基于contact_records、customers、users、department表的综合分析）
CREATE OR REPLACE FUNCTION get_customer_maintenance_trend(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '6 months'),
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_staff_name TEXT DEFAULT NULL, -- 按员工姓名筛选
    p_time_dimension TEXT DEFAULT 'month' -- 时间维度 ('year', 'month', 'day')
)
RETURNS TABLE (
    period_date DATE,
    period_date_formatted TEXT, -- 格式化日期（中文格式）
    staff_id UUID, -- 员工ID
    staff_name TEXT, -- 员工姓名
    department_name TEXT, -- 部门名称
    total_customers BIGINT, -- 总客户数量（时间段终点的客户总数）
    contacted_customers BIGINT, -- 该周期内已联系客户数
    uncontacted_customers BIGINT, -- 该周期内未联系客户数
    contact_rate NUMERIC, -- 联系率（百分比）
    avg_days_since_contact NUMERIC, -- 平均未联系天数
    total_contacts BIGINT, -- 该周期内总联系次数
    last_contact_date DATE, -- 该周期内最后联系日期
    vip_customers BIGINT, -- VIP客户总数（时间段终点的VIP客户数）
    new_customers BIGINT, -- 该周期内新增客户数
    time_dimension TEXT -- 时间维度
) AS $$
BEGIN
    -- 验证时间维度参数
    IF p_time_dimension NOT IN ('year', 'month', 'day') THEN
        p_time_dimension := 'month';
    END IF;

    RETURN QUERY
    WITH time_dimension_data AS (
        SELECT 
            -- 周期起始日期
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', generate_series)::DATE
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', generate_series)::DATE
                WHEN p_time_dimension = 'day' THEN generate_series::DATE
                ELSE DATE_TRUNC('month', generate_series)::DATE
            END as period_date,
            -- 周期结束时间（精确到秒）
            CASE 
                WHEN p_time_dimension = 'year' THEN (DATE_TRUNC('year', generate_series) + INTERVAL '1 year - 1 second')::TIMESTAMP
                WHEN p_time_dimension = 'month' THEN (DATE_TRUNC('month', generate_series) + INTERVAL '1 month - 1 second')::TIMESTAMP
                WHEN p_time_dimension = 'day' THEN (generate_series::DATE + INTERVAL '1 day - 1 second')::TIMESTAMP
                ELSE (DATE_TRUNC('month', generate_series) + INTERVAL '1 month - 1 second')::TIMESTAMP
            END as period_end_time
        FROM generate_series(
            CASE 
                WHEN p_time_dimension = 'year' THEN DATE_TRUNC('year', p_start_date)
                WHEN p_time_dimension = 'month' THEN DATE_TRUNC('month', p_start_date)
                ELSE p_start_date
            END,
            p_end_date,
            CASE 
                WHEN p_time_dimension = 'year' THEN INTERVAL '1 year'
                WHEN p_time_dimension = 'month' THEN INTERVAL '1 month'
                WHEN p_time_dimension = 'day' THEN INTERVAL '1 day'
                ELSE INTERVAL '1 month'
            END
        ) AS generate_series
    ),
    staff_customer_base AS (
        SELECT 
            c.id as customer_id,
            c.name as customer_name,
            c.status as customer_status,
            c.created_at as customer_created_at, -- 假设为TIMESTAMP类型
            c.created_by,
            u.name as staff_name,
            u.id as staff_id,
            d.department_name,
            CASE 
                WHEN c.last_connect_at IS NOT NULL THEN CURRENT_DATE - c.last_connect_at::DATE
                ELSE CURRENT_DATE - c.created_at::DATE
            END as days_since_contact
        FROM public.customers c
        LEFT JOIN public.users u ON c.created_by = u.id
        LEFT JOIN public.department d ON u.department = d.id
        WHERE c.created_by IS NOT NULL
            AND (p_staff_name IS NULL OR u.name = p_staff_name)
    ),
    -- 计算员工的总客户数和VIP客户总数（基于时间段终点的数量）
    staff_total_customers AS (
        SELECT
            scb.staff_id,
            tdd.period_date,
            tdd.period_end_time, -- 关联周期结束时间
            -- 统计到周期结束时间为止的客户总数
            COUNT(DISTINCT CASE WHEN scb.customer_created_at <= tdd.period_end_time THEN scb.customer_id END) as total_customers,
            -- 统计到周期结束时间为止的VIP客户数
            COUNT(DISTINCT CASE WHEN scb.customer_status = 'vip' AND scb.customer_created_at <= tdd.period_end_time THEN scb.customer_id END) as vip_customers
        FROM staff_customer_base scb
        CROSS JOIN time_dimension_data tdd
        GROUP BY scb.staff_id, tdd.period_date, tdd.period_end_time
    ),
    contact_analysis AS (
        SELECT 
            DATE_TRUNC(p_time_dimension, cr.contact_time)::DATE as period_date,
            cr.staff_id,
            cr.customer_id,
            COUNT(*) as contact_count,
            MAX(cr.contact_time)::DATE as last_contact_date
        FROM public.contact_records cr
        WHERE cr.contact_time BETWEEN p_start_date::TIMESTAMP AND (p_end_date::TIMESTAMP + INTERVAL '1 day - 1 second')
        GROUP BY 
            DATE_TRUNC(p_time_dimension, cr.contact_time)::DATE,
            cr.staff_id,
            cr.customer_id
    ),
    customer_stats AS (
        SELECT 
            tdd.period_date,
            tdd.period_end_time, -- 用于关联总客户数计算
            scb.staff_id,
            scb.staff_name,
            scb.department_name,
            -- 关联总客户数（基于时间段终点的数量）
            COALESCE(stc.total_customers, 0) as total_customers,
            COALESCE(stc.vip_customers, 0) as vip_customers,
            -- 该周期内已联系客户数
            COUNT(DISTINCT CASE 
                WHEN ca.customer_id IS NOT NULL AND scb.customer_created_at <= tdd.period_end_time THEN scb.customer_id 
            END) as contacted_customers,
            -- 总客户数 - 已联系客户数 = 未联系客户数
            (COALESCE(stc.total_customers, 0) - COUNT(DISTINCT CASE 
                WHEN ca.customer_id IS NOT NULL AND scb.customer_created_at <= tdd.period_end_time THEN scb.customer_id 
            END)) as uncontacted_customers,
            -- 该周期内总联系次数
            COALESCE(SUM(CASE WHEN scb.customer_created_at <= tdd.period_end_time THEN ca.contact_count END), 0) as total_contacts,
            -- 该周期内最后联系日期
            MAX(CASE WHEN scb.customer_created_at <= tdd.period_end_time THEN ca.last_contact_date END) as last_contact_date,
            -- 平均未联系天数
            AVG(CASE WHEN scb.customer_created_at <= tdd.period_end_time THEN scb.days_since_contact END)::NUMERIC as avg_days_since_contact,
            -- 该周期内新增客户数（统计周期内创建的客户）
            COUNT(DISTINCT CASE 
                WHEN scb.customer_created_at BETWEEN tdd.period_date::TIMESTAMP AND tdd.period_end_time
                THEN scb.customer_id 
            END) as new_customers
        FROM time_dimension_data tdd
        CROSS JOIN staff_customer_base scb
        -- 关联总客户数表（基于时间段终点的数量）
        LEFT JOIN staff_total_customers stc ON scb.staff_id = stc.staff_id 
            AND tdd.period_date = stc.period_date 
            AND tdd.period_end_time = stc.period_end_time
        -- 关联联系记录
        LEFT JOIN contact_analysis ca ON ca.staff_id = scb.staff_id 
            AND ca.customer_id = scb.customer_id 
            AND ca.period_date = tdd.period_date
        GROUP BY tdd.period_date, tdd.period_end_time, scb.staff_id, scb.staff_name, scb.department_name, 
                 COALESCE(stc.total_customers, 0), COALESCE(stc.vip_customers, 0)
        HAVING COALESCE(stc.total_customers, 0) > 0 -- 只保留有客户的员工
    )
    SELECT 
        cs.period_date,
        CASE 
            WHEN p_time_dimension = 'year' THEN TO_CHAR(cs.period_date, 'YYYY年')
            WHEN p_time_dimension = 'month' THEN TO_CHAR(cs.period_date, 'YYYY年MM月')
            WHEN p_time_dimension = 'day' THEN TO_CHAR(cs.period_date, 'YYYY年MM月DD日')
            ELSE TO_CHAR(cs.period_date, 'YYYY年MM月DD日')
        END as period_date_formatted,
        cs.staff_id,
        cs.staff_name::TEXT,
        cs.department_name::TEXT,
        cs.total_customers::BIGINT,
        cs.contacted_customers::BIGINT,
        cs.uncontacted_customers::BIGINT,
        CASE 
            WHEN cs.total_customers > 0 THEN 
                ROUND((cs.contacted_customers::NUMERIC / cs.total_customers::NUMERIC) * 100, 2)
            ELSE 0
        END as contact_rate,
        COALESCE(cs.avg_days_since_contact, 0)::NUMERIC as avg_days_since_contact,
        cs.total_contacts::BIGINT,
        cs.last_contact_date,
        cs.vip_customers::BIGINT,
        cs.new_customers::BIGINT,
        p_time_dimension::TEXT as time_dimension
    FROM customer_stats cs
    ORDER BY cs.staff_name, cs.period_date;
END;
$$ LANGUAGE plpgsql;
    


-- 添加函数注释
COMMENT ON FUNCTION get_customer_growth_by_source(DATE, DATE, TEXT, TEXT) IS '获取按客户来源的增长趋势统计，支持年、月、日三种时间维度，返回中文格式化日期';
COMMENT ON FUNCTION get_user_customer_growth_trend(DATE, DATE, TEXT, TEXT) IS '获取按用户（创建者姓名）的新增客户趋势，支持年、月、日三种时间维度，返回中文格式化日期';
COMMENT ON FUNCTION get_department_customer_growth_trend(DATE, DATE, TEXT, TEXT) IS '获取按部门名称的新增客户趋势，支持年、月、日三种时间维度，返回中文格式化日期';
COMMENT ON FUNCTION get_customer_maintenance_trend(DATE, DATE, TEXT, TEXT) IS '获取客户维护趋势，基于contact_records、customers、users、department表的综合分析，支持按员工姓名筛选，total_customers统计当前时间节点之前创建的客户总数，支持年、月、日三种时间维度，返回中文格式化日期';