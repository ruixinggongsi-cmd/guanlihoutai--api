-- 客户各状态数量统计（单次聚合，避免 PostgREST 大表 count 超时）
-- 在 Supabase SQL Editor 中执行一次即可

CREATE OR REPLACE FUNCTION get_customer_status_counts()
RETURNS TABLE (
  active_count bigint,
  inactive_count bigint,
  vip_count bigint,
  total_count bigint
)
LANGUAGE sql
STABLE
SET statement_timeout TO '120s'
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'active')::bigint AS active_count,
    COUNT(*) FILTER (WHERE status = 'inactive')::bigint AS inactive_count,
    COUNT(*) FILTER (WHERE status = 'vip')::bigint AS vip_count,
    COUNT(*) FILTER (WHERE status IN ('active', 'inactive', 'vip'))::bigint AS total_count
  FROM customers;
$$;

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
