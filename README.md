# 🚀 ManageAPI - 企业管理后台API服务

一个功能完善的企业级管理后台API服务，基于Node.js + Express + Supabase构建，提供完整的用户管理、权限控制、审批流程、数据统计等功能。

## ✨ 功能特性

### 🔐 认证与授权
- **JWT令牌认证** - 安全的用户身份验证
- **多角色权限管理** - 支持admin、editor、user等多种角色
- **菜单权限控制** - 基于角色的动态菜单访问控制
- **API签名验证** - MD5请求签名防篡改机制

### 📊 核心业务模块
- **用户管理** - 用户CRUD、角色分配、状态管理
- **部门管理** - 组织架构管理、层级关系
- **客户管理** - 客户信息、跟进记录、统计分析
- **设备管理** - 设备申请、审批流程、库存统计
- **费用管理** - 费用申请、多级审批、预算统计
- **任务中心** - 任务创建、分配、进度跟踪
- **审批流程** - 灵活的流程配置、节点审批

### 📱 移动端支持
- **Flutter移动应用** - 完整的设备申请审批移动端
- **推送通知** - FCM消息推送、实时提醒
- **离线支持** - 本地数据缓存、网络恢复同步

### 🔧 系统管理
- **操作日志** - 完整的用户操作审计
- **登录日志** - 用户登录行为记录
- **系统监控** - 实时性能监控、异常告警

## 🏗️ 技术架构

### 后端技术栈
- **运行时**: Node.js 16+ (ES Modules)
- **Web框架**: Express.js 4.18+
- **数据库**: Supabase (PostgreSQL 15+)
- **认证**: JWT + bcryptjs
- **安全**: Helmet + CORS + Rate Limiting
- **验证**: Joi + express-validator
- **文件上传**: Multer
- **推送通知**: Firebase Cloud Messaging

### 核心依赖
```json
{
  "@supabase/supabase-js": "^2.58.0",
  "express": "^4.18.2",
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3",
  "joi": "^17.11.0",
  "firebase-admin": "^13.5.0",
  "express-rate-limit": "^7.1.5",
  "helmet": "^7.1.0"
}
```

## 🚀 快速开始

### 📋 环境要求
- Node.js >= 16.0.0
- npm 或 pnpm
- Supabase账户和项目

### 🔧 安装配置

1. **克隆项目**
```bash
git clone <repository-url>
cd manageApi
```

2. **安装依赖**
```bash
npm install
# 或者使用 pnpm
pnpm install
```

3. **环境配置**
```bash
cp .env.example .env
```

编辑 `.env` 文件：
```env
# 服务器配置
PORT=3000
NODE_ENV=development

# Supabase配置
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# JWT配置
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h

# 安全配置
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# FCM推送配置
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key
```

4. **数据库初始化**
```bash
# 执行SQL脚本创建表结构
npm run init-db
```

5. **启动服务**
```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm start
```

## 📖 API文档概览

### 认证模块
```
POST /api/auth/register          # 用户注册
POST /api/auth/login             # 用户登录
GET  /api/auth/me                # 获取当前用户信息
POST /api/auth/refresh           # 刷新访问令牌
POST /api/auth/logout            # 用户登出
```

### 用户管理模块
```
GET    /api/users?page=1&pageSize=10     # 获取用户列表
GET    /api/users/:id                    # 获取用户详情
POST   /api/users                         # 创建用户
PUT    /api/users/:id                    # 更新用户信息
DELETE /api/users/:id                    # 删除用户
PUT    /api/users/:id/status             # 更新用户状态
```

### 客户管理模块
```
GET    /api/customers?page=1&pageSize=10&search=keyword  # 客户列表
GET    /api/customers/:id                                # 客户详情
POST   /api/customers                                    # 创建客户
PUT    /api/customers/:id                                # 更新客户
DELETE /api/customers/:id                                # 删除客户
GET    /api/customers/statistics                         # 客户统计
POST   /api/customers/:id/contact-records               # 添加跟进记录
```

### 设备管理模块
```
GET    /api/equipment-categories                          # 设备分类
GET    /api/equipment-applications?page=1&status=pending  # 设备申请列表
POST   /api/equipment-applications                          # 创建设备申请
GET    /api/equipment-applications/:id                     # 申请详情
PUT    /api/equipment-applications/:id                     # 更新申请
POST   /api/equipment-applications/:id/approve             # 审批申请
POST   /api/equipment-applications/:id/reject            # 拒绝申请
GET    /api/equipment-statistics                            # 设备统计
```

### 审批流程模块
```
GET    /api/approval/flows?page=1&pageSize=10     # 审批流程列表
POST   /api/approval/flows                       # 创建审批流程
GET    /api/approval/flows/:id                   # 流程详情
PUT    /api/approval/flows/:id                   # 更新流程
GET    /api/approval/pending?page=1              # 待审批列表
POST   /api/approval/process                     # 处理审批
GET    /api/approval/history?page=1              # 审批历史
```

### 系统日志模块
```
GET /api/logs/login?page=1&pageSize=10    # 登录日志
GET /api/logs/operation?page=1&pageSize=10 # 操作日志
GET /api/logs/export/:type                # 日志导出
```

## 🏗️ 项目结构

```
manageApi/
├── src/
│   ├── config/           # 配置文件
│   │   ├── supabase.js   # Supabase客户端配置
│   │   ├── fcm.js        # Firebase消息推送配置
│   │   └── firebase-messaging.js
│   ├── middleware/       # 中间件
│   │   ├── auth.js       # JWT认证中间件
│   │   ├── combinedAuth.js # 组合认证（JWT+签名）
│   │   ├── signature.js  # 请求签名验证
│   │   ├── validation.js # 请求参数验证
│   │   ├── errorHandler.js # 全局错误处理
│   │   └── notFound.js   # 404处理
│   ├── routes/           # 路由模块
│   │   ├── auth.js       # 认证路由
│   │   ├── users.js      # 用户管理
│   │   ├── customers.js  # 客户管理
│   │   ├── equipmentApplications.js # 设备申请
│   │   ├── approvalFlowConfig.js    # 审批流程
│   │   ├── logs.js       # 系统日志
│   │   └── ...
│   └── utils/             # 工具函数
│       ├── fcmService.js  # FCM消息服务
│       ├── operationLogger.js # 操作日志记录
│       └── validation.js    # 数据验证
├── sql/                  # 数据库脚本
├── index.js             # 应用入口
└── package.json
```

## 🔒 安全特性

### 认证安全
- **JWT令牌**: 使用HS256算法签名，支持过期时间控制
- **密码加密**: bcryptjs哈希，12轮盐值加密
- **令牌刷新**: 支持访问令牌和刷新令牌机制

### 请求安全
- **API签名**: MD5请求签名，防止参数篡改
- **速率限制**: 基于IP的请求频率限制
- **CORS配置**: 跨域请求安全控制
- **Helmet**: HTTP头部安全加固

### 数据安全
- **输入验证**: Joi模式验证所有输入参数
- **SQL注入防护**: Supabase参数化查询
- **敏感信息脱敏**: 日志中敏感信息自动脱敏

## 🧪 测试与部署

### 运行测试
```bash
# 单元测试
npm test

# 代码检查
npm run lint
```

### Docker部署
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

构建和运行：
```bash
docker build -t manageapi .
docker run -p 3000:3000 --env-file .env manageapi
```

## 🔧 开发指南

### 添加新模块
1. 在 `src/routes/` 创建路由文件
2. 在 `src/middleware/` 添加必要的中间件
3. 在 `sql/` 目录添加数据库迁移脚本
4. 更新API文档和测试用例

### 数据库设计原则
- 使用PostgreSQL原生功能（JSONB、数组类型）
- 合理使用索引优化查询性能
- 实施行级安全(RLS)策略
- 保持数据模型的一致性和完整性

### 错误处理规范
```javascript
// 统一的错误响应格式
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      {
        "field": "email",
        "message": "邮箱格式不正确"
      }
    ]
  }
}
```

## 📊 性能优化

### 数据库优化
- 合理使用索引
- 查询结果分页
- 避免N+1查询问题
- 使用数据库连接池

### API优化
- 响应数据压缩
- 合理的缓存策略
- 异步处理耗时操作
- 数据库查询优化

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源协议。

## 🆘 支持

如遇到问题，请：
1. 查看 [GitHub Issues](https://github.com/your-repo/issues)
2. 创建新的Issue描述问题
3. 联系开发团队

---

**默认管理员账户**: `admin / admin123`
⚠️ **重要**: 请在生产环境中立即修改默认密码！

**API基础地址**: `http://localhost:3000/api`
**API文档**: `http://localhost:3000/api-docs` (开发中)