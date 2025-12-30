import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let fcmAdmin = null;
let isInitialized = false;

/**
 * 初始化FCM Admin SDK
 * @returns {boolean} 初始化是否成功
 */
export const initializeFCM = () => {
  if (isInitialized) {
    return true;
  }

  try {
    // 服务账号文件路径
      const serviceAccountPath = path.join(__dirname, './commanage-172c6-firebase-adminsdk-fbsvc-ed883da860.json');
    //const serviceAccountPath = join(__dirname, 'commanage-172c6-firebase-adminsdk-fbsvc-c66be0e6f4.json');
        // const serviceAccount = require(path.resolve(__dirname, './commanage-172c6-firebase-adminsdk-fbsvc-864aa6319f.json'));
    
        // 读取服务账号配置
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
   
    // 初始化FCM Admin SDK
    fcmAdmin = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
   
    isInitialized = true;
    return true;
  } catch (error) {
    console.warn('解析Firebase配置失败:', error.message);
    return false;
  }
};

/**
 * 获取FCM Admin实例
 * @returns {admin.app.App} FCM Admin实例
 */
export const getFCMAdmin = () => {
  if (!isInitialized) {
    throw new Error('FCM服务未初始化，请先调用initializeFCM()');
  }
  return fcmAdmin;
};

/**
 * 检查FCM是否已初始化
 * @returns {boolean} 是否已初始化
 */
export const isFCMInitialized = () => {
  return isInitialized;
};

/**
 * 发送FCM消息
 * @param {Object} message - FCM消息对象
 * @returns {Promise<string>} 消息ID
 */
export const sendMessage = async (message) => {
  if (!isInitialized) {
    throw new Error('FCM服务未初始化');
  }

  try {
    const response = await admin.messaging().send(message);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * 批量发送FCM消息
 * @param {Array} messages - FCM消息数组
 * @returns {Promise<Object>} 批量发送结果
 */
export const sendMulticastMessage = async (messages) => {
  if (!isInitialized) {
    throw new Error('FCM服务未初始化');
  }

  try {
    const response = await admin.messaging().sendAll(messages);
    return response;
  } catch (error) {
    throw error;
  }
};

// 自动初始化（静默失败）
try {
  initializeFCM();
} catch (error) {
  // 静默处理初始化错误
}

export default {
  initializeFCM,
  getFCMAdmin,
  isFCMInitialized,
  sendMessage,
  sendMulticastMessage
};