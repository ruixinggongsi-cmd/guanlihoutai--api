import { getSupabaseClient } from './src/config/supabase.js';

async function debugDepartmentStructure() {
    try {
        const supabase = getSupabaseClient();
        
        // 尝试获取department表的所有列信息
        console.log('正在查询department表结构...');
        
        // 先尝试查询一条数据来看看实际的列名
        const { data, error } = await supabase
            .from('department')
            .select('*')
            .limit(1);
            
        if (error) {
            console.error('查询department表失败:', error);
            
            // 如果department表不存在，尝试查看所有表
            console.log('尝试查看数据库中的所有表...');
            const { data: tables, error: tableError } = await supabase
                .from('information_schema.tables')
                .select('table_name')
                .eq('table_schema', 'public');
                
            if (tableError) {
                console.error('获取表列表失败:', tableError);
            } else {
                console.log('数据库中的表:', tables);
            }
        } else {
            console.log('department表数据示例:', data);
            
            if (data && data.length > 0) {
                console.log('department表的列名:', Object.keys(data[0]));
            }
        }
        
        // 尝试查看information_schema中的列信息
        console.log('正在查询information_schema中的列信息...');
        const { data: columns, error: columnError } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable')
            .eq('table_name', 'department')
            .eq('table_schema', 'public');
            
        if (columnError) {
            console.error('获取列信息失败:', columnError);
        } else {
            console.log('department表的列信息:', columns);
        }
        
    } catch (error) {
        console.error('调试失败:', error);
    }
}

debugDepartmentStructure();