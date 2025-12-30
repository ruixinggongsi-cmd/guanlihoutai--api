-- 先删除旧视图
DROP VIEW IF EXISTS public.contact_records_view;

-- 重建视图，彻底移除username列，仅保留staff_username
CREATE OR REPLACE VIEW public.contact_records_view AS
SELECT 
    cr.id,
    cr.customer_id,
    cr.contact_time,
    cr.content,
    cr.staff_id,
    cr.staff_name,
    cr.created_at,
    cr.updated_at,
    -- 客户信息
    c.name as customer_name,
    c.company as customer_company,
    c.phone as customer_phone,
    c.email as customer_email,
    c.status as customer_status,
    c.source as customer_source,
    c.address as customer_address,
    c.notes as customer_notes,
    c.last_connect_at as customer_last_connect_at,
    c.created_at as customer_created_at,
    c.updated_at as customer_updated_at,
    -- 员工信息（仅使用staff_username，彻底移除username）
    u.username as staff_username,  -- 明确为员工用户名
    u.name as user_full_name,
    u.email as user_email,
    u.phone as user_phone,
    u.status as user_status,
    -- 部门信息
    d.id as department_id,
    d.department_name,
    d.parent_id as department_parent_id,
    -- 时间维度信息
    DATE(cr.contact_time) as contact_date,
    EXTRACT(YEAR FROM cr.contact_time) as contact_year,
    EXTRACT(MONTH FROM cr.contact_time) as contact_month,
    EXTRACT(DAY FROM cr.contact_time) as contact_day,
    EXTRACT(HOUR FROM cr.contact_time) as contact_hour,
    EXTRACT(DOW FROM cr.contact_time) as contact_weekday,
    TO_CHAR(cr.contact_time, 'YYYY-MM') as contact_year_month,
    TO_CHAR(cr.contact_time, 'YYYY-WW') as contact_year_week,
    -- 联系时间分类
    CASE 
        WHEN EXTRACT(HOUR FROM cr.contact_time) BETWEEN 9 AND 12 THEN '上午'
        WHEN EXTRACT(HOUR FROM cr.contact_time) BETWEEN 13 AND 18 THEN '下午'
        ELSE '其他时间'
    END as contact_time_period,
    -- 联系内容分析
    LENGTH(cr.content) as content_length,
    CASE 
        WHEN LENGTH(cr.content) < 50 THEN '简短'
        WHEN LENGTH(cr.content) < 200 THEN '一般'
        ELSE '详细'
    END as content_detail_level,
    -- 联系时效性分析
    CASE 
        WHEN cr.created_at::date = cr.contact_time::date THEN '当天记录'
        WHEN cr.created_at::date > cr.contact_time::date THEN '事后补录'
        ELSE '提前记录'
    END as record_timing,
    -- 数据质量指标
    CASE 
        WHEN cr.content IS NULL OR TRIM(cr.content) = '' THEN '内容缺失'
        WHEN LENGTH(cr.content) < 10 THEN '内容过短'
        ELSE '内容正常'
    END as content_quality,
    -- 客户状态标签
    CASE 
        WHEN c.status = 'active' THEN '活跃客户'
        WHEN c.status = 'vip' THEN 'VIP客户'
        WHEN c.status = 'inactive' THEN '非活跃客户'
        ELSE '未知状态'
    END as customer_status_label,
    -- 客户来源标签
    CASE 
        WHEN c.source = 'online' THEN '线上渠道'
        WHEN c.source = 'offline' THEN '线下渠道'
        WHEN c.source = 'referral' THEN '客户推荐'
        WHEN c.source = 'other' THEN '其他渠道'
        ELSE '未知来源'
    END as customer_source_label,
    -- 客户联系间隔天数
    CASE 
        WHEN c.last_connect_at IS NOT NULL THEN 
            DATE_PART('day', cr.contact_time - c.last_connect_at)
        ELSE NULL
    END as days_since_last_contact
FROM 
    public.contact_records cr
    LEFT JOIN public.customers c ON cr.customer_id = c.id
    LEFT JOIN public.users u ON cr.staff_id = u.id
    LEFT JOIN public.department d ON u.department = d.id;
    