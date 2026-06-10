-- 高性能客户电话号码对比（按号码列表 + 状态范围查询）
-- 在 Supabase SQL Editor 中执行一次即可
-- 也可运行: node scripts/deploy_customer_compare_function.js（需配置 SUPABASE_DB_PASSWORD 或 DATABASE_URL）

CREATE OR REPLACE FUNCTION compare_customer_phones(
  phone_list text[],
  status_list text[] DEFAULT ARRAY['active', 'inactive', 'vip']::text[]
)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  email text,
  company text,
  status text,
  source text,
  created_at timestamptz,
  created_by uuid
)
LANGUAGE sql
STABLE
SET statement_timeout TO '120s'
AS $$
  WITH input AS (
    SELECT DISTINCT trim(p) AS raw_phone
    FROM unnest(phone_list) AS t(p)
    WHERE p IS NOT NULL AND trim(p) <> ''
  ),
  keys AS (
    SELECT DISTINCT k FROM (
      SELECT raw_phone AS k FROM input
      UNION ALL
      SELECT regexp_replace(raw_phone, '\D', '', 'g') FROM input
      UNION ALL
      SELECT ltrim(regexp_replace(raw_phone, '\D', '', 'g'), '0') FROM input
      UNION ALL
      SELECT '0' || regexp_replace(raw_phone, '\D', '', 'g')
        FROM input
        WHERE regexp_replace(raw_phone, '\D', '', 'g') <> ''
          AND regexp_replace(raw_phone, '\D', '', 'g') !~ '^0'
    ) s
    WHERE k IS NOT NULL AND k <> ''
  )
  SELECT
    c.id,
    c.name,
    c.phone,
    c.email,
    c.company,
    c.status,
    c.source,
    c.created_at,
    c.created_by
  FROM customers c
  INNER JOIN keys ON c.phone = keys.k
  WHERE c.status = ANY(status_list);
$$;

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_status_phone ON customers(status, phone);
