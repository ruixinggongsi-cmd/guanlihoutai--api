-- 客户对比上传批次记录（谁在什么时候上传了多少条）
CREATE TABLE IF NOT EXISTS customer_upload_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text,
  total_submitted integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  duplicate_count integer DEFAULT 0,
  invalid_count integer DEFAULT 0,
  compare_statuses jsonb,
  default_status text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_customer_upload_logs_user_id ON customer_upload_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_upload_logs_uploaded_at ON customer_upload_logs(uploaded_at DESC);
