/**
 * 操作日志记录类
 * 基于 operation_logs 表结构设计，提供完整的操作日志记录功能
 * 支持操作审计、行为分析和安全监控
 * 使用Supabase客户端进行数据库操作
 */

import { insert, select, count, update, deleteData } from '../config/supabase.js';

/**
 * 获取客户端IP地址
 * @param {Object} req - Express请求对象
 * @returns {string} - 客户端IP地址
 */
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

/**
 * 解析设备信息
 * @param {string} userAgent - 用户代理字符串
 * @param {Object} deviceInfo - 设备信息对象
 * @returns {Object} - 解析后的设备信息
 */
function parseDeviceInfo(userAgent, deviceInfo = {}) {
    const device = {
        device: deviceInfo.device || 'unknown',
        os: deviceInfo.os || 'unknown',
        browser: deviceInfo.browser || 'unknown',
        platform: deviceInfo.platform || 'unknown'
    };

    // 从userAgent中解析基本信息
    if (userAgent) {
        // 操作系统检测
        if (userAgent.includes('Windows NT')) {
            device.os = 'Windows';
        } else if (userAgent.includes('Mac OS X')) {
            device.os = 'macOS';
        } else if (userAgent.includes('Linux')) {
            device.os = 'Linux';
        } else if (userAgent.includes('Android')) {
            device.os = 'Android';
        } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
            device.os = 'iOS';
        }

        // 浏览器检测
        if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
            device.browser = 'Chrome';
        } else if (userAgent.includes('Firefox')) {
            device.browser = 'Firefox';
        } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
            device.browser = 'Safari';
        } else if (userAgent.includes('Edg')) {
            device.browser = 'Edge';
        } else if (userAgent.includes('Trident') || userAgent.includes('MSIE')) {
            device.browser = 'IE';
        }

        // 设备类型检测
        if (userAgent.includes('Mobile')) {
            device.device = 'Mobile';
        } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
            device.device = 'Tablet';
        } else {
            device.device = 'Desktop';
        }
    }

    return device;
}

class OperationLogger {
    constructor() {
        this.batchSize = 100; // 批处理大小
        this.logQueue = []; // 日志队列
        this.isProcessing = false; // 是否正在处理队列
    }

    /**
     * 记录操作日志
     * @param {Object} logData - 日志数据对象
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     * @param {string} logData.userId - 用户ID（如果未提供req对象）
     * @param {string} logData.username - 用户名（如果未提供req对象）
     * @param {string} logData.operationType - 操作类型
     * @param {string} logData.operationName - 操作名称
     * @param {string} logData.operationResult - 操作结果
     * @param {string} logData.failReason - 失败原因
     * @param {string} logData.targetType - 目标对象类型
     * @param {string} logData.targetId - 目标对象ID
     * @param {string} logData.targetName - 目标对象名称
     * @param {Object} logData.oldData - 操作前数据
     * @param {Object} logData.newData - 操作后数据
     * @param {string[]} logData.changedFields - 变更字段列表
     * @param {string} logData.requestMethod - HTTP请求方法
     * @param {string} logData.requestUrl - 请求URL
     * @param {Object} logData.requestParams - 请求参数
     * @param {Object} logData.deviceInfo - 设备信息
     * @param {string} logData.userAgent - 用户代理
     * @param {string} logData.ipAddress - IP地址
     * @param {Object} logData.ipLocation - IP地理位置
     * @param {number} logData.executionTimeMs - 执行时间（毫秒）
     * @param {number} logData.memoryUsageMb - 内存使用（MB）
     * @param {Date} logData.operationTime - 操作时间
     */
    async recordOperation(logData, req = null) {
        try {
            if (typeof logData === 'string') {
                const userIdArg = req;
                logData = {
                    targetType: logData,
                    operationType: arguments[1],
                    targetId: arguments[2] != null ? String(arguments[2]) : null,
                    targetName: arguments[3] || null,
                    newData: typeof arguments[4] === 'object' ? arguments[4] : null,
                    userId: typeof userIdArg === 'string' ? userIdArg : (userIdArg?.id || userIdArg?.userId || null)
                };
                req = null;
            }

            // 如果有req对象，自动填充用户和请求信息
            const enrichedLogData = await this.enrichLogData(logData, req);
            
            // 数据验证
            this.validateLogData(enrichedLogData);
            
            // 构建插入数据
            const insertData = this.buildInsertData(enrichedLogData);
            
            // 使用Supabase的insert函数插入数据
            const insertedData = await insert('operation_logs', insertData);
            
            if (insertedData) {
                if (Array.isArray(insertedData) && insertedData.length > 0) {
                    return insertedData[0].id;
                } else if (insertedData.id) {
                    return insertedData.id;
                }
            }
            
            return null;
            
        } catch (error) {
            console.error('记录操作日志失败:', error);
            // 失败时加入队列，后续重试
            // this.addToQueue(logData);
            // throw error;
        }
    }

    /**
     * 批量记录操作日志
     * @param {Array} logDataArray - 日志数据数组
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     * @returns {Promise<number>} - 成功记录的日志数量
     */
    async recordOperations(logDataArray, req = null) {
        try {
            if (!Array.isArray(logDataArray) || logDataArray.length === 0) {
                return 0;
            }
            
            let successCount = 0;
            const batchData = [];
            
            // 准备批量数据
            for (const logData of logDataArray) {
                try {
                    // 如果有req对象，自动填充用户和请求信息
                    const enrichedLogData = req ? await this.enrichLogData(logData, req) : logData;
                    
                    // 数据验证
                    this.validateLogData(enrichedLogData);
                    
                    // 构建插入数据
                    const insertData = this.buildInsertData(enrichedLogData);
                    batchData.push(insertData);
                    
                } catch (error) {
                    console.error('批量记录单个操作日志失败:', error);
                    // 继续处理其他日志
                }
            }
            
            // 使用Supabase批量插入
            if (batchData.length > 0) {
                const insertedData = await insert('operation_logs', batchData);
                successCount = insertedData ? (Array.isArray(insertedData) ? insertedData.length : 1) : 0;
            }
            
            return successCount || 0;
            
        } catch (error) {
            console.error('批量记录操作日志失败:', error);
            // // 失败时加入队列，后续重试
            // for (const logData of logDataArray) {
            //     this.addToQueue(logData);
            // }
        }
    }

    /**
     * 记录查询操作
     * @param {Object} options - 查询操作选项
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     */
    async recordQueryOperation(options = {}, req = null) {
        const logData = {
            operationType: 'read',
            operationResult: 'success',
            ...options
        };
        
        return await this.recordOperation(logData, req);
    }

    /**
     * 记录数据变更操作
     * @param {Object} options - 数据变更选项
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     */
    async recordDataChange(options = {}, req = null) {
        const logData = {
            operationType: options.operationType || 'update',
            operationResult: 'success',
            ...options
        };
        
        // 如果没有提供changedFields，尝试从oldData和newData中提取
        if (!logData.changedFields && logData.oldData && logData.newData) {
            logData.changedFields = this.extractChangedFields(logData.oldData, logData.newData);
        }
        
        return await this.recordOperation(logData, req);
    }

    /**
     * 记录系统错误
     * @param {Object} options - 系统错误选项
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     */
    async recordSystemError(options = {}, req = null) {
        const logData = {
            operationType: options.operationType || 'system',
            operationResult: 'error',
            failReason: options.error?.message || options.failReason || '系统错误',
            ...options
        };
        
        return await this.recordOperation(logData, req);
    }

    /**
     * 记录登录操作
     * @param {Object} options - 登录选项
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     */
    async recordLogin(options = {}, req = null) {
        const logData = {
            operationType: 'login',
            operationName: options.operationName || '用户登录',
            operationResult: options.success ? 'success' : 'failed',
            ...options
        };
        
        return await this.recordOperation(logData, req);
    }

    /**
     * 记录登出操作
     * @param {Object} options - 登出选项
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     */
    async recordLogout(options = {}, req = null) {
        const logData = {
            operationType: 'logout',
            operationName: options.operationName || '用户登出',
            operationResult: 'success',
            ...options
        };
        
        return await this.recordOperation(logData, req);
    }

    /**
     * 记录权限操作
     * @param {Object} options - 权限操作选项
     * @param {Object} req - Express请求对象（可选，用于自动获取用户和请求信息）
     */
    async recordPermissionOperation(options = {}, req = null) {
        const logData = {
            operationType: 'permission',
            operationName: options.operationName || '权限操作',
            operationResult: options.success ? 'success' : 'failed',
            ...options
        };
        
        return await this.recordOperation(logData, req);
    }

    /**
     * 构建插入数据
     * @private
     */
    buildInsertData(logData) {
        return {
            user_id: logData.userId || logData.user_id || null,
            username: logData.username || null,
            operation_type: logData.operationType || logData.operation_type || 'unknown',
            operation_name: logData.operationName || logData.operation_name || '未知操作',
            operation_result: logData.operationResult || logData.operation_result || 'success',
            fail_reason: logData.failReason || logData.fail_reason || null,
            target_type: logData.targetType || logData.target_type || null,
            target_id: logData.targetId || logData.target_id || null,
            target_name: logData.targetName || logData.target_name || null,
            old_data: logData.oldData || logData.old_data ? JSON.stringify(logData.oldData || logData.old_data) : null,
            new_data: logData.newData || logData.new_data ? JSON.stringify(logData.newData || logData.new_data) : null,
            changed_fields: logData.changedFields || logData.changed_fields || null,
            request_method: logData.requestMethod || logData.request_method || null,
            request_url: logData.requestUrl || logData.request_url || null,
            request_params: logData.requestParams || logData.request_params ? JSON.stringify(logData.requestParams || logData.request_params) : null,
            device_info: logData.deviceInfo || logData.device_info ? JSON.stringify(logData.deviceInfo || logData.device_info) : null,
            user_agent: logData.userAgent || logData.user_agent || null,
            ip_address: logData.ipAddress || logData.ip_address || null,
            ip_location: logData.ipLocation || logData.ip_location ? JSON.stringify(logData.ipLocation || logData.ip_location) : null,
            execution_time_ms: logData.executionTimeMs || logData.execution_time_ms || null,
            memory_usage_mb: logData.memoryUsageMb || logData.memory_usage_mb || null,
            operation_time: logData.operationTime || logData.operation_time || new Date()
        };
    }

    /**
     * 验证日志数据
     * @private
     */
    validateLogData(logData) {
        if (!logData) {
           // throw new Error('日志数据不能为空');
        }

        // 验证操作类型
        const validOperationTypes = [
            'create', 'read', 'update', 'delete', 'export', 'import',
            'login', 'logout', 'approve', 'reject', 'assign', 'transfer',
            'enable', 'disable', 'reset', 'config', 'system'
        ];

        const operationType = logData.operationType || logData.operation_type || 'unknown';
        if (!validOperationTypes.includes(operationType)) {
            //throw new Error(`无效的操作类型: ${operationType}`);
        }

        // 验证操作结果
        const validResults = ['success', 'failed', 'denied', 'error'];
        const operationResult = logData.operationResult || logData.operation_result || 'success';
        if (!validResults.includes(operationResult)) {
            //throw new Error(`无效的操作结果: ${operationResult}`);
        }
    }

    /**
     * 提取变更字段
     * @private
     */
    extractChangedFields(oldData, newData) {
        const changedFields = [];
        
        if (!oldData || !newData) {
            return changedFields;
        }

        const oldKeys = Object.keys(oldData);
        const newKeys = Object.keys(newData);
        const allKeys = [...new Set([...oldKeys, ...newKeys])];

        for (const key of allKeys) {
            if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
                changedFields.push(key);
            }
        }

        return changedFields;
    }

    /**
     * 添加到队列（失败重试机制）
     * @private
     */
    addToQueue(logData) {
        this.logQueue.push({
            data: logData,
            retryCount: 0,
            timestamp: new Date()
        });

        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * 处理队列
     * @private
     */
    async processQueue() {
        if (this.isProcessing || this.logQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.logQueue.length > 0) {
            const queueItem = this.logQueue.shift();
            
            try {
                await this.recordOperation(queueItem.data);
            } catch (error) {
                queueItem.retryCount++;
                
                // 最多重试3次
                if (queueItem.retryCount < 3) {
                    this.logQueue.push(queueItem);
                } else {
                    console.error(`日志记录失败，已达到最大重试次数:`, queueItem.data);
                }
            }

            // 避免CPU过载
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.isProcessing = false;
    }

    /**
     * 查询操作日志
     * @param {Object} filters - 查询条件
     * @param {Object} options - 查询选项
     */
    async queryLogs(filters = {}, options = {}) {
        const {
            userId,
            username,
            operationType,
            operationResult,
            targetType,
            targetId,
            ipAddress,
            startTime,
            endTime,
            limit = 50,
            offset = 0
        } = filters;

        let query = `
            SELECT * FROM public.operation_logs 
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;

        // 构建查询条件
        if (userId) {
            query += ` AND user_id = $${paramIndex++}`;
            params.push(userId);
        }

        if (username) {
            query += ` AND username ILIKE $${paramIndex++}`;
            params.push(`%${username}%`);
        }

        if (operationType) {
            query += ` AND operation_type = $${paramIndex++}`;
            params.push(operationType);
        }

        if (operationResult) {
            query += ` AND operation_result = $${paramIndex++}`;
            params.push(operationResult);
        }

        if (targetType) {
            query += ` AND target_type = $${paramIndex++}`;
            params.push(targetType);
        }

        if (targetId) {
            query += ` AND target_id = $${paramIndex++}`;
            params.push(targetId);
        }

        if (ipAddress) {
            query += ` AND ip_address = $${paramIndex++}`;
            params.push(ipAddress);
        }

        if (startTime) {
            query += ` AND operation_time >= $${paramIndex++}`;
            params.push(startTime);
        }

        if (endTime) {
            query += ` AND operation_time <= $${paramIndex++}`;
            params.push(endTime);
        }

        // 构建查询条件对象
        const queryConditions = {};
        
        if (userId) {
            queryConditions.user_id = userId;
        }
        
        if (username) {
            queryConditions.username = { like: `%${username}%` };
        }
        
        if (operationType) {
            queryConditions.operation_type = operationType;
        }
        
        if (operationResult) {
            queryConditions.operation_result = operationResult;
        }
        
        if (targetType) {
            queryConditions.target_type = targetType;
        }
        
        if (targetId) {
            queryConditions.target_id = targetId;
        }
        
        if (ipAddress) {
            queryConditions.ip_address = ipAddress;
        }
        
        if (startTime || endTime) {
            queryConditions.operation_time = {};
            if (startTime) {
                queryConditions.operation_time.gte = startTime;
            }
            if (endTime) {
                queryConditions.operation_time.lte = endTime;
            }
        }
        
        // 排序条件
        const orderConditions = { column: 'operation_time', ascending: false };
        
        // 使用Supabase的select函数查询数据
        const data = await select('operation_logs', queryConditions, orderConditions, limit, offset);
        
        return data || [];
    }

    /**
     * 获取操作统计
     * @param {Object} filters - 查询条件
     */
    async getOperationStats(filters = {}) {
        const { startTime, endTime, userId } = filters;

        // 构建查询条件对象
        const queryConditions = {};
        
        if (startTime) {
            queryConditions.operation_time = { gte: startTime };
        }
        
        if (endTime) {
            if (!queryConditions.operation_time) {
                queryConditions.operation_time = {};
            }
            queryConditions.operation_time.lte = endTime;
        }
        
        if (userId) {
            queryConditions.user_id = userId;
        }
        
        // 使用Supabase的select函数获取原始数据
        const data = await select('operation_logs', queryConditions);
        
        // 手动进行分组统计
        const stats = {};
        
        data.forEach(record => {
            const key = `${record.operation_type}_${record.operation_result}`;
            if (!stats[key]) {
                stats[key] = {
                    operation_type: record.operation_type,
                    operation_result: record.operation_result,
                    count: 0,
                    execution_times: []
                };
            }
            
            stats[key].count++;
            if (record.execution_time_ms) {
                stats[key].execution_times.push(record.execution_time_ms);
            }
        });
        
        // 计算平均值和最大值
        const result = Object.values(stats).map(stat => ({
            operation_type: stat.operation_type,
            operation_result: stat.operation_result,
            count: stat.count,
            avg_execution_time: stat.execution_times.length > 0 
                ? stat.execution_times.reduce((sum, time) => sum + time, 0) / stat.execution_times.length 
                : 0,
            max_execution_time: stat.execution_times.length > 0 
                ? Math.max(...stat.execution_times) 
                : 0
        }));
        
        // 按count降序排序
        result.sort((a, b) => b.count - a.count);
        
        return result;
    }

    /**
     * 清理过期日志
     * @param {number} daysToKeep - 保留天数
     */
    async cleanupOldLogs(daysToKeep = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        // 构建删除条件
        const deleteConditions = {
            operation_time: { lt: cutoffDate }
        };

        const result = await deleteData('operation_logs', deleteConditions);
        return result ? (Array.isArray(result) ? result.length : 1) : 0;
    }

    /**
     * 丰富日志数据（从请求对象和登录用户信息中获取基本信息）
     * @private
     * @param {Object} logData - 原始日志数据
     * @param {Object} req - Express请求对象
     * @returns {Object} - 丰富后的日志数据
     */
    enrichLogData(logData, req) {
        if (!req) {
            return logData;
        }

        const enrichedData = { ...logData };

        // 从登录用户信息中获取用户ID和用户名
        if (req.user) {
            enrichedData.userId = enrichedData.userId || req.user.id || req.user.userId;
            enrichedData.username = enrichedData.username || req.user.username || req.user.name;
        }

        // 获取请求基本信息
        if (req.method) {
            enrichedData.requestMethod = enrichedData.requestMethod || req.method;
        }

        if (req.originalUrl || req.url) {
            enrichedData.requestUrl = enrichedData.requestUrl || req.originalUrl || req.url;
        }

        if (req.headers) {
            // 获取User-Agent
            if (req.headers['user-agent']) {
                enrichedData.userAgent = enrichedData.userAgent || req.headers['user-agent'];
                
                // 解析设备信息
                if (!enrichedData.deviceInfo) {
                    const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
                    enrichedData.deviceInfo = deviceInfo;
                }
            }
        }

        // 获取客户端IP地址
        if (!enrichedData.ipAddress) {
            const clientIP = getClientIP(req);
            enrichedData.ipAddress = clientIP;
        }

        // 获取请求参数
        if (!enrichedData.requestParams && (req.query || req.body)) {
            const params = {
                ...req.query,
                ...req.body
            };
            // 移除敏感信息
            delete params.password;
            delete params.token;
            delete params.secret;
            
            if (Object.keys(params).length > 0) {
                enrichedData.requestParams = params;
            }
        }

        return enrichedData;
    }
}

export default OperationLogger;