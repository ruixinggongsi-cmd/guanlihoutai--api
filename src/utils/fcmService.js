import { getFCMAdmin, isFCMInitialized } from '../config/fcm.js';
import { select } from '../config/supabase.js';

/**
 * 发送FCM推送消息给单个用户
 * @param {string} fcmToken - FCM设备令牌
 * @param {Object} notification - 通知内容
 * @param {Object} data - 附加数据
 * @returns {Promise<Object>} 推送结果
 */
export const sendFCMNotification = async (fcmToken, notification = {}, data = {}) => {
  if (!isFCMInitialized()) {
    throw new Error('FCM服务未初始化');
  }

  if (!fcmToken) {
    throw new Error('FCM令牌不能为空');
  }

  try {
    const fcmadmin = getFCMAdmin();
    
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title || '系统通知',
        body: notification.body || '您有一条新消息',
        icon: notification.icon || '/favicon.ico',
        badge: notification.badge || '/favicon.ico',
        sound: notification.sound || 'default',
        ...notification
      },
      data: {
        timestamp: new Date().toISOString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        ...data
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default_channel',
          sound: 'default',
          vibrateTimingsMillis: [300, 100, 300],
          defaultVibrateTimings: true,
          defaultSound: true
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const response = await fcmadmin.messaging().send(message);
    
    return {
      success: true,
      messageId: response,
      token: fcmToken,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    
    // 如果是无效令牌，可能需要从数据库中删除
    if (error.code === 'messaging/registration-token-not-registered') {
      // FCM令牌已失效，建议删除
    }
    
    return {
      success: false,
      error: error.message,
      code: error.code,
      token: fcmToken,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * 获取所有有效的FCM令牌
 * @returns {Promise<Array>} FCM令牌列表
 */
export const getAllFCMTokens = async () => {
  try {
    const filters = [
      { type: 'eq', column: 'is_active', value: true }
    ];
    
    const tokens = await select('user_fcm_tokens', '*', filters);
    
    return tokens || [];
  } catch (error) {
    throw error;
  }
};

/**
 * 批量发送FCM推送消息
 * @param {Array<string>} fcmTokens - FCM设备令牌数组
 * @param {Object} notification - 通知内容
 * @param {Object} data - 附加数据
 * @returns {Promise<Object>} 批量推送结果
 */
export const sendBatchFCMNotifications = async (fcmTokens, notification = {}, data = {}) => {
  if (!isFCMInitialized()) {
    throw new Error('FCM服务未初始化');
  }

  if (!fcmTokens || fcmTokens.length === 0) {
    return {
      success: true,
      total: 0,
      successCount: 0,
      failureCount: 0,
      results: []
    };
  }

  try {
    const admin = getFCMAdmin();
    
    // 构建批量消息
    const messages = fcmTokens.map(token => ({
      token: token,
      notification: {
        title: notification.title || '系统通知',
        body: notification.body || '您有一条新消息',
        icon: notification.icon || '/favicon.ico',
        badge: notification.badge || '/favicon.ico',
        sound: notification.sound || 'default',
        ...notification
      },
      data: {
        timestamp: new Date().toISOString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        ...data
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default_channel',
          sound: 'default',
          vibrateTimingsMillis: [300, 100, 300],
          defaultVibrateTimings: true,
          defaultSound: true
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    }));

    // 批量发送
    const response = await admin.messaging().sendAll(messages);
    
    // 处理响应结果
    const results = response.responses.map((resp, index) => ({
      token: fcmTokens[index],
      success: resp.success,
      messageId: resp.success ? resp.messageId : null,
      error: resp.error ? resp.error.message : null,
      timestamp: new Date().toISOString()
    }));

    return {
      success: true,
      total: fcmTokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      results: results
    };
  } catch (error) {
    throw error;
  }
};

/**
 * 发送FCM推送消息给所有用户
 * @param {Object} notification - 通知内容
 * @param {Object} data - 附加数据
 * @returns {Promise<Object>} 推送结果
 */
export const sendFCMToAllUsers = async (notification = {}, data = {}) => {
  try {
    // 获取所有有效的FCM令牌
    const tokens = await getAllFCMTokens();
    
    if (tokens.length === 0) {
      return {
        success: true,
        total: 0,
        successCount: 0,
        failureCount: 0,
        results: []
      };
    }

    // 提取所有令牌
    const fcmTokens = tokens.map(token => token.token);
    
    // 批量发送消息
    return await sendBatchFCMNotifications(fcmTokens, notification, data);
  } catch (error) {
    throw error;
  }
};

/**
 * 发送FCM消息给特定用户
 * @param {number} userId - 用户ID
 * @param {Object} notification - 通知内容
 * @param {Object} data - 附加数据
 * @returns {Promise<Object>} 推送结果
 */
export const sendFCMToUser = async (userId, notification = {}, data = {}) => {
  try {
    const filters = [
      { type: 'eq', column: 'user_id', value: userId },
      { type: 'eq', column: 'is_active', value: true }
    ];
    
    const tokens = await select('user_fcm_tokens', '*', filters);
    
    if (tokens.length === 0) {
      return {
        success: false,
        error: '用户没有有效的FCM令牌',
        userId: userId
      };
    }
    
    // 发送给用户的所有设备
    const results = [];
    for (const token of tokens) {
      const result = await sendFCMNotification(token.fcm_token, notification, data);
      results.push(result);
    }

    return {
      success: true,
      userId: userId,
      total: results.length,
      results: results
    };
  } catch (error) {
    throw error;
  }
};

export default {
  sendFCMNotification,
  getAllFCMTokens,
  sendBatchFCMNotifications,
  sendFCMToAllUsers,
  sendFCMToUser
};