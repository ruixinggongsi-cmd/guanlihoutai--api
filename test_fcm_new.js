// FCM消息推送测试脚本

import { sendFCMNotification, sendFCMToAllUsers, sendFCMToUser } from './src/utils/fcmService.js';

// 测试FCM消息推送
async function testFCM() {
  console.log('开始测试FCM消息推送...');

  try {
    // 测试1: 发送给单个用户（需要提供有效的FCM令牌）
    console.log('\n=== 测试1: 发送给单个用户 ===');
    const testToken = 'YOUR_FCM_TOKEN_HERE'; // 替换为实际的FCM令牌
    
    if (testToken !== 'YOUR_FCM_TOKEN_HERE') {
      const singleResult = await sendFCMNotification(testToken, {
        title: '测试通知',
        body: '这是一条测试消息'
      }, {
        type: 'test',
        timestamp: new Date().toISOString()
      });
      
      console.log('单个消息发送结果:', singleResult);
    } else {
      console.log('跳过单个消息测试（未提供有效令牌）');
    }

    // 测试2: 发送给所有用户
    console.log('\n=== 测试2: 发送给所有用户 ===');
    const allUsersResult = await sendFCMToAllUsers({
      title: '系统广播',
      body: '这是一条系统广播消息'
    }, {
      type: 'broadcast',
      priority: 'high'
    });
    
    console.log('广播消息发送结果:', allUsersResult);

    // 测试3: 发送给特定用户（需要提供有效的用户ID）
    console.log('\n=== 测试3: 发送给特定用户 ===');
    const testUserId = 1; // 替换为实际的用户ID
    
    if (testUserId) {
      const userResult = await sendFCMToUser(testUserId, {
        title: '个人通知',
        body: '这是您的专属通知'
      }, {
        type: 'personal',
        userId: testUserId
      });
      
      console.log('个人消息发送结果:', userResult);
    } else {
      console.log('跳过个人消息测试（未提供有效用户ID）');
    }

    console.log('\n=== FCM测试完成 ===');

  } catch (error) {
    console.error('FCM测试失败:', error);
  }
}

// 如果直接运行此脚本，则执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testFCM().then(() => {
    console.log('测试脚本执行完毕');
    process.exit(0);
  }).catch(error => {
    console.error('测试脚本执行失败:', error);
    process.exit(1);
  });
}

export { testFCM };