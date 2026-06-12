-- 客户状态修改记录：允许非上传人修改状态，但必须保留修改人和时间
CREATE TABLE IF NOT EXISTS customer_status_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  compare_phone text,
  note text
);

CREATE INDEX IF NOT EXISTS idx_customer_status_change_logs_customer_id
  ON customer_status_change_logs(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_status_change_logs_changed_by
  ON customer_status_change_logs(changed_by);

CREATE INDEX IF NOT EXISTS idx_customer_status_change_logs_changed_at
  ON customer_status_change_logs(changed_at DESC);
