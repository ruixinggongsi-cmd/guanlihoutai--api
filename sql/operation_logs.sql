-- 用户操作日志表
-- 用于记录用户在系统中的各种操作行为，支持操作审计、行为分析和安全监控

CREATE TABLE public.operation_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NULL,                              -- 用户ID（外键关联users表）
    username TEXT NULL,                             -- 用户名（操作时的用户名）
    operation_type TEXT NOT NULL,                   -- 操作类型：create, read, update, delete, export, import, login, logout等
    operation_name TEXT NOT NULL,                   -- 操作名称：添加用户、修改部门、删除设备等
    operation_result TEXT NOT NULL DEFAULT 'success', -- 操作结果：success, failed, denied, error
    fail_reason TEXT NULL,                          -- 失败原因：权限不足、数据不存在、系统错误等
    -- 业务数据信息
    target_type TEXT NULL,                          -- 目标对象类型：user, department, equipment, expense, customer等
    target_id UUID NULL,                            -- 目标对象ID（相关业务表的主键）
    target_name TEXT NULL,                          -- 目标对象名称（便于查询和显示）
    old_data JSONB NULL,                            -- 操作前的数据（用于数据对比和回滚）
    new_data JSONB NULL,                            -- 操作后的数据（用于数据对比和审计）
    changed_fields TEXT[] NULL,                     -- 变更的字段列表（仅记录发生变化的字段名）
    -- 请求信息
    request_method TEXT NULL,                       -- HTTP请求方法：GET, POST, PUT, DELETE等
    request_url TEXT NULL,                          -- 请求URL地址
    request_params JSONB NULL,                      -- 请求参数（查询参数、表单数据等）
    -- 设备信息
    device_info JSONB NULL,                         -- 设备信息JSON（操作系统、浏览器、设备类型等）
    user_agent TEXT NULL,                           -- 用户代理字符串
    ip_address INET NULL,                           -- IP地址
    ip_location JSONB NULL,                         -- IP地理位置信息
    -- 性能信息
    execution_time_ms INTEGER NULL,                 -- 执行时间（毫秒）
    memory_usage_mb NUMERIC(10,2) NULL,            -- 内存使用（MB）
    -- 时间信息
    operation_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), -- 操作时间
    -- 创建时间
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT operation_logs_pkey PRIMARY KEY (id),
    CONSTRAINT fk_operation_logs_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_operation_logs_menu FOREIGN KEY (menu_id) REFERENCES public.menus(id) ON DELETE SET NULL,
    CONSTRAINT chk_operation_result CHECK (operation_result IN ('success', 'failed', 'denied', 'error')),
    CONSTRAINT chk_operation_type CHECK (operation_type IN ('create', 'read', 'update', 'delete', 'export', 'import', 'login', 'logout', 'approve', 'reject', 'assign', 'transfer', 'enable', 'disable', 'reset', 'config'))
) TABLESPACE pg_default;

-- 创建索引
-- 基于操作日志的常见查询场景优化

-- 核心查询索引（高频使用）
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON public.operation_logs USING BTREE (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_username ON public.operation_logs USING BTREE (username) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_operation_time_desc ON public.operation_logs USING BTREE (operation_time DESC) TABLESPACE pg_default;

-- 菜单相关索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_menu_id ON public.operation_logs USING BTREE (menu_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_menu_path ON public.operation_logs USING BTREE (menu_path) TABLESPACE pg_default;

-- 操作类型和结果索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_operation_type ON public.operation_logs USING BTREE (operation_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_operation_result ON public.operation_logs USING BTREE (operation_result) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_fail_reason ON public.operation_logs USING BTREE (fail_reason) TABLESPACE pg_default WHERE fail_reason IS NOT NULL;

-- 目标对象索引（用于业务数据追踪）
CREATE INDEX IF NOT EXISTS idx_operation_logs_target_type ON public.operation_logs USING BTREE (target_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_target_id ON public.operation_logs USING BTREE (target_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_target_type_id ON public.operation_logs USING BTREE (target_type, target_id) TABLESPACE pg_default;

-- 安全分析索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_ip_address ON public.operation_logs USING BTREE (ip_address) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_ip_time ON public.operation_logs USING BTREE (ip_address, operation_time DESC) TABLESPACE pg_default;

-- 复合索引（优化常见组合查询）
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_time ON public.operation_logs USING BTREE (user_id, operation_time DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_type_time ON public.operation_logs USING BTREE (user_id, operation_type, operation_time DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_menu_type_time ON public.operation_logs USING BTREE (menu_id, operation_type, operation_time DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_type_result_time ON public.operation_logs USING BTREE (operation_type, operation_result, operation_time DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_operation_logs_target_time ON public.operation_logs USING BTREE (target_type, target_id, operation_time DESC) TABLESPACE pg_default;

-- 性能分析索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_execution_time ON public.operation_logs USING BTREE (execution_time_ms) TABLESPACE pg_default WHERE execution_time_ms IS NOT NULL;

-- 时间范围查询优化
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at_desc ON public.operation_logs USING BTREE (created_at DESC) TABLESPACE pg_default;

-- 添加表和列注释
COMMENT ON TABLE public.operation_logs IS '用户操作日志表 - 记录用户在系统中的各种操作行为，支持操作审计、行为分析和安全监控';
COMMENT ON COLUMN public.operation_logs.id IS '操作日志记录唯一标识（UUID主键）';
COMMENT ON COLUMN public.operation_logs.user_id IS '用户ID，外键关联users表，记录执行操作的用户';
COMMENT ON COLUMN public.operation_logs.username IS '用户名，操作时的用户名，用于审计追踪';
COMMENT ON COLUMN public.operation_logs.menu_id IS '菜单ID，外键关联menus表，记录操作发生的菜单页面';
COMMENT ON COLUMN public.operation_logs.menu_name IS '菜单名称，操作时的菜单名称，便于查询和显示';
COMMENT ON COLUMN public.operation_logs.menu_path IS '菜单路径，操作时的菜单路径，用于精确定位操作位置';
COMMENT ON COLUMN public.operation_logs.operation_type IS '操作类型：create(创建), read(读取), update(更新), delete(删除), export(导出), import(导入), login(登录), logout(登出), approve(审批), reject(拒绝), assign(分配), transfer(转移), enable(启用), disable(禁用), reset(重置), config(配置)';
COMMENT ON COLUMN public.operation_logs.operation_name IS '操作名称，具体的业务操作描述，如"添加用户"、"修改部门"、"删除设备"等';
COMMENT ON COLUMN public.operation_logs.operation_result IS '操作结果：success(成功), failed(失败), denied(拒绝), error(错误)';
COMMENT ON COLUMN public.operation_logs.fail_reason IS '失败原因，记录操作失败的具体原因，如权限不足、数据不存在、系统错误等';
COMMENT ON COLUMN public.operation_logs.target_type IS '目标对象类型，如user、department、equipment、expense、customer等业务对象类型';
COMMENT ON COLUMN public.operation_logs.target_id IS '目标对象ID，相关业务表的主键，用于追踪具体操作的数据对象';
COMMENT ON COLUMN public.operation_logs.target_name IS '目标对象名称，便于查询和显示，如用户姓名、部门名称、设备名称等';
COMMENT ON COLUMN public.operation_logs.old_data IS '操作前的数据快照，JSON格式存储，用于数据对比和回滚操作';
COMMENT ON COLUMN public.operation_logs.new_data IS '操作后的数据快照，JSON格式存储，用于数据对比和审计追踪';
COMMENT ON COLUMN public.operation_logs.changed_fields IS '变更的字段列表，仅记录发生变化的字段名，便于快速识别修改内容';
COMMENT ON COLUMN public.operation_logs.request_method IS 'HTTP请求方法，如GET、POST、PUT、DELETE等，用于分析请求类型';
COMMENT ON COLUMN public.operation_logs.request_url IS '请求URL地址，记录完整的请求路径，便于追踪操作入口';
COMMENT ON COLUMN public.operation_logs.request_params IS '请求参数，JSON格式存储查询参数、表单数据等，用于完整的操作记录';
COMMENT ON COLUMN public.operation_logs.device_info IS '设备信息JSON，包含操作系统、浏览器、设备类型等客户端环境信息';
COMMENT ON COLUMN public.operation_logs.user_agent IS '用户代理字符串，原始HTTP User-Agent头信息，用于设备识别';
COMMENT ON COLUMN public.operation_logs.ip_address IS '客户端IP地址，用于地理位置分析和安全审计';
COMMENT ON COLUMN public.operation_logs.ip_location IS 'IP地理位置信息JSON，包含国家、省份、城市等地理位置数据';
COMMENT ON COLUMN public.operation_logs.execution_time_ms IS '操作执行时间，毫秒为单位，用于性能分析和优化';
COMMENT ON COLUMN public.operation_logs.memory_usage_mb IS '内存使用量，MB为单位，用于资源使用分析';
COMMENT ON COLUMN public.operation_logs.operation_time IS '操作时间戳，记录实际操作发生的时间';
COMMENT ON COLUMN public.operation_logs.created_at IS '记录创建时间，与operation_time保持一致用于数据完整性';

-- 创建更新时间触发器函数（预留，可根据需要启用）
CREATE OR REPLACE FUNCTION update_operation_logs_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- 操作日志通常不需要更新，此函数预留用于可能的扩展需求
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;