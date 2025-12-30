import crypto from 'crypto-js';

// API配置 - 运行时获取环境变量
function getApiConfig() {
  return {
    appid: process.env.API_APPID || 'default_appid',
    secret: process.env.API_SECRET || 'default_secret'
  };
}

/**
 * 生成签名（与前端保持一致）
 */
function generateSignature(data, randomStr, timestamp, appid, secret) {
  try {
    // 将数据对象按键排序后转为JSON字符串
    const sortedData = JSON.stringify(data, Object.keys(data).sort());
    // 拼接签名字符串：appid + secret + 数据 + 随机字符串 + 时间戳
    const signStr = `${appid}${secret}${sortedData}${randomStr}${timestamp}`;
    // 使用MD5生成签名
    
   
    return crypto.MD5(signStr).toString();
  } catch (error) {
    return null;
  }
}

/**
 * 签名验证中间件
 */
export function verifySignature(req, res, next) {
  try {
    
    // 跳过OPTIONS预检请求
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    // 跳过分片上传的特殊接口（这些接口使用不同的认证方式）
    if (req.path.includes('/upload/chunk') || req.path.includes('/upload/merge')) {
      return next();
    }

    // 获取请求头中的签名信息
    const appid = req.headers['x-app-id'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    const randomStr = req.headers['x-random-str'];
   
    // 如果没有签名信息，直接通过（兼容旧接口）
    if (!signature) {
      return next();
    }

    // 验证必要参数
    if (!appid || !timestamp || !randomStr) {
      return res.status(400).json({
        code: 400,
        message: '缺少必要的签名参数',
        data: null
      });
    }

    // 获取API配置
    const apiConfig = getApiConfig();
    
    // 验证appid
    if (appid !== apiConfig.appid) {
      return res.status(401).json({
        code: 401,
        message: '无效的AppID',
        data: null
      });
    }

    // 验证时间戳（防止重放攻击，允许5分钟的时间差）
    const currentTimestamp = Date.now();
    const timeDiff = Math.abs(currentTimestamp - parseInt(timestamp));
    const maxTimeDiff = 5 * 60 * 1000; // 5分钟

    if (timeDiff > maxTimeDiff) {
      return res.status(401).json({
        code: 401,
        message: '请求已过期',
        data: null
      });
    }
   
    // 获取请求数据
    let requestData ={};
    // if (req.method === 'GET' || req.method === 'DELETE') {
    //   // GET和DELETE请求使用查询参数
    //   requestData = req.query;
    // } else {
    //   // POST、PUT等请求使用请求体
    //   requestData = req.body;
    // }

    // 生成服务端签名进行比对
    const serverSignature = generateSignature(requestData, randomStr, timestamp, appid, apiConfig.secret);
    
    if (!serverSignature) {
      return res.status(500).json({
        code: 500,
        message: '签名生成失败',
        data: null
      });
    }
   
    // 验证签名
    if (signature !== serverSignature) {
    

      return res.status(401).json({
        code: 401,
        message: '签名验证失败111',
        data: null
      });
    }

    // 签名验证通过，继续处理请求
     next();
  } catch (error) {
    
    return res.status(401).json({
      code: 401,
      message: '签名验证过程出错',
      data: null
    });
  }
}

/**
 * 可选的签名验证中间件（失败时只警告，不阻止请求）
 */
export function verifySignatureOptional(req, res, next) {
  try {
    // 获取请求头中的签名信息
    const appid = req.headers['x-app-id'];
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    const randomStr = req.headers['x-random-str'];

    // 如果没有签名信息，直接通过
    if (!signature) {
      return next();
    }

    // 验证必要参数
    if (!appid || !timestamp || !randomStr) {
      return next();
    }

    // 获取API配置
    const apiConfig = getApiConfig();
    
    // 验证appid
    if (appid !== apiConfig.appid) {
      return next();
    }

    // 获取请求数据
    let requestData = {};
    if (req.method === 'GET' || req.method === 'DELETE') {
      requestData =  {};
    } else {
      requestData =  {};
    }

    // 生成服务端签名进行比对
    const serverSignature = generateSignature(requestData, randomStr, timestamp, appid, apiConfig.secret);

    if (!serverSignature) {
      return next();
    }

    // 验证签名
    if (signature !== serverSignature) {
      // 签名不匹配
    } else {
      // 签名验证成功
    }

    next();
  } catch (error) {
    next();
  }
}