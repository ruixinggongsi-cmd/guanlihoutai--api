import { verifySignature } from './signature.js';
import { authenticateToken } from './auth.js';
/**
 * 组合中间件：先验证签名，再验证token
 * 这样确保在authenticateToken之前完成签名验证
 */
export function verifySignatureAndToken(req, res, next) {
  
  // 先执行签名验证
  verifySignature(req, res, (signatureError) => {
    if (signatureError) {
      // 如果签名验证失败，直接返回错误
      return;
    }
    
    // 签名验证通过，继续执行token验证
    authenticateToken(req, res, (tokenError) => {
      if (tokenError) {
        // 如果token验证失败，直接返回错误
        return;
      }
      
      // 两个验证都通过，继续处理请求
      next();
    });
  });
  // 注意：这里不能调用next()，因为验证是异步的
  // next()只能在验证通过后调用
}