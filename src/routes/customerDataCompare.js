import express from 'express';
import { getSupabaseClient } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';

const router = express.Router();

/**
 * 测试数据库连接
 */
router.get('/test-connection', verifySignatureAndToken, async (req, res, next) => {
  try {
    const client = getSupabaseClient();
    
    // 简单查询测试
    const { data, error } = await client
      .from('customers')
      .select('id, phone')
      .limit(1);
    
    if (error) {
      return res.status(500).json({
        success: false,
        message: '数据库连接测试失败',
        error: error.message,
        errorCode: error.code
      });
    }
    
    res.json({
      success: true,
      message: '数据库连接正常',
      sampleData: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '数据库连接测试失败',
      error: error.message
    });
  }
});

/**
 * 批量检查客户数据是否已存在（仅对比电话号码）
 * 如果电话号码在customers表中存在，则标记为重复
 */
router.post('/batch-check-optimized', verifySignatureAndToken, async (req, res, next) => {
  try {
    console.log('=== 开始批量对比 ===');
    console.log('收到批量对比请求，数据量:', req.body.customerList?.length || 0);
    
    const { customerList } = req.body;
    
    if (!customerList || !Array.isArray(customerList) || customerList.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供客户数据列表'
      });
    }
    
    if (customerList.length > 1000000) {
      return res.status(400).json({
        success: false,
        message: '单次最多支持对比1000000条数据'
      });
    }
    
    // 初始化Supabase客户端
    let client;
    try {
      client = getSupabaseClient();
      console.log('✓ Supabase客户端初始化成功');
    } catch (clientError) {
      console.error('✗ Supabase客户端初始化失败:', clientError);
      return res.status(500).json({
        success: false,
        message: '数据库连接失败',
        error: clientError.message
      });
    }
    
    // 提取所有电话号码（去重并清理）
    const phones = new Set();
    
    customerList.forEach((customer, index) => {
      const phone = customer.phone ? String(customer.phone).trim() : '';
      if (phone) {
        phones.add(phone);
      }
      // 每处理1000条打印一次进度
      if ((index + 1) % 1000 === 0) {
        console.log(`已处理 ${index + 1}/${customerList.length} 条数据`);
      }
    });
    
    console.log(`✓ 提取到 ${phones.size} 个唯一电话号码`);
    
    if (phones.size === 0) {
      return res.status(400).json({
        success: false,
        message: '客户数据中没有有效的电话号码'
      });
    }
    
    // 批量查询已存在的客户（按电话号码）
    // 方案A：使用PostgreSQL函数 + 临时表 + JOIN（最优性能）
    const existingCustomersMap = new Map();
    const phoneArray = Array.from(phones);
    
    console.log(`准备使用临时表+JOIN查询 ${phoneArray.length} 个电话号码...`);
    const queryStartTime = Date.now();
    
    try {
      // 尝试使用PostgreSQL函数（临时表+JOIN）
      // 如果函数不存在，会回退到批量查询
      const { data: phoneMatches, error: rpcError } = await client
        .rpc('compare_customer_phones', {
          phone_list: phoneArray
        });
      
      if (!rpcError && phoneMatches) {
        // 函数执行成功，使用结果
        console.log(`✓ 使用临时表+JOIN查询成功，找到 ${phoneMatches.length} 条匹配记录`);
        
        phoneMatches.forEach(customer => {
          const phoneKey = String(customer.phone || '').trim();
          if (phoneKey) {
            if (!existingCustomersMap.has(phoneKey)) {
              existingCustomersMap.set(phoneKey, []);
            }
            existingCustomersMap.get(phoneKey).push(customer);
          }
        });
      } else {
        // 函数不存在或执行失败，回退到批量查询
        console.log('⚠ PostgreSQL函数不可用，回退到批量查询方式');
        console.log('提示：执行 manageapi/sql/create_customer_compare_function.sql 可启用高性能查询');
        
        // 根据数据量动态调整批次大小
        let phoneBatchSize = 100;
        if (phoneArray.length > 10000) {
          phoneBatchSize = 1000; // 大数据量使用1000/批
        } else if (phoneArray.length > 1000) {
          phoneBatchSize = 500;
        }
        
        const totalBatches = Math.ceil(phoneArray.length / phoneBatchSize);
        console.log(`准备分 ${totalBatches} 批查询数据库（每批 ${phoneBatchSize} 个电话号码）`);
        
        // 分批查询
        for (let i = 0; i < phoneArray.length; i += phoneBatchSize) {
          const phoneBatch = phoneArray.slice(i, i + phoneBatchSize);
          
          if (phoneBatch.length === 0) {
            continue;
          }
          
          try {
            const batchNum = Math.floor(i / phoneBatchSize) + 1;
            
            if (batchNum % 10 === 0 || batchNum === totalBatches) {
              console.log(`[${batchNum}/${totalBatches}] 查询 ${phoneBatch.length} 个电话号码...`);
            }
            
            const { data: batchMatches, error: batchError } = await client
              .from('customers')
              .select('id, name, phone, email, company, status, source, created_at, created_by')
              .in('phone', phoneBatch);
            
            if (batchError) {
              console.error(`✗ 第 ${batchNum} 批查询失败:`, batchError.message);
              // 继续处理其他批次，不中断
              continue;
            }
            
            if (batchMatches) {
              batchMatches.forEach(customer => {
                const phoneKey = String(customer.phone || '').trim();
                if (phoneKey) {
                  if (!existingCustomersMap.has(phoneKey)) {
                    existingCustomersMap.set(phoneKey, []);
                  }
                  existingCustomersMap.get(phoneKey).push(customer);
                }
              });
              
              if (batchNum % 10 === 0 || batchNum === totalBatches) {
                console.log(`  ✓ 已处理 ${batchNum}/${totalBatches} 批，找到 ${existingCustomersMap.size} 个重复电话号码`);
              }
            }
          } catch (error) {
            console.error(`✗ 第 ${Math.floor(i / phoneBatchSize) + 1} 批查询异常:`, error.message);
            // 继续处理其他批次
            continue;
          }
        }
      }
    } catch (error) {
      console.error('查询数据库失败:', error);
      return res.status(500).json({
        success: false,
        message: '查询数据库失败',
        error: error.message || String(error)
      });
    }
    
    const queryEndTime = Date.now();
    const queryDuration = ((queryEndTime - queryStartTime) / 1000).toFixed(2);
    console.log(`✓ 数据库查询完成，共找到 ${existingCustomersMap.size} 个重复电话号码，耗时 ${queryDuration} 秒`);
    
    console.log(`✓ 数据库查询完成，共找到 ${existingCustomersMap.size} 个重复电话号码`);
    
    // 批量查询用户信息（创建者）
    const creatorIds = new Set();
    existingCustomersMap.forEach(customers => {
      customers.forEach(customer => {
        if (customer.created_by) {
          creatorIds.add(customer.created_by);
        }
      });
    });
    
    console.log(`准备查询 ${creatorIds.size} 个创建者信息...`);
    const userMap = new Map();
    
    if (creatorIds.size > 0) {
      try {
        const userIdArray = Array.from(creatorIds);
        const userBatchSize = 100;
        
        for (let i = 0; i < userIdArray.length; i += userBatchSize) {
          const userBatch = userIdArray.slice(i, i + userBatchSize);
          
          const { data: users, error: userError } = await client
            .from('users')
            .select('id, name, username')
            .in('id', userBatch);
          
          if (userError) {
            console.warn('查询用户信息失败:', userError);
          } else if (users) {
            users.forEach(user => {
              userMap.set(user.id, {
                id: user.id,
                name: user.name || user.username || '未知用户',
                username: user.username
              });
            });
          }
        }
        
        console.log(`✓ 成功查询 ${userMap.size} 个用户信息`);
        
        // 将用户信息附加到客户记录中
        existingCustomersMap.forEach((customers, phone) => {
          customers.forEach(customer => {
            if (customer.created_by && userMap.has(customer.created_by)) {
              customer.created_by_user = userMap.get(customer.created_by);
            } else {
              customer.created_by_user = null;
            }
          });
        });
      } catch (error) {
        console.warn('查询用户信息时出错:', error);
      }
    }
    
    // 处理每个新客户，检查电话号码是否重复
    console.log('开始处理对比结果...');
    const results = customerList.map((newCustomer, index) => {
      const phone = newCustomer.phone ? String(newCustomer.phone).trim() : '';
      
      if (!phone) {
        return {
          ...newCustomer,
          isDuplicate: false,
          duplicateReason: '电话号码为空',
          matchedCustomers: []
        };
      }
      
      const matchedCustomers = existingCustomersMap.get(phone) || [];
      const isDuplicate = matchedCustomers.length > 0;
      
      // 每处理1000条打印一次进度
      if ((index + 1) % 1000 === 0) {
        console.log(`已处理 ${index + 1}/${customerList.length} 条对比结果`);
      }
      
      return {
        ...newCustomer,
        isDuplicate: isDuplicate,
        duplicateReason: isDuplicate 
          ? `找到 ${matchedCustomers.length} 条匹配记录（电话号码已存在）` 
          : '未找到重复数据（新客户）',
        matchedCustomers: matchedCustomers
      };
    });
    
    // 统计结果
    const duplicateCount = results.filter(r => r.isDuplicate).length;
    const uniqueCount = results.filter(r => !r.isDuplicate);
    
    console.log(`✓ 对比完成: 总计 ${results.length} 条，重复 ${duplicateCount} 条，新增 ${uniqueCount.length} 条`);
    
    res.json({
      success: true,
      data: {
        results: results,
        summary: {
          total: results.length,
          duplicate: duplicateCount,
          unique: uniqueCount.length,
          duplicateRate: results.length > 0 ? ((duplicateCount / results.length) * 100).toFixed(2) + '%' : '0%'
        }
      },
      message: '批量对比完成'
    });
    
  } catch (error) {
    console.error('✗ 批量对比客户数据失败:', error);
    console.error('错误类型:', error.constructor.name);
    console.error('错误消息:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    return res.status(500).json({
      success: false,
      message: '对比失败',
      error: error.message || String(error),
      errorType: error.constructor.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 获取客户数据库统计信息
 */
router.get('/database-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    const client = getSupabaseClient();
    
    // 获取客户总数
    const { count: totalCount, error: countError } = await client
      .from('customers')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('获取客户总数失败:', countError);
      return res.status(500).json({
        success: false,
        message: '获取统计信息失败',
        error: countError.message
      });
    }
    
    res.json({
      success: true,
      data: {
        totalCustomers: totalCount || 0,
        message: `底料数据库共有 ${totalCount || 0} 条客户记录`
      },
      message: '获取统计信息成功'
    });
    
  } catch (error) {
    console.error('获取数据库统计失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取统计信息失败',
      error: error.message
    });
  }
});

/**
 * 批量保存新增客户数据到数据库（高性能批量创建）
 * 优化：批量检查重复，大批次插入，适合十几万条数据
 */
router.post('/save-new-customers', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { customerList } = req.body;
    const currentUserId = req.user.id;
    
    if (!customerList || !Array.isArray(customerList) || customerList.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供客户数据列表'
      });
    }
    
    console.log(`准备批量创建 ${customerList.length} 条客户数据，创建用户: ${currentUserId}`);
    const startTime = Date.now();
    
    const client = getSupabaseClient();
    
    // 第一步：快速过滤和准备数据（不检查数据库）
    const validCustomers = [];
    const invalidCustomers = [];
    
    for (const customer of customerList) {
      // 验证必填字段：电话号码
      if (!customer.phone || !String(customer.phone).trim()) {
        invalidCustomers.push({ customer, reason: '电话号码为空' });
        continue;
      }
      
      const phone = String(customer.phone).trim();
      
      // 确保name字段不为空（数据库约束要求NOT NULL）
      // 如果name为空或只有空格，使用电话号码作为默认值
      const customerName = (customer.name && String(customer.name).trim()) 
        ? String(customer.name).trim() 
        : `客户_${phone}`;
      
      // 状态映射：将前端的中文状态映射到数据库状态值
      // 如果前端传入的状态不在映射表中，则使用默认值'active'
      const statusMap = {
        '数据': 'active',
        '意向客户': 'inactive',
        '进群客户': 'vip'
      };
      const customerStatus = customer.status && statusMap[customer.status] 
        ? statusMap[customer.status] 
        : (customer.status || 'active'); // 如果传入的是英文状态值，直接使用；否则默认为'active'
      
      // 准备客户数据，所有字段都使用合理的默认值
      // 注意：即使只有电话号码也可以保存，其他字段可以为空
      validCustomers.push({
        name: customerName, // 必填，使用电话号码作为默认值
        company: (customer.company && String(customer.company).trim()) ? String(customer.company).trim() : null,
        phone: phone, // 必填
        email: (customer.email && String(customer.email).trim()) ? String(customer.email).trim() : null,
        status: customerStatus, // 使用映射后的状态值
        source: 'other', // 标记为导入来源（数据库约束只允许：online, offline, referral, other）
        address: (customer.address && String(customer.address).trim()) ? String(customer.address).trim() : null,
        notes: (customer.notes && String(customer.notes).trim()) ? String(customer.notes).trim() : '',
        created_by: currentUserId, // 记录创建用户
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    if (validCustomers.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有有效的客户数据可保存',
        invalidCount: invalidCustomers.length
      });
    }
    
    console.log(`✓ 数据准备完成: ${validCustomers.length} 条有效，${invalidCustomers.length} 条无效`);
    
    // 第二步：批量检查重复（一次性查询所有电话号码）
    const phones = new Set(validCustomers.map(c => c.phone));
    const phoneArray = Array.from(phones);
    const existingPhones = new Set();
    
    if (phoneArray.length > 0) {
      console.log(`批量检查 ${phoneArray.length} 个电话号码是否已存在...`);
      const checkBatchSize = 1000; // 大批次检查
      
      for (let i = 0; i < phoneArray.length; i += checkBatchSize) {
        const phoneBatch = phoneArray.slice(i, i + checkBatchSize);
        
        try {
          const { data: existing, error } = await client
            .from('customers')
            .select('phone')
            .in('phone', phoneBatch);
          
          if (!error && existing) {
            existing.forEach(c => existingPhones.add(c.phone));
          }
        } catch (checkError) {
          console.warn(`检查批次 ${Math.floor(i / checkBatchSize) + 1} 失败:`, checkError.message);
        }
      }
      
      console.log(`✓ 发现 ${existingPhones.size} 个已存在的电话号码`);
    }
    
    // 第三步：过滤掉已存在的客户
    const customersToInsert = validCustomers.filter(c => !existingPhones.has(c.phone));
    const duplicateCount = validCustomers.length - customersToInsert.length;
    
    if (customersToInsert.length === 0) {
      return res.status(400).json({
        success: false,
        message: '所有客户数据都已存在',
        duplicateCount: duplicateCount
      });
    }
    
    console.log(`准备插入 ${customersToInsert.length} 条新客户数据（跳过 ${duplicateCount} 条重复）`);
    
    // 第四步：大批量插入（分批处理，避免单次插入过多导致超时或失败）
    const insertBatchSize = 200; // 减小批次大小，提高成功率（200条一批比较稳定）
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const createdIds = [];
    
    for (let i = 0; i < customersToInsert.length; i += insertBatchSize) {
      const batch = customersToInsert.slice(i, i + insertBatchSize);
      const batchNum = Math.floor(i / insertBatchSize) + 1;
      const totalBatches = Math.ceil(customersToInsert.length / insertBatchSize);
      
      try {
        const { data, error } = await client
          .from('customers')
          .insert(batch)
          .select('id');
        
        if (error) {
          console.error(`批量插入失败 (批次 ${batchNum}/${totalBatches}):`, error);
          console.error('错误代码:', error.code);
          console.error('错误详情:', JSON.stringify(error, null, 2));
          console.error('失败批次数据示例:', JSON.stringify(batch.slice(0, 2), null, 2));
          errorCount += batch.length;
          errors.push({
            batch: batchNum,
            error: error.message || String(error),
            errorCode: error.code,
            errorDetails: error.details || error.hint,
            count: batch.length
          });
        } else if (data) {
          successCount += data.length;
          createdIds.push(...data.map(c => c.id));
          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`✓ 进度: ${batchNum}/${totalBatches} 批次，已插入 ${successCount} 条`);
          }
        } else {
          // 没有data也没有error，可能是静默失败
          console.warn(`批量插入无返回 (批次 ${batchNum}/${totalBatches})`);
          errorCount += batch.length;
          errors.push({
            batch: batchNum,
            error: '插入操作无返回数据',
            count: batch.length
          });
        }
      } catch (batchError) {
        console.error(`批量插入异常 (批次 ${batchNum}/${totalBatches}):`, batchError);
        console.error('异常堆栈:', batchError.stack);
        errorCount += batch.length;
        errors.push({
          batch: batchNum,
          error: batchError.message || String(batchError),
          count: batch.length
        });
      }
    }
    
    // 第五步：记录操作日志（异步，不阻塞响应）
    const logOperation = async () => {
      try {
        const { default: OperationLogger } = await import('../utils/operationLogger.js');
        const operationLogger = new OperationLogger();
        await operationLogger.recordOperation(
          'customers',
          'batch_create',
          createdIds.slice(0, 100).join(','), // 只记录前100个ID
          '客户',
          {
            count: successCount,
            source: 'import',
            total: customerList.length,
            invalid: invalidCustomers.length,
            duplicate: duplicateCount,
            failed: errorCount
          },
          currentUserId
        );
      } catch (logError) {
        console.warn('记录操作日志失败:', logError);
      }
    };
    logOperation(); // 异步执行，不等待
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`批量创建完成: 成功 ${successCount} 条，失败 ${errorCount} 条，重复 ${duplicateCount} 条，无效 ${invalidCustomers.length} 条，耗时 ${duration} 秒`);
    
    // 构建响应消息
    let responseMessage = `成功创建 ${successCount} 条客户数据`
    if (errorCount > 0) {
      responseMessage += `，${errorCount} 条失败`
      if (errors.length > 0) {
        const firstError = errors[0]
        responseMessage += `（错误: ${firstError.error || '未知错误'}）`
      }
    }
    if (duplicateCount > 0) {
      responseMessage += `，${duplicateCount} 条重复`
    }
    if (invalidCustomers.length > 0) {
      responseMessage += `，${invalidCustomers.length} 条无效`
    }
    responseMessage += `，耗时 ${duration} 秒`
    
    res.json({
      success: true,
      data: {
        total: customerList.length,
        success: successCount,
        failed: errorCount,
        duplicate: duplicateCount,
        invalid: invalidCustomers.length,
        duration: `${duration}秒`,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined // 只返回前10个错误
      },
      message: responseMessage
    });
    
  } catch (error) {
    console.error('批量创建客户数据失败:', error);
    return res.status(500).json({
      success: false,
      message: '批量创建客户失败',
      error: error.message || String(error)
    });
  }
});

export default router;
