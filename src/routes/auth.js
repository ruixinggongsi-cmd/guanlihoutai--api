import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getSupabaseClient, select, update, insert } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { sendPushNotification } from '../config/firebase-messaging.js';
const router = express.Router();

// 辅助函数：记录登录日志
async function recordLoginLog(logData) {
  try {
    await insert('login_logs', logData);
  } catch (error) {
    console.error('记录登录日志失败:', error);
  }
}

// 辅助函数：获取客户端IP地址
function getClientIP(req) {
  try {
    // 优先顺序获取IP地址
    let ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] || 
             req.headers['x-client-ip'] ||
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             req.ip ||
             'unknown';
    
    // 如果x-forwarded-for包含多个IP，取第一个（真实客户端IP）
    if (ip && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    
    // 清理IPv6格式的IPv4地址（如 ::ffff:192.168.1.1）
    if (ip && ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    // 验证IP地址格式
    if (ip && ip !== 'unknown') {
      // 检查是否为有效的IPv4地址
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      // 检查是否为有效的IPv6地址
      const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
      
      if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
        // 如果不是标准IP格式，返回unknown
        return 'unknown';
      }
    }
    
    return ip || 'unknown';
  } catch (error) {
    console.error('获取客户端IP失败:', error);
    return 'unknown';
  }
}

// 辅助函数：解析设备信息
function parseDeviceInfo(userAgent, deviceInfo = {}) {
  const defaultDeviceInfo = {
    os: 'unknown',
    browser: 'unknown',
    device_type: 'unknown',
    platform: 'unknown'
  };

  if (userAgent) {
    // 简单的用户代理解析
    if (userAgent.includes('Windows')) defaultDeviceInfo.os = 'Windows';
    else if (userAgent.includes('Mac')) defaultDeviceInfo.os = 'macOS';
    else if (userAgent.includes('Linux')) defaultDeviceInfo.os = 'Linux';
    else if (userAgent.includes('Android')) defaultDeviceInfo.os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) defaultDeviceInfo.os = 'iOS';
    
    if (userAgent.includes('Chrome')) defaultDeviceInfo.browser = 'Chrome';
    else if (userAgent.includes('Firefox')) defaultDeviceInfo.browser = 'Firefox';
    else if (userAgent.includes('Safari')) defaultDeviceInfo.browser = 'Safari';
    else if (userAgent.includes('Edge')) defaultDeviceInfo.browser = 'Edge';

    if (userAgent.includes('Mobile')) defaultDeviceInfo.device_type = 'Mobile';
    else if (userAgent.includes('Tablet')) defaultDeviceInfo.device_type = 'Tablet';
    else defaultDeviceInfo.device_type = 'Desktop';
  }

  return { ...defaultDeviceInfo, ...deviceInfo };
}

// 用户注册（新表结构）
router.post('/register', async (req, res, next) => {
  try {
    const { error: validationError, value } = registerValidation.validate(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        error: validationError.details[0].message
      });
    }

    const { username, name, email, phone, password, department, roles, remarks } = value;

    // 检查用户名是否已存在
    const orFilters = [
      { type: 'eq', column: 'username', value: username },
      { type: 'eq', column: 'email', value: email }
    ];
    
    try {
      const existingUser = await select('users', 'id', [], 1, 0, null, orFilters);
      
      if (existingUser && existingUser.length > 0) {
        return res.status(409).json({
          success: false,
          message: '用户名或邮箱已存在'
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '检查用户失败',
        error: error.message
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 12);

    // 创建用户
    const { data, error } = await supabase
      .from('users')
      .insert([{
        username,
        name,
        email,
        phone: phone || null,
        loginpass: hashedPassword,
        department: department || null,
        roles: roles || null,
        status: true,
        remarks: remarks || '',
        create_at: new Date().toISOString()
      }])
      .select('id, username, name, email, phone, department, roles, status, create_at')
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: '用户注册失败',
        error: error.message
      });
    }

    res.status(201).json({
      success: true,
      data,
      message: '用户注册成功'
    });
  } catch (error) {
    next(error);
  }
});

// 用户登录（新表结构）
router.post('/login', async (req, res, next) => {
  try {
    const { username, password, fcm_token, device_info } = req.body;
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const parsedDeviceInfo = parseDeviceInfo(userAgent, device_info);
    
    // 查找用户
    const orFilters = [
      { type: 'eq', column: 'username', value: username },
      { type: 'eq', column: 'email', value: username }
    ];
    
    try {
      const userData = await select('users', '*', [], 1, 0, null, orFilters);
      
      if (!userData || userData.length === 0) {
        // 记录登录失败日志 - 用户不存在
        await recordLoginLog({
          username: username,
          login_type: 'password',
          login_result: 'failed',
          fail_reason: 'user_not_found',
          device_info: parsedDeviceInfo,
          user_agent: userAgent,
          ip_address: clientIP,
          login_time: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
        
        return res.status(401).json({
          success: false,
          message: '用户名或密码错误'
        });
      }
      
      const user = userData[0];

      // 检查用户状态
      if (user.status === false) {
        // 记录登录失败日志 - 账户禁用
        await recordLoginLog({
          user_id: user.id,
          username: user.username,
          login_type: 'password',
          login_result: 'disabled',
          fail_reason: 'account_disabled',
          device_info: parsedDeviceInfo,
          user_agent: userAgent,
          ip_address: clientIP,
          login_time: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
        
        return res.status(403).json({
          success: false,
          message: '账户已被禁用'
        });
      }
      
      // 验证密码
      const isPasswordValid = await bcrypt.compare(password, user.loginpass);
      if (!isPasswordValid) {
        // 记录登录失败日志 - 密码错误
        await recordLoginLog({
          user_id: user.id,
          username: user.username,
          login_type: 'password',
          login_result: 'failed',
          fail_reason: 'invalid_password',
          device_info: parsedDeviceInfo,
          user_agent: userAgent,
          ip_address: clientIP,
          login_time: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
        
        return res.status(401).json({
          success: false,
          message: '用户名或密码错误'
        });
      }
      
      // 登录成功，准备用户信息
      let userinfo = {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        department: user.department,
        roles: user.roles,
        status: user.status,
        remarks: user.remarks,
        create_at: user.create_at,
        data_permission: user.data_permission
      };

      // 如果用户有角色ID，获取角色信息
      let roleInfo = null;
      if (user.roles) {
        try {
          const roleFilters = [{ type: 'eq', column: 'role_id', value: user.roles }];
          const roleData = await select('role_group', 'role_id, role_code, role_name, data_permission', roleFilters, 1, 0);
          if (roleData && roleData.length > 0) {
            roleInfo = roleData[0];
          }
        } catch (roleError) {
          // 不中断登录流程，继续执行
        }
      }

      // 将角色信息添加到用户信息中
      if (roleInfo) {
        userinfo.roleInfo = roleInfo;
      }

      // 处理FCM token - 不存在则新增，存在则修改
      if (fcm_token) {
        try {
          // 首先检查是否已存在该token的记录
          const tokenFilters = [{ type: 'eq', column: 'user_id', value: user.id }];
          const existingToken = await select('user_fcm_tokens', '*', tokenFilters, 1, 0);
          
          if (existingToken && existingToken.length > 0) {
            // token已存在，更新记录
            const updateData = {
              user_id: user.id,
              fcm_token: fcm_token,
              device_info: device_info || existingToken[0].device_info,
              is_active: true,
              updated_at: new Date().toISOString()
            };
            
            await update('user_fcm_tokens', updateData, [
              { column: 'fcm_token', value: fcm_token }
            ]);
          } else {
            // token不存在，新增记录
            const insertData = {
              user_id: user.id,
              fcm_token: fcm_token,
              device_info: device_info || {},
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            
            await insert('user_fcm_tokens', insertData);
          }
        } catch (fcmError) {
          // 不中断登录流程，继续执行
        }
      }

      // 生成JWT令牌
      const token = jwt.sign(
        userinfo,
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );
      
      // 发送推送通知
      sendPushNotification(fcm_token, {
        title: '登录成功',
        body: '您已成功登录系统'
      });
      
      // 记录登录成功日志
      await recordLoginLog({
        user_id: user.id,
        username: user.username,
        login_type: 'password',
        login_result: 'success',
        device_info: parsedDeviceInfo,
        user_agent: userAgent,
        ip_address: clientIP,
        login_time: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      
      res.json({
        success: true,
        data: {
          token,
          user: userinfo
        },
        message: '登录成功'
      });
      
    } catch (error) {
      // 记录系统错误日志
      await recordLoginLog({
        username: username,
        login_type: 'password',
        login_result: 'failed',
        fail_reason: 'system_error',
        device_info: parsedDeviceInfo,
        user_agent: userAgent,
        ip_address: clientIP,
        login_time: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
      
      return res.status(500).json({
        success: false,
        message: '登录失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 获取当前用户信息（新表结构）
router.get('/me', verifySignatureAndToken, async (req, res, next) => {
  try {
    // 从token或查询参数获取用户ID
    const userId = req.user?.userId || req.query.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '需要用户ID'
      });
    }

    // 构建过滤条件
    const filters = [{ type: 'eq', column: 'id', value: userId }];
    
    try {
      const userData = await select('users', 'id, username, name, email, phone, department, roles, status, remarks, create_at', filters, 1, 0);
      
      if (!userData || userData.length === 0) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      const user = userData[0];

      res.json({
        success: true,
        data: user,
        message: '获取用户信息成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '获取用户信息失败',
        error: error.message
      });
    }
  } catch (error) {
    next(error);
  }
});

// 根据用户角色获取菜单（需要接口验证）
router.get('/menus/by-role', verifySignatureAndToken, async (req, res, next) => {
  try {
 
    // 获取角色权限信息
    const roleFilters = [{ type: 'eq', column: 'role_id', value: req.user.roleInfo.role_id }];
    const roleData = await select('role_group', 'role_id, role_name, permission', roleFilters, 1, 0);
    
    if (!roleData || roleData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    const role = roleData[0];
    
    // 如果角色没有权限配置，返回空菜单
    if (!role.permission || !role.permission.modules || !Array.isArray(role.permission.modules)) {
      return res.json({
        success: true,
        data: [],
        message: '角色没有菜单权限'
      });
    }

    // 获取角色有权限的菜单ID列表（JSON中存储的是字符串，需要转换为字符串数组）
    const allowedMenuIds = role.permission.modules || [];
    
    // 将菜单ID统一转换为字符串，确保类型匹配
    const allowedMenuIdStrings = allowedMenuIds.map(id => String(id));
    
    console.log('=== 菜单权限调试 ===');
    console.log('角色ID:', req.user.roleInfo.role_id);
    console.log('允许的菜单ID数量:', allowedMenuIdStrings.length);
    console.log('数据库对比菜单ID是否在权限中:', allowedMenuIdStrings.includes('550e8400-e29b-41d4-a716-446655440019'));
    
    if (allowedMenuIdStrings.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: '角色没有可用的菜单'
      });
    }

    // 获取所有启用的菜单
    const menuFilters = [
      { type: 'eq', column: 'status', value: 'active' }
    ];
    const allMenus = await select('menus', 'id, name, path, icon, parent_id, sort_order, type', menuFilters, 1000, 0, { column: 'sort_order', ascending: true });
    
    console.log('所有启用的菜单数量:', allMenus?.length || 0);
    const databaseCompareMenu = allMenus?.find(m => String(m.id) === '550e8400-e29b-41d4-a716-446655440019');
    console.log('数据库对比菜单:', databaseCompareMenu ? {
      id: databaseCompareMenu.id,
      name: databaseCompareMenu.name,
      parent_id: databaseCompareMenu.parent_id,
      type: databaseCompareMenu.type
    } : '未找到');
    
    if (!allMenus || allMenus.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: '系统中没有可用的菜单'
      });
    }

    // 过滤出角色有权限的菜单（将menu.id转换为字符串进行比较）
    const allowedMenus = allMenus.filter(menu => allowedMenuIdStrings.includes(String(menu.id)));
    
    console.log('过滤后的菜单数量:', allowedMenus.length);
    const databaseCompareInAllowed = allowedMenus.find(m => String(m.id) === '550e8400-e29b-41d4-a716-446655440019');
    console.log('数据库对比菜单是否在允许的菜单中:', databaseCompareInAllowed ? '是' : '否');
    
    // 构建菜单树结构
    const menuTree = buildMenuTree(allowedMenus);
    
    // 查找客户管理菜单及其子菜单
    const customerManagementMenu = findMenuInTree(menuTree, '550e8400-e29b-41d4-a716-446655440012');
    if (customerManagementMenu) {
      console.log('=== 客户管理菜单详细信息 ===');
      console.log('菜单名称:', customerManagementMenu.name);
      console.log('菜单ID:', customerManagementMenu.id);
      console.log('子菜单数量:', customerManagementMenu.children?.length || 0);
      console.log('子菜单列表:', customerManagementMenu.children?.map(c => ({
        id: c.id,
        name: c.name,
        path: c.path,
        type: c.type,
        sort_order: c.sort_order,
        parent_id: c.parent_id
      })) || []);
      
      // 检查"数据库对比"菜单
      const databaseCompareMenu = customerManagementMenu.children?.find(c => 
        c.name === '数据库对比' || c.path === '/system/database-compare'
      );
      if (databaseCompareMenu) {
        console.log('✅ 找到数据库对比菜单:', databaseCompareMenu);
      } else {
        console.log('❌ 客户管理子菜单中未找到数据库对比菜单');
        // 检查所有菜单中是否有"数据库对比"
        const allDatabaseCompare = allowedMenus.filter(m => 
          m.name === '数据库对比' || m.path === '/system/database-compare'
        );
        console.log('所有菜单中的数据库对比:', allDatabaseCompare.map(m => ({
          id: m.id,
          name: m.name,
          path: m.path,
          parent_id: m.parent_id,
          type: m.type
        })));
      }
    } else {
      console.log('❌ 未找到客户管理菜单');
    }

    res.json({
      success: true,
      data: {
        menus: menuTree
      },
      message: '获取角色菜单成功'
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: '获取角色菜单失败',
      error: error.message
    });
  }
});

// 辅助函数：在菜单树中查找菜单
function findMenuInTree(menuTree, menuId) {
  for (const menu of menuTree) {
    if (String(menu.id) === String(menuId)) {
      return menu;
    }
    if (menu.children && menu.children.length > 0) {
      const found = findMenuInTree(menu.children, menuId);
      if (found) return found;
    }
  }
  return null;
}

// 辅助函数：构建菜单树
function buildMenuTree(menus, parentId = null) {
  // 将parentId转换为字符串，确保类型匹配（数据库返回的可能是UUID对象或字符串）
  const parentIdStr = parentId ? String(parentId) : null;
  
  return menus
    .filter(menu => {
      // 统一转换为字符串进行比较，避免UUID类型不匹配问题
      const menuParentIdStr = menu.parent_id ? String(menu.parent_id) : null;
      return menuParentIdStr === parentIdStr;
    })
    .map(menu => ({
      id: menu.id,
      name: menu.name,
      path: menu.path,
      icon: menu.icon,
      type: menu.type,
      sort_order: menu.sort_order,
      children: buildMenuTree(menus, menu.id)
    }))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

// 修改当前用户密码（需要验证当前密码）
router.post('/change-password', verifySignatureAndToken, async (req, res, next) => {
  try {
  
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    // 验证参数
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '当前密码和新密码不能为空'
      });
    }

    // 验证新密码长度
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码长度至少6位'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '用户未登录'
      });
    }

    // 获取用户信息（包含密码）
    const filters = [{ type: 'eq', column: 'id', value: userId }];
    let userData;
    
    try {
      const users = await select('users', 'id, username, loginpass', filters, 1, 0);
      if (!users || users.length === 0) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      userData = users[0];
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '获取用户信息失败',
        error: error.message
      });
    }

    // 验证当前密码
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userData.loginpass);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: '当前密码错误'
      });
    }

    // 检查新密码是否与当前密码相同
    const isSamePassword = await bcrypt.compare(newPassword, userData.loginpass);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: '新密码不能与当前密码相同'
      });
    }

    // 加密新密码
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // 更新密码
    const updateData = { loginpass: hashedNewPassword };
    
    try {
      await update('users', updateData, filters);
      
      res.json({
        success: true,
        message: '密码修改成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '更新密码失败',
        error: error.message
      });
    }

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: '修改密码失败',
      error: error.message
    });
  }
});

export default router;