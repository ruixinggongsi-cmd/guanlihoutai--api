-- 客户信息视图
-- 整合客户基本信息、创建者信息、统计信息等

CREATE OR REPLACE VIEW public.customer_info_view AS
SELECT 
    c.id as customer_id,
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
    c.created_by as created_by,
    
    -- 创建者信息
    u.id as creator_id,
    u.username as creator_username,
    u.name as creator_name,
    u.email as creator_email,
    u.phone as creator_phone,
    u.department as creator_department_id,
    u.status as creator_status,
    
    -- 创建者部门信息
    d.id as department_id,
    d.department_name as creator_department,
    d.parent_id as department_parent_id,
    
    CASE 
        WHEN c.last_connect_at IS NULL THEN '从未联系'
        WHEN c.last_connect_at >= CURRENT_DATE - INTERVAL '30 days' THEN '高度活跃'
        WHEN c.last_connect_at >= CURRENT_DATE - INTERVAL '90 days' THEN '中度活跃'
        WHEN c.last_connect_at >= CURRENT_DATE - INTERVAL '180 days' THEN '低度活跃'
        ELSE '长期未联系'
    END as activity_level,
    
    -- 时间计算字段
    CASE 
        WHEN c.last_connect_at IS NULL THEN NULL
        ELSE (CURRENT_DATE - c.last_connect_at::DATE)::INTEGER
    END as days_since_last_connect,
    (CURRENT_DATE - c.created_at::DATE)::INTEGER as customer_age_days

FROM public.customers c
LEFT JOIN public.users u ON c.created_by = u.id
LEFT JOIN public.department d ON u.department = d.id;

-- 添加视图注释
COMMENT ON VIEW public.customer_info_view IS '客户信息综合视图，包含客户基本信息、创建者信息、部门信息和统计信息';

-- 创建视图索引（如果可能）
-- 注意：PostgreSQL不允许直接在视图上创建索引，但可以使用物化视图