-- 用户登录日志表
-- 用于记录用户的登录活动，包括成功和失败的登录尝试

CREATE TABLE public.login_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NULL,                          -- 用户ID（登录成功时记录）
    username TEXT NULL,                         -- 登录时使用的用户名
    login_type TEXT NOT NULL DEFAULT 'password'::TEXT, -- 登录类型：password, sms, email, oauth等
    login_result TEXT NOT NULL,                 -- 登录结果：success, failed, locked, disabled
    fail_reason TEXT NULL,                      -- 失败原因：invalid_password, user_not_found, account_locked, account_disabled等
    -- 设备信息
    device_info JSONB NULL,                     -- 设备信息JSON（操作系统、浏览器、设备类型等）
    user_agent TEXT NULL,                       -- 用户代理字符串
    ip_address INET NULL,                       -- IP地址
    ip_location JSONB NULL,                     -- IP地理位置信息
    -- 时间信息
    login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), -- 登录时间
    -- 创建时间
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT login_logs_pkey PRIMARY KEY (id),
    CONSTRAINT fk_login_logs_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
) TABLESPACE pg_default;

-- 创建索引
-- 基于实际表结构和常见查询场景优化

-- 核心查询索引（高频使用）
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs USING BTREE (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_username ON public.login_logs USING BTREE (username) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_login_time_desc ON public.login_logs USING BTREE (login_time DESC) TABLESPACE pg_default;

-- 登录结果分析索引
CREATE INDEX IF NOT EXISTS idx_login_logs_result ON public.login_logs USING BTREE (login_result) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_type ON public.login_logs USING BTREE (login_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_fail_reason ON public.login_logs USING BTREE (fail_reason) TABLESPACE pg_default WHERE fail_reason IS NOT NULL;

-- 安全分析索引
CREATE INDEX IF NOT EXISTS idx_login_logs_ip_address ON public.login_logs USING BTREE (ip_address) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_ip_time ON public.login_logs USING BTREE (ip_address, login_time DESC) TABLESPACE pg_default;

-- 复合索引（优化常见组合查询）
CREATE INDEX IF NOT EXISTS idx_login_logs_user_time ON public.login_logs USING BTREE (user_id, login_time DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_user_result_time ON public.login_logs USING BTREE (user_id, login_result, login_time DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_username_result_time ON public.login_logs USING BTREE (username, login_result, login_time DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_login_logs_result_time ON public.login_logs USING BTREE (login_result, login_time DESC) TABLESPACE pg_default;

-- 时间范围查询优化
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at_desc ON public.login_logs USING BTREE (created_at DESC) TABLESPACE pg_default;

-- 添加表和列注释
COMMENT ON TABLE public.login_logs IS '用户登录日志表 - 记录用户登录活动，支持登录审计和安全分析';
COMMENT ON COLUMN public.login_logs.id IS '日志记录唯一标识（UUID主键）';
COMMENT ON COLUMN public.login_logs.user_id IS '用户ID，外键关联users表，登录成功时记录';
COMMENT ON COLUMN public.login_logs.username IS '登录时使用的用户名，用于记录登录尝试的身份标识';
COMMENT ON COLUMN public.login_logs.login_type IS '登录类型：password(密码), sms(短信), email(邮件), oauth(第三方登录), ldap(LDAP), api_key(API密钥)';
COMMENT ON COLUMN public.login_logs.login_result IS '登录结果：success(成功), failed(失败), locked(账户锁定), disabled(账户禁用)';
COMMENT ON COLUMN public.login_logs.fail_reason IS '失败原因：invalid_password(密码错误), user_not_found(用户不存在), account_locked(账户锁定), account_disabled(账户禁用)等';
COMMENT ON COLUMN public.login_logs.device_info IS '设备信息JSON，包含操作系统、浏览器、设备类型等客户端信息';
COMMENT ON COLUMN public.login_logs.user_agent IS '用户代理字符串，原始HTTP User-Agent头信息';
COMMENT ON COLUMN public.login_logs.ip_address IS '客户端IP地址，用于地理位置分析和安全审计';
COMMENT ON COLUMN public.login_logs.ip_location IS 'IP地理位置信息JSON，包含国家、省份、城市等信息';
COMMENT ON COLUMN public.login_logs.login_time IS '登录时间戳，记录实际的登录尝试时间';
COMMENT ON COLUMN public.login_logs.created_at IS '记录创建时间，与login_time保持一致用于数据完整性';
