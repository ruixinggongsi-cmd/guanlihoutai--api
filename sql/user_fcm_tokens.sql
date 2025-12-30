-- 创建用户FCM令牌表
CREATE TABLE user_fcm_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- 自动生成UUID作为主键
    user_id UUID NOT NULL, -- 关联用户ID，使用UUID类型
    fcm_token VARCHAR(255) NOT NULL, -- FCM令牌
    device_info JSONB, -- 推荐使用JSONB（支持索引和高效查询），替代JSON
    is_active BOOLEAN DEFAULT true, -- 是否有效
    created_at timestamp with time zone null, -- 带时区的时间戳
    updated_at timestamp with time zone null, -- 带时区的时间戳
    CONSTRAINT uk_fcm_token UNIQUE (fcm_token) -- 唯一约束，避免重复存储
);

-- 创建用户FCM令牌表索引
CREATE INDEX idx_user_fcm_tokens_user_id ON user_fcm_tokens (user_id);
CREATE INDEX idx_user_fcm_tokens_fcm_token ON user_fcm_tokens (fcm_token);