import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import dotenv from 'dotenv';

// 加载环境变量（本地开发使用）
// 生产环境中，环境变量由部署平台提供（如Render的Environment配置）
dotenv.config();

// Firebase应用实例
let firebaseApp = null;
let messaging = null;

// 从环境变量获取Firebase服务账号配置
const getFirebaseConfig = () => {
  try {
    // 从环境变量获取完整的JSON字符串
    const configStr = process.env.FIREBASE_SERVICE_ACCOUNT;
  
    if (!configStr) {
      throw new Error('未配置FIREBASE_SERVICE_ACCOUNT环境变量');
    }
    
    // 解析JSON字符串
    const config = JSON.parse(configStr);
    
    // 验证必要的配置字段
    const requiredFields = [
      'type', 
      'project_id', 
      'private_key', 
      'client_email', 
      'token_uri'
    ];
    
    const missingFields = requiredFields.filter(field => !config[field]);
    if (missingFields.length > 0) {
      throw new Error(`Firebase配置缺少必要字段: ${missingFields.join(', ')}`);
    }
    
    // 确保私钥格式正确（包含BEGIN和END标识）
    if (!config.private_key.includes('-----BEGIN PRIVATE KEY-----') || 
        !config.private_key.includes('-----END PRIVATE KEY-----')) {
      throw new Error('Firebase私钥格式不正确');
    }
    
    return config;
  } catch (error) {
    console.warn('解析Firebase配置失败:', error.message);
    return null;
  }
};

// 初始化Firebase应用（延迟初始化）
const initializeFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }
  
  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) {
    return null;
  }
  
  try {
    firebaseApp = initializeApp({
      credential: cert(firebaseConfig)
    });
    messaging = getMessaging();
    console.log('Firebase应用初始化成功');
    return firebaseApp;
  } catch (error) {
    console.warn('Firebase初始化失败:', error.message);
    return null;
  }
};

// 获取消息推送实例
const getMessagingInstance = () => {
  if (!messaging) {
    initializeFirebase();
  }
  return messaging;
};

/**
 * 发送推送通知到单个设备
 * @param {string} token - 设备的FCM令牌
 * @param {Object} notification - 通知内容
 * @param {string} notification.title - 通知标题
 * @param {string} notification.body - 通知内容
 * @param {Object} [data] - 附加数据负载
 * @returns {Promise<Object>} 推送结果
 */
export async function sendPushNotification(token, notification, data = {}) {
  if (!token) {
    return { success: false, error: '设备令牌不能为空' };
  }
  
  if (!notification || !notification.title || !notification.body) {
    return { success: false, error: '通知标题和内容不能为空' };
  }
  
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    return { success: false, error: 'Firebase未初始化，推送功能不可用' };
  }
  
  const message = {
    token,
    notification,
    data,
    // Android配置
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK' // 适配Flutter应用
      }
    },
    // iOS配置
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      },
      headers: {
        'apns-priority': '10'
      }
    }
  };
  
  try {
    const response = await messagingInstance.send(message);
    return {
      success: true,
      messageId: response,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('推送通知失败:', error.message);
    return {
      success: false,
      error: error.message,
      code: error.errorInfo?.code || 'unknown',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 批量发送推送通知到多个设备
 * @param {string[]} tokens - 设备FCM令牌数组
 * @param {Object} notification - 通知内容
 * @param {Object} [data] - 附加数据负载
 * @returns {Promise<Object>} 推送结果
 */
export async function sendBulkPushNotifications(tokens, notification, data = {}) {
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return { success: false, error: '设备令牌数组不能为空' };
  }
  
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    return { success: false, error: 'Firebase未初始化，推送功能不可用' };
  }
  
  const message = {
    tokens,
    notification,
    data
  };
  
  try {
    const response = await messagingInstance.sendEachForMulticast(message);
    
    return {
      success: true,
      total: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      failures: response.responses
        .map((resp, index) => ({
          token: tokens[index],
          success: resp.success,
          error: resp.error?.message,
          errorCode: resp.error?.errorInfo?.code
        }))
        .filter(item => !item.success),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('批量推送失败:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// 测试推送功能（直接运行该文件时执行）
if (import.meta.url === `file://${process.argv[1]}`) {
  // 替换为实际的测试设备令牌
  const testToken = process.env.TEST_FCM_TOKEN || 'YOUR_TEST_DEVICE_TOKEN';
  
  // 测试单设备推送
  sendPushNotification(
    testToken,
    {
      title: '测试通知',
      body: '这是一条通过环境变量配置的Firebase测试推送'
    },
    { type: 'test', id: '123' }
  ).then(result => {
    console.log('测试推送结果:', result);
  });
}
    