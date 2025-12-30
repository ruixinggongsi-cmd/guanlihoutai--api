import jwt from 'jsonwebtoken';
import { getSupabaseClient } from '../config/supabase.js';

export async function authenticateToken(req, res, next) {
  try {
   
     // 跳过OPTIONS预检请求
    if (req.method === 'OPTIONS') {
      return next();
    }
    const authHeader = req.headers['authorization'];
   
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    // if (!token) {
    //   // 没有token也继续执行，只是不设置req.user
    //   return next();
    // }

    // 验证JWT令牌
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      
      if (err) {
        // token无效也继续执行，只是不设置req.user
        // 获取用户信息失败也继续执行
       
          return res.status(401).json({
            code: 500,
            message: 'token无效',
            data: null
          });
      }

      try {
   
          req.user = decoded;
        
      } catch (userError) {
        // 获取用户信息失败也继续执行
        
          return res.status(401).json({
            code: 500,
            message: '认证错误',
            data: null
          });
      }
      
      next();
    });
  } catch (error) {
  
     return res.status(401).json({
      code: 500,
      message: '用户登录认证失败',
      data: null
    });

    // 认证错误也继续执行，只是不设置req.user
   
  }
}

// 角色权限控制中间件 - 现在不再进行权限验证，只是继续执行
export function authorizeRole(allowedRoles) {
  return (req, res, next) => {
    // 不再检查权限，所有用户都可以访问
    next();
  };
}