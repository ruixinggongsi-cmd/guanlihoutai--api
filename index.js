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
import positionRoutes from './src/routes/positions.js';
import equipmentCategoryRoutes from './src/routes/equipment_categories.js';
import expenseCategoryRoutes from './src/routes/expense_categories.js';
import approvalFlowConfigRoutes from './src/routes/approvalFlowConfig.js';
import customerRoutes from './src/routes/customers.js';
import contactRecordRoutes from './src/routes/contactRecords.js';
import baseMaterialRoutes from './src/routes/baseMaterials.js';
import customerDataCompareRoutes from './src/routes/customerDataCompare.js';
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

// 导入超时检查函数
import { checkExpenseApprovalTimeout, APPROVAL_TIMEOUT_ENABLED } from './src/utils/approvalTimeoutChecker.js';

// 导入中间件
import { errorHandler } from './src/middleware/errorHandler.js';
import { notFound } from './src/middleware/notFound.js';
// 签名验证现在在路由级别通过 verifySignatureAndToken 中间件处理
// import { verifySignature } from './src/middleware/signature.js';

const app = express();

// 安全配置
app.use(helmet());

app.use(cors()); // 允许所有来源的请求

// 其他中间件
// 增加请求体大小限制，支持大批量数据对比（500MB，支持百万级数据）
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// 注意：签名验证现在在路由级别通过 verifySignatureAndToken 中间件处理
// 不再全局应用 verifySignature，避免重复验证
// app.use('/api/', verifySignature);

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
app.use('/api/positions', positionRoutes);
app.use('/api/equipment-categories', equipmentCategoryRoutes);
app.use('/api/expense-categories', expenseCategoryRoutes);
app.use('/api/approval-flow-config', approvalFlowConfigRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/contact-records', contactRecordRoutes);
app.use('/api/base-materials', baseMaterialRoutes);
app.use('/api/customer-data-compare', customerDataCompareRoutes);
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

// 启动定时检查超时审批任务（每1分钟检查一次，确保及时处理超时订单）
let timeoutCheckInterval = null;
const startTimeoutChecker = () => {
  // 延迟启动，确保数据库连接已建立
  setTimeout(() => {
    // 立即执行一次检查
    console.log('[超时检查] 🚀 启动超时检查任务，立即执行首次检查...');
    console.log('[超时检查] 📅 将检查所有历史订单中状态为 pending 或 approving 的订单');
    checkExpenseApprovalTimeout().then(result => {
      console.log(`[超时检查] ✅ 首次检查完成！`);
      console.log(`[超时检查] 📊 检查了 ${result.checked} 个订单`);
      console.log(`[超时检查] ⏰ 发现 ${result.timeout} 个超时订单已自动拒绝`);
      if (result.timeoutIds && result.timeoutIds.length > 0) {
        console.log(`[超时检查] 📋 超时订单ID列表:`, result.timeoutIds);
      }
    }).catch(err => {
      console.error('[超时检查] ❌ 首次检查失败:', err);
      console.error('[超时检查] 错误详情:', err.stack);
    });

    // 每1分钟检查一次，确保及时处理超时的订单
    timeoutCheckInterval = setInterval(() => {
      checkExpenseApprovalTimeout().then(result => {
        if (result.timeout > 0) {
          console.log(`[超时检查] ⏰ 定时检查完成，发现 ${result.timeout} 个超时订单已自动拒绝`);
        }
      }).catch(err => {
        console.error('[超时检查] ❌ 定时检查失败:', err);
      });
    }, 60 * 1000); // 1分钟 = 60000毫秒

    console.log('[超时检查] ✅ 超时检查任务已启动，每1分钟检查一次');
  }, 3000); // 延迟3秒启动，确保服务完全启动
};

// 启动超时检查任务（功能关闭时不启动）
if (APPROVAL_TIMEOUT_ENABLED) {
  startTimeoutChecker();
} else {
  console.log('[超时检查] ⏸️ 费用审批超时自动拒绝功能已关闭（APPROVAL_TIMEOUT_ENABLED=false）');
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
