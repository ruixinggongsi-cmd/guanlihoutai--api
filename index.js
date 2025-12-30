// 首先加载环境变量
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// 加载环境变量
config({ path: join(__dirname, '.env') });

// 验证必需的环境变量
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('缺少必需的环境变量:', missingEnvVars.join(', '));
  process.exit(1);
}

// 现在可以安全地导入其他模块
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import departmentRoutes from './src/routes/department.js';
import menuRoutes from './src/routes/menus.js';
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';
import roleGroupRoutes from './src/routes/roleGroup.js';
import equipmentCategoryRoutes from './src/routes/equipment_categories.js';
import expenseCategoryRoutes from './src/routes/expense_categories.js';
import approvalFlowConfigRoutes from './src/routes/approvalFlowConfig.js';
import customerRoutes from './src/routes/customers.js';
import contactRecordRoutes from './src/routes/contactRecords.js';
import expenseApplicationRoutes from './src/routes/expenseApplications.js';
import equipmentApplicationRoutes from './src/routes/equipmentApplications.js';
import statisticsRoutes from './src/routes/statistics.js';
import expenseStatisticsRoutes from './src/routes/expenseStatistics.js';
import equipmentStatisticsRoutes from './src/routes/equipmentStatistics.js';
import customerStatisticsRoutes from './src/routes/customerStatistics.js';
import fcmRoutes from './src/routes/fcm.js';
import taskRoutes from './src/routes/tasks.js';
import taskStatisticsRoutes from './src/routes/taskStatistics.js';
import logsRoutes from './src/routes/logs.js';
import uploadRoutes from './src/routes/uploadRoutes.js';

// 导入FCM配置
import { initializeFCM } from './src/config/fcm.js';

// 导入中间件
import { errorHandler } from './src/middleware/errorHandler.js';
import { notFound } from './src/middleware/notFound.js';
import { verifySignature } from './src/middleware/signature.js';

const app = express();

// 安全配置
app.use(helmet());

app.use(cors()); // 允许所有来源的请求

// 其他中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 签名验证中间件（在路由之前应用）
app.use('/api/', verifySignature);

// // 请求限制
// const limiter = rateLimit({
//   message: {
//     error: 'Too many requests from this IP, please try again later.',
//     code: 'RATE_LIMIT_EXCEEDED'
//   }
// });
// app.use('/api/', limiter);

// 压缩
app.use(compression());

app.use('/api/departments', departmentRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/role-groups', roleGroupRoutes);
app.use('/api/equipment-categories', equipmentCategoryRoutes);
app.use('/api/expense-categories', expenseCategoryRoutes);
app.use('/api/approval-flow-config', approvalFlowConfigRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/contact-records', contactRecordRoutes);
app.use('/api/expense-applications', expenseApplicationRoutes);
app.use('/api/equipment-applications', equipmentApplicationRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/expense-statistics', expenseStatisticsRoutes);
app.use('/api/equipment-statistics', equipmentStatisticsRoutes);
app.use('/api/customer-statistics', customerStatisticsRoutes);
app.use('/api/fcm', fcmRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/task-statistics', taskStatisticsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/upload', uploadRoutes);

/// 基础路由
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: '管理后台API服务运行中',
        timestamp: new Date().toISOString()
    });
});

// 404 错误处理
app.use(notFound);

// 错误处理中间件
app.use(errorHandler);
 
// 启动服务器
const PORT = process.env.PORT || 3001;

console.log('准备启动服务器，端口:', PORT);

// 初始化FCM服务（可选）
try {
    initializeFCM();
} catch (error) {
    console.warn('FCM服务初始化失败，推送功能将不可用:', error.message);
}

console.log('准备监听端口...');

app.listen(PORT, () => {
    console.log(`管理后台API服务器运行在 http://localhost:${PORT}`);
}).on('error', (error) => {
    console.error('服务器启动失败:', error.message);
    process.exit(1);
});

// 导出应用（用于测试）
export default app;
