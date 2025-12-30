// FCM测试接口调用示例
const axios = require('axios');
const crypto = require('crypto');

// API配置
const API_BASE_URL = 'http://localhost:8090';
const API_APPID = 'manage_web_app_2024';
const API_SECRET = 'manage_web_secret_key_2024_secure';

// 生成签名
function generateSignature(method, path, timestamp) {
  const signatureString = `${method}${path}${timestamp}${API_SECRET}`;
  return crypto.createHash('sha256').update(signatureString).digest('hex');
}

// 测试FCM状态接口
async function testFCMStatus() {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/test/fcm/status';
    const signature = generateSignature('GET', path, timestamp);

    const response = await axios.get(`${API_BASE_URL}${path}`, {
      headers: {
        'X-API-AppID': API_APPID,
        'X-API-Signature': signature,
        'X-API-Timestamp': timestamp
      }
    });

    // FCM状态接口测试成功
  } catch (error) {
    // FCM状态接口测试失败
  }
}

// 测试FCM广播接口（测试模式）
async function testFCMBroadcast() {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/test/fcm/broadcast';
    const signature = generateSignature('POST', path, timestamp);

    const response = await axios.post(`${API_BASE_URL}${path}`, {
      title: '测试通知',
      body: '这是一条测试推送消息',
      dryRun: true // 测试模式，不实际发送
    }, {
      headers: {
        'X-API-AppID': API_APPID,
        'X-API-Signature': signature,
        'X-API-Timestamp': timestamp,
        'Content-Type': 'application/json'
      }
    });

    // FCM广播接口测试成功
  } catch (error) {
    // FCM广播接口测试失败
  }
}

// 测试FCM统计接口
async function testFCMStatistics() {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/test/fcm-tokens/statistics';
    const signature = generateSignature('GET', path, timestamp);

    const response = await axios.get(`${API_BASE_URL}${path}`, {
      headers: {
        'X-API-AppID': API_APPID,
        'X-API-Signature': signature,
        'X-API-Timestamp': timestamp
      }
    });

    // FCM统计接口测试成功
  } catch (error) {
    // FCM统计接口测试失败
  }
}

// 运行所有测试
async function runAllTests() {
  // 开始测试FCM推送接口
  
  // 1. 测试FCM状态接口
  await testFCMStatus();
  
  // 2. 测试FCM广播接口（测试模式）
  await testFCMBroadcast();
  
  // 3. 测试FCM统计接口
  await testFCMStatistics();
  // 测试完成
}

// 如果直接运行此脚本，执行测试
if (require.main === module) {
  runAllTests().catch(() => {});
}

module.exports = {
  testFCMStatus,
  testFCMBroadcast,
  testFCMStatistics
};