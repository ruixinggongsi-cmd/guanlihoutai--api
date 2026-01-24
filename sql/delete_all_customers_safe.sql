-- 安全删除所有客户数据（带确认和备份提示）
-- ⚠️ 警告：此操作不可恢复！

-- 第一步：查看当前客户数量
SELECT 
    COUNT(*) as total_customers,
    COUNT(DISTINCT created_by) as total_creators,
    MIN(created_at) as earliest_customer,
    MAX(created_at) as latest_customer
FROM public.customers;

-- 第二步：查看按创建人分组的客户数量
SELECT 
    created_by,
    COUNT(*) as customer_count
FROM public.customers
GROUP BY created_by
ORDER BY customer_count DESC;

-- 第三步：查看按状态分组的客户数量
SELECT 
    status,
    COUNT(*) as customer_count
FROM public.customers
GROUP BY status
ORDER BY customer_count DESC;

-- 第四步：执行删除（取消下面的注释）
-- 使用事务，可以回滚
BEGIN;

-- 删除所有客户数据
DELETE FROM public.customers;

-- 查看删除后的结果（应该为0）
SELECT COUNT(*) as remaining_customers FROM public.customers;

-- 如果确认无误，执行 COMMIT; 提交删除
-- 如果需要回滚，执行 ROLLBACK; 取消删除
-- COMMIT;
-- ROLLBACK;

