import { verifySignature } from './signature.js';
import { authenticateToken } from './auth.js';
/**
 * 组合中间件：先验证签名，再验证token
 * 这样确保在authenticateToken之前完成签名验证
 */
export function verifySignatureAndToken(req, res, next) {
  // 先执行签名验证
  verifySignature(req, res, () => {
    // 如果响应已发送（签名验证失败），直接返回
    if (res.headersSent) {
      return;
    }
    
    // 签名验证通过，继续执行token验证
    authenticateToken(req, res, () => {
      // 如果响应已发送（token验证失败），直接返回
      if (res.headersSent) {
        return;
      }
      
      // 两个验证都通过，继续处理请求
      next();
    });
  });
}