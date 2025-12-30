const { getSupabaseClient } = require('./src/config/supabase.js');

// 测试递归部门查询功能
async function testDepartmentRecursive() {
  try {
    const client = getSupabaseClient();
    
    // 创建递归获取部门及其所有子部门ID的函数
    async function getDepartmentAndChildren(deptId) {
      const deptIds = [deptId];
      
      // 递归获取所有子部门
      async function getChildren(parentId) {
        const { data: children, error } = await client
          .from('department')
          .select('id')
          .eq('parent_id', parentId);
        
        if (error) {
          console.error('获取子部门失败:', error);
          return;
        }
        
        if (children && children.length > 0) {
          for (const child of children) {
            deptIds.push(child.id);
            await getChildren(child.id); // 递归获取子部门的子部门
          }
        }
      }
      
      await getChildren(deptId);
      return deptIds;
    }
    
    // 先查看部门表结构
    console.log('1. 查看部门表数据:');
    const { data: allDepts, error: allError } = await client
      .from('department')
      .select('*')
      .order('department_name');
    
    if (allError) {
      console.error('查询部门失败:', allError);
      return;
    }
    
    console.log('所有部门:', allDepts);
    
    // 测试递归查询
    if (allDepts && allDepts.length > 0) {
      const testDeptId = allDepts[0].id;
      console.log(`\n2. 测试递归查询部门ID: ${testDeptId} 及其子部门`);
      
      const deptIds = await getDepartmentAndChildren(testDeptId);
      console.log('获取到的部门ID列表:', deptIds);
      
      // 验证结果
      console.log('\n3. 验证递归查询结果:');
      const { data: verifyData, error: verifyError } = await client
        .from('department')
        .select('id, department_name, parent_id')
        .in('id', deptIds)
        .order('department_name');
      
      if (verifyError) {
        console.error('验证查询失败:', verifyError);
      } else {
        console.log('验证结果:', verifyData);
      }
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
testDepartmentRecursive();