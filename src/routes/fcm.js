import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { 
  sendFCMNotification, 
  sendBatchFCMNotifications, 
  sendFCMToAllUsers, 
  sendFCMToUser 
} from '../utils/fcmService.js';

const router = Router();

/**
 * @route   POST /api/fcm/send
 * @desc    发送FCM消息给单个用户
 * @access  Private
 */
router.post('/send', [
  body('token').notEmpty().withMessage('FCM令牌不能为空'),
  body('title').optional().isString().withMessage('标题必须是字符串'),
  body('body').optional().isString().withMessage('内容必须是字符串'),
  body('data').optional().isObject().withMessage('数据必须是对象')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { token, title, body, data } = req.body;
    
    const notification = {
      title: title || '系统通知',
      body: body || '您有一条新消息'
    };

    const result = await sendFCMNotification(token, notification, data || {});
    
    if (result.success) {
      res.json({
        success: true,
        message: 'FCM消息发送成功',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'FCM消息发送失败',
        error: result.error
      });
    }
  } catch (error) {
    console.error('发送FCM消息失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/fcm/send-batch
 * @desc    批量发送FCM消息
 * @access  Private
 */
router.post('/send-batch', [
  body('tokens').isArray({ min: 1 }).withMessage('令牌数组不能为空'),
  body('tokens.*').isString().withMessage('每个令牌必须是字符串'),
  body('title').optional().isString().withMessage('标题必须是字符串'),
  body('body').optional().isString().withMessage('内容必须是字符串'),
  body('data').optional().isObject().withMessage('数据必须是对象')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { tokens, title, body, data } = req.body;
    
    const notification = {
      title: title || '系统通知',
      body: body || '您有一条新消息'
    };

    const result = await sendBatchFCMNotifications(tokens, notification, data || {});
    
    res.json({
      success: true,
      message: '批量FCM消息发送完成',
      data: result
    });
  } catch (error) {
    console.error('批量发送FCM消息失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/fcm/send-to-all
 * @desc    发送FCM消息给所有用户
 * @access  Private
 */
router.post('/send-to-all', [
  body('title').optional().isString().withMessage('标题必须是字符串'),
  body('body').optional().isString().withMessage('内容必须是字符串'),
  body('data').optional().isObject().withMessage('数据必须是对象')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { title, body, data } = req.body;
    
    const notification = {
      title: title || '系统通知',
      body: body || '您有一条新消息'
    };

    const result = await sendFCMToAllUsers(notification, data || {});
    
    res.json({
      success: true,
      message: '全用户FCM消息发送完成',
      data: result
    });
  } catch (error) {
    console.error('发送给所有用户失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/fcm/send-to-user/:userId
 * @desc    发送FCM消息给特定用户
 * @access  Private
 */
router.post('/send-to-user/:userId', [
  param('userId').isInt({ min: 1 }).withMessage('用户ID必须是正整数'),
  body('title').optional().isString().withMessage('标题必须是字符串'),
  body('body').optional().isString().withMessage('内容必须是字符串'),
  body('data').optional().isObject().withMessage('数据必须是对象')
], async (req, res) => {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const userId = parseInt(req.params.userId);
    const { title, body, data } = req.body;
    
    const notification = {
      title: title || '系统通知',
      body: body || '您有一条新消息'
    };

    const result = await sendFCMToUser(userId, notification, data || {});
    
    res.json({
      success: true,
      message: '用户FCM消息发送完成',
      data: result
    });
  } catch (error) {
    console.error(`发送给用户 ${req.params.userId} 失败:`, error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/fcm/test
 * @desc    测试FCM服务
 * @access  Private
 */
router.get('/test', async (req, res) => {
  try {
    const { isFCMInitialized } = await import('../config/fcm.js');
     const userId = 'a169dd64-6465-4efc-9655-167cd1bc4cc8';
    
    
    const notification = {
      title:  '系统通知',
      body:  '您有一条新消息'
    };
    const data={};
    const result =  sendFCMToUser(userId, notification, data || {});
    
    res.json({
      success: true,
      message: '用户FCM消息发送完成',
      data: result
    });
    // if (isFCMInitialized()) {
    //   res.json({
    //     success: true,
    //     message: 'FCM服务已初始化并正常运行'
    //   });
    // } else {
    //   res.status(503).json({
    //     success: false,
    //     message: 'FCM服务未初始化'
    //   });
    // }
  } catch (error) {
    console.error('测试FCM服务失败:', error);
    res.status(500).json({
      success: false,
      message: '测试失败',
      error: error.message
    });
  }
});

export default router;