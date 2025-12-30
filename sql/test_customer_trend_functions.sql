-- 测试修改后的客户趋势函数
-- 测试用户姓名和部门名称参数的函数

-- 测试1: 按创建者姓名查询用户趋势
SELECT '测试用户趋势 - 按创建者姓名' as test_name;
SELECT * FROM get_user_customer_growth_trend(
    '2023-01-01'::DATE,
    '2023-12-31'::DATE,
    '张三'  -- 使用创建者姓名而不是UUID
);

-- 测试2: 按部门名称查询部门趋势
SELECT '测试部门趋势 - 按部门名称' as test_name;
SELECT * FROM get_department_customer_growth_trend(
    '2023-01-01'::DATE,
    '2023-12-31'::DATE,
    '销售部'  -- 使用部门名称而不是UUID
);

-- 测试3: 不指定创建者姓名（获取所有用户数据）
SELECT '测试用户趋势 - 不指定创建者' as test_name;
SELECT * FROM get_user_customer_growth_trend(
    '2023-01-01'::DATE,
    '2023-12-31'::DATE,
    NULL  -- 不指定创建者姓名
);

-- 测试4: 不指定部门名称（获取所有部门数据）
SELECT '测试部门趋势 - 不指定部门' as test_name;
SELECT * FROM get_department_customer_growth_trend(
    '2023-01-01'::DATE,
    '2023-12-31'::DATE,
    NULL  -- 不指定部门名称
);

-- 测试5: 测试客户增长趋势（按来源）
SELECT '测试客户增长趋势 - 按来源' as test_name;
SELECT * FROM get_customer_growth_by_source(
    '2023-01-01'::DATE,
    '2023-12-31'::DATE,
    '线上'  -- 指定客户来源
);

-- 测试6: 测试客户维护趋势
SELECT '测试客户维护趋势' as test_name;
SELECT * FROM get_customer_maintenance_trend(
    '2023-06-01'::DATE,
    '2023-12-31'::DATE,
    '高'  -- 指定活跃度级别
);

-- 测试7: 查看函数注释
SELECT '查看函数注释' as test_name;
SELECT 
    proname as function_name,
    proargtypes as argument_types,
    description
FROM pg_proc 
LEFT JOIN pg_description ON pg_proc.oid = pg_description.objoid
WHERE proname IN (
    'get_customer_growth_by_source',
    'get_user_customer_growth_trend', 
    'get_department_customer_growth_trend',
    'get_customer_maintenance_trend'
);

-- 测试8: 验证customer_info_view中的数据
SELECT '验证customer_info_view数据' as test_name;
SELECT 
    COUNT(*) as total_customers,
    COUNT(DISTINCT creator_name) as unique_creators,
    COUNT(DISTINCT creator_department) as unique_departments,
    COUNT(DISTINCT customer_source) as unique_sources
FROM public.customer_info_view
WHERE customer_created_at::DATE BETWEEN '2023-01-01' AND '2023-12-31';

-- 测试9: 查看创建者姓名列表
SELECT '查看创建者姓名列表' as test_name;
SELECT DISTINCT 
    creator_name,
    creator_department,
    COUNT(*) as customer_count
FROM public.customer_info_view
WHERE customer_created_at::DATE BETWEEN '2023-01-01' AND '2023-12-31'
    AND creator_name IS NOT NULL
GROUP BY creator_name, creator_department
ORDER BY customer_count DESC
LIMIT 10;

-- 测试10: 查看部门列表
SELECT '查看部门列表' as test_name;
SELECT DISTINCT 
    creator_department as department_name,
    COUNT(*) as customer_count
FROM public.customer_info_view
WHERE customer_created_at::DATE BETWEEN '2023-01-01' AND '2023-12-31'
    AND creator_department IS NOT NULL
GROUP BY creator_department
ORDER BY customer_count DESC;