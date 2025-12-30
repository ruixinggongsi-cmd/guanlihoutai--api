export const errorHandler = (err, req, res, next) => {
  // Supabase错误处理
  if (err.code && err.code.startsWith('PGRST')) {
    return res.status(400).json({
      success: false,
      message: '数据库操作失败',
      error: err.message
    });
  }
  
  // JWT错误处理
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: '无效的认证令牌',
      error: err.message
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: '认证令牌已过期',
      error: err.message
    });
  }
  
  // 验证错误处理
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: '参数验证失败',
      error: err.message
    });
  }
  
  // 业务逻辑错误
  if (err.name === 'BusinessError') {
    return res.status(400).json({
      success: false,
      message: err.message || '业务处理失败',
      error: err.details || null
    });
  }
  
  // 默认错误处理
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
};