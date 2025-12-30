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
                    return `${filter.column}.ilike.%${filter.value}%`;
                } else if (filter.type === 'eq') {
                    return `${filter.column}.eq.${filter.value}`;
                } else if (filter.type === 'like') {
                    return `${filter.column}.like.%${filter.value}%`;
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
                query = query.or(orConditions);
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
            const orConditions = orFilters.map(filter => {
                if (filter.type === 'ilike') {
                    return `${filter.column}.ilike.%${filter.value}%`;
                } else if (filter.type === 'eq') {
                    return `${filter.column}.eq.${filter.value}`;
                } else if (filter.type === 'neq') {
                    return `${filter.column}.neq.${filter.value}`;
                } else if (filter.type === 'like') {
                    return `${filter.column}.like.%${filter.value}%`;
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
                query = query.or(orConditions);
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
        let query = client.from(table).delete();
        
        filters.forEach(filter => {
            query = query.eq(filter.column, filter.value);
        });
        
        const { data: deletedData, error } = await query;
        
        if (error) {
            throw error;
        }
        
        return deletedData;
    } catch (error) {
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