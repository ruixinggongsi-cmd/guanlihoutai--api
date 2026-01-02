import { createClient } from '@supabase/supabase-js';

let supabase = null;

// 获取Supabase客户端实例（延迟初始化）
export const getSupabaseClient = () => {
    if (!supabase) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase配置错误：SUPABASE_URL 和 SUPABASE_KEY 环境变量是必需的');
        }
        
        supabase = createClient(supabaseUrl, supabaseKey);
    }
    return supabase;
};

// 为了向后兼容，也导出supabase实例（将在第一次使用时初始化）
export { supabase };


// 统计记录数的函数
export const count = async (table, filters = [], orFilters = null) => {
    try {
        const client = getSupabaseClient();
        let query = client.from(table).select('*', { count: 'exact' }).limit(0);
        
        // 处理OR逻辑过滤条件
        if (orFilters && orFilters.length > 0) {
            // 构建OR条件字符串
            const orConditions = orFilters.map(filter => {
                if (filter.type === 'ilike') {
                    // Supabase的ilike使用*作为通配符
                    const escapedValue = filter.value.replace(/%/g, '\\%').replace(/_/g, '\\_');
                    return `${filter.column}.ilike.*${escapedValue}*`;
                } else if (filter.type === 'eq') {
                    return `${filter.column}.eq.${filter.value}`;
                } else if (filter.type === 'like') {
                    const escapedValue = filter.value.replace(/%/g, '\\%').replace(/_/g, '\\_');
                    return `${filter.column}.like.*${escapedValue}*`;
                } else if (filter.type === 'gt') {
                    return `${filter.column}.gt.${filter.value}`;
                } else if (filter.type === 'gte') {
                    return `${filter.column}.gte.${filter.value}`;
                } else if (filter.type === 'lt') {
                    return `${filter.column}.lt.${filter.value}`;
                } else if (filter.type === 'lte') {
                    return `${filter.column}.lte.${filter.value}`;
                }
                return '';
            }).filter(condition => condition !== '').join(',');
            
            if (orConditions) {
                console.log(`[count] OR条件字符串: ${orConditions}`);
                try {
                    query = query.or(orConditions);
                } catch (orError) {
                    console.error(`[count] OR条件应用失败:`, orError);
                    throw orError;
                }
            }
        }
        
        // 处理AND逻辑过滤条件
        filters.forEach(filter => {
            if (filter.type === 'eq') {
                query = query.eq(filter.column, filter.value);
            } else if (filter.type === 'neq') {
                query = query.neq(filter.column, filter.value);
            } else if (filter.type === 'like') {
                query = query.like(filter.column, filter.value);
            } else if (filter.type === 'in') {
                query = query.in(filter.column, filter.value);
            } else if (filter.type === 'gt') {
                query = query.gt(filter.column, filter.value);
            } else if (filter.type === 'gte') {
                query = query.gte(filter.column, filter.value);
            } else if (filter.type === 'lte') {
                query = query.lte(filter.column, filter.value);
            } else if (filter.type === 'ilike') {
                query = query.ilike(filter.column, filter.value);
            }
        });
        
        const { count, error } = await query;
        
        if (error) {
            throw error;
        }
        
        return count || 0;
    } catch (error) {
        throw error;
    }
};

// 通用的Supabase查询函数
export const select = async (table, columns = '*', filters = [], limit=null ,offset=null, order=null, orFilters = null ) => {
    try {
        const client = getSupabaseClient();
        let query = client.from(table).select(columns);
        
        // 处理OR逻辑过滤条件
        if (orFilters && orFilters.length > 0) {
            // 构建OR条件字符串
            // Supabase的OR语法：column1.ilike.*value*,column2.ilike.*value*
            // 注意：Supabase使用*作为通配符，不是%
            const orConditions = orFilters.map(filter => {
                if (filter.type === 'ilike') {
                    // 转义特殊字符，Supabase使用*作为通配符
                    const escapedValue = String(filter.value).replace(/\*/g, '\\*').replace(/%/g, '\\%').replace(/_/g, '\\_');
                    return `${filter.column}.ilike.*${escapedValue}*`;
                } else if (filter.type === 'eq') {
                    return `${filter.column}.eq.${filter.value}`;
                } else if (filter.type === 'neq') {
                    return `${filter.column}.neq.${filter.value}`;
                } else if (filter.type === 'like') {
                    const escapedValue = String(filter.value).replace(/\*/g, '\\*').replace(/%/g, '\\%').replace(/_/g, '\\_');
                    return `${filter.column}.like.*${escapedValue}*`;
                } else if (filter.type === 'gt') {
                    return `${filter.column}.gt.${filter.value}`;
                } else if (filter.type === 'gte') {
                    return `${filter.column}.gte.${filter.value}`;
                } else if (filter.type === 'lt') {
                    return `${filter.column}.lt.${filter.value}`;
                } else if (filter.type === 'lte') {
                    return `${filter.column}.lte.${filter.value}`;
                }
                return '';
            }).filter(condition => condition !== '').join(',');
            
            if (orConditions) {
                console.log(`[select] OR条件字符串: ${orConditions}`);
                try {
                    query = query.or(orConditions);
                } catch (orError) {
                    console.error(`[select] OR条件应用失败:`, orError);
                    console.error(`[select] OR条件字符串: ${orConditions}`);
                    throw orError;
                }
            }
        }
        
        // 处理AND逻辑过滤条件
        if(filters && filters.length > 0) {
            filters.forEach(filter => {
                if (filter.type === 'eq') {
                    query = query.eq(filter.column, filter.value);
                } else if (filter.type === 'neq') {
                    query = query.neq(filter.column, filter.value);
                } else if (filter.type === 'like') {
                    query = query.like(filter.column, filter.value);
                } else if (filter.type === 'ilike') {
                    query = query.ilike(filter.column, filter.value);
                } else if (filter.type === 'in') {
                    query = query.in(filter.column, filter.value);
                } else if (filter.type === 'gt') {
                    query = query.gt(filter.column, filter.value);
                } else if (filter.type === 'gte') {
                    query = query.gte(filter.column, filter.value);
                } else if (filter.type === 'lt') {
                    query = query.lt(filter.column, filter.value);
                } else if (filter.type === 'lte') {
                    query = query.lte(filter.column, filter.value);
                }
            });
        }
       
        // 添加限制 - 只对非聚合查询应用
        if (limit && !columns.includes('COUNT(')) {
             query.range(parseInt(offset),parseInt(offset)+parseInt(limit)-1);
        }
       if(Array.isArray(order))
       {
            order.forEach(element => {
               
                if (element) {
                   
                    query.order(element.column, { ascending: element.ascending });
                }
            });
          
        }
        else
        {
             if (order) {
                query.order(order.column, { ascending: order.ascending });
            }
        }
        
        const { data, error } = await query;
       
        if (error) {
            throw error;
        }
        
        return data;
    } catch (error) {
        throw error;
    }
};

// 插入数据
export const insert = async (table, data) => {
    try {
        const client = getSupabaseClient();
        const { data: insertedData, error } = await client
            .from(table)
            .insert(data)
            .select();
        
        if (error) {
            throw error;
        }
        
        return insertedData;
    } catch (error) {
        throw error;
    }
};

// 更新数据
export const update = async (table, data, filters) => {
    try {
        const client = getSupabaseClient();
        let query = client.from(table).update(data);
        
        filters.forEach(filter => {
            query = query.eq(filter.column, filter.value);
        });
        
        const { data: updatedData, error } = await query.select();
        
        if (error) {
            throw error;
        }
        
        return updatedData;
    } catch (error) {
        throw error;
    }
};

// 删除数据
export const deleteData = async (table, filters) => {
    try {
        const client = getSupabaseClient();
        
        // 检查是否有IN类型的过滤器
        const inFilter = filters.find(f => f.type === 'in');
        
        if (inFilter && Array.isArray(inFilter.value) && inFilter.value.length > 0) {
            // 对于IN查询，Supabase可能不支持，改用循环删除或使用OR条件
            // 如果数组太大，分批处理
            const ids = inFilter.value;
            const batchSize = 50;
            let totalDeleted = [];
            
            if (ids.length <= batchSize) {
                // 数量较少，尝试使用OR条件
                try {
                    // 构建OR条件：id.eq.id1,id.eq.id2,...
                    const orConditions = ids.map(id => `${inFilter.column}.eq.${id}`).join(',');
                    let query = client.from(table).delete().or(orConditions);
                    const { data: deletedData, error } = await query;
                    
                    if (error) {
                        throw error;
                    }
                    
                    console.log(`[deleteData] 使用OR条件删除成功 - 表: ${table}, 删除数量:`, deletedData?.length || 0);
                    return deletedData || [];
                } catch (orError) {
                    console.log(`[deleteData] OR条件删除失败，改用循环删除:`, orError.message);
                    // OR条件失败，改用循环删除
                    for (const id of ids) {
                        try {
                            const { data, error } = await client.from(table).delete().eq(inFilter.column, id);
                            if (!error && data) {
                                totalDeleted = totalDeleted.concat(data);
                            }
                        } catch (singleError) {
                            console.error(`[deleteData] 删除单个记录失败 (${id}):`, singleError.message);
                        }
                    }
                    console.log(`[deleteData] 循环删除完成 - 表: ${table}, 删除数量:`, totalDeleted.length);
                    return totalDeleted;
                }
            } else {
                // 数量较多，分批处理
                for (let i = 0; i < ids.length; i += batchSize) {
                    const batch = ids.slice(i, i + batchSize);
                    const orConditions = batch.map(id => `${inFilter.column}.eq.${id}`).join(',');
                    try {
                        const { data, error } = await client.from(table).delete().or(orConditions);
                        if (!error && data) {
                            totalDeleted = totalDeleted.concat(data);
                        }
                    } catch (batchError) {
                        console.error(`[deleteData] 批次删除失败，改用循环删除:`, batchError.message);
                        // 批次失败，改用循环删除
                        for (const id of batch) {
                            try {
                                const { data, error } = await client.from(table).delete().eq(inFilter.column, id);
                                if (!error && data) {
                                    totalDeleted = totalDeleted.concat(data);
                                }
                            } catch (singleError) {
                                console.error(`[deleteData] 删除单个记录失败 (${id}):`, singleError.message);
                            }
                        }
                    }
                }
                console.log(`[deleteData] 分批删除完成 - 表: ${table}, 删除数量:`, totalDeleted.length);
                return totalDeleted;
            }
        } else {
            // 非IN查询，使用原有逻辑
            let query = client.from(table).delete();
            
            filters.forEach(filter => {
                if (filter.type === 'eq') {
                    query = query.eq(filter.column, filter.value);
                } else if (filter.type === 'neq') {
                    query = query.neq(filter.column, filter.value);
                } else {
                    // 默认使用 eq
                    query = query.eq(filter.column, filter.value);
                }
            });
            
            const { data: deletedData, error } = await query;
            
            if (error) {
                console.error(`[deleteData] 删除失败 - 表: ${table}`);
                console.error(`[deleteData] 错误代码:`, error.code);
                console.error(`[deleteData] 错误消息:`, error.message);
                console.error(`[deleteData] 错误详情:`, error.details);
                console.error(`[deleteData] 错误提示:`, error.hint);
                console.error(`[deleteData] 过滤条件:`, JSON.stringify(filters, null, 2));
                throw error;
            }
            
            console.log(`[deleteData] 删除成功 - 表: ${table}, 删除数量:`, deletedData?.length || 0);
            return deletedData;
        }
    } catch (error) {
        console.error(`[deleteData] 删除数据异常 - 表: ${table}`);
        console.error(`[deleteData] 异常消息:`, error.message);
        console.error(`[deleteData] 异常堆栈:`, error.stack);
        throw error;
    }
};

// 上传文件到Supabase存储
export const uploadFile = async (bucketName, fileName, fileBuffer, mimeType) => {
    try {
        const client = getSupabaseClient();
        const { data, error } = await client.storage
            .from(bucketName)
            .upload(fileName, fileBuffer, {
                contentType: mimeType,
                upsert: true
            });
        
        if (error) {
            throw error;
        }
        
        // 获取文件的公开URL
        const { data: { publicUrl } } = client.storage
            .from(bucketName)
            .getPublicUrl(fileName);
        
        return {
            path: data.path,
            url: publicUrl
        };
    } catch (error) {
        throw error;
    }
};

// 删除Supabase存储中的文件
export const deleteFile = async (bucketName, fileName) => {
    try {
        const client = getSupabaseClient();
        const { data, error } = await client.storage
            .from(bucketName)
            .remove([fileName]);
        
        if (error) {
            throw error;
        }
        
        return data;
    } catch (error) {
        throw error;
    }
};