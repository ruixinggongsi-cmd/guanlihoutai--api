-- 按上传人汇总客户数量（含各状态分类，支持时间范围）
-- 在 Supabase SQL Editor 中执行一次即可

CREATE OR REPLACE FUNCTION get_customer_uploader_summary(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS TABLE (
  uploader_id uuid,
  total_count bigint,
  active_count bigint,
  inactive_count bigint,
  vip_count bigint
)
LANGUAGE sql
STABLE
SET statement_timeout TO '120s'
AS $$
  SELECT
    created_by AS uploader_id,
    COUNT(*)::bigint AS total_count,
    COUNT(*) FILTER (WHERE status = 'active')::bigint AS active_count,
    COUNT(*) FILTER (WHERE status = 'inactive')::bigint AS inactive_count,
    COUNT(*) FILTER (WHERE status = 'vip')::bigint AS vip_count
  FROM customers
  WHERE created_by IS NOT NULL
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at < p_end)
  GROUP BY created_by
  ORDER BY total_count DESC;
$$;

CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);
