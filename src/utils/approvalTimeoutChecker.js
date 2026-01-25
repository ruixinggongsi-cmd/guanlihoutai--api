import { select, update } from '../config/supabase.js';
import { default as OperationLogger } from './operationLogger.js';

const operationLogger = new OperationLogger();

/**
 * 检查并处理超时的费用审批（48小时未完成自动拒绝）
 */
export async function checkExpenseApprovalTimeout() {
  try {
    const now = new Date();
    const timeoutHours = 48; // 48小时超时
    const timeoutMs = timeoutHours * 60 * 60 * 1000; // 转换为毫秒
    const timeoutThreshold = new Date(now.getTime() - timeoutMs); // 48小时前的时间点

    console.log(`[超时检查] ==========================================`);
    console.log(`[超时检查] 🕐 当前时间: ${now.toISOString()}`);
    console.log(`[超时检查] ⏰ 超时阈值（48小时前）: ${timeoutThreshold.toISOString()}`);
    console.log(`[超时检查] ==========================================`);

    // 查找所有待审批或审批中的费用申请（包括历史订单）
    const expenseFilters = [
      { type: 'in', column: 'status', value: ['pending', 'approving'] }
    ];
    console.log(`[超时检查] 📋 查询条件: status IN ('pending', 'approving')`);
    const pendingExpenses = await select('expense_applications', 'id, name, status, created_at, applicant_id', expenseFilters);

    if (!pendingExpenses || pendingExpenses.length === 0) {
      console.log('[超时检查] ✅ 没有待审批的费用申请');
      return {
        checked: 0,
        timeout: 0,
        timeoutIds: []
      };
    }

    console.log(`[超时检查] 📊 找到 ${pendingExpenses.length} 个待审批的费用申请，开始逐一检查...`);
    console.log(`[超时检查] 订单列表:`, pendingExpenses.map(e => ({ id: e.id, name: e.name, status: e.status, created_at: e.created_at })));

    let timeoutCount = 0;
    const timeoutIds = [];

    // 遍历每个待审批的申请
    for (const expense of pendingExpenses) {
      try {
        // 查找当前审批节点（is_current_node = true）
        const currentNodeFilters = [
          { type: 'eq', column: 'expense_id', value: expense.id },
          { type: 'eq', column: 'is_current_node', value: true },
          { type: 'in', column: 'status', value: ['pending', 'approving'] }
        ];
        
        const currentNodes = await select('expense_approval_nodes', '*', currentNodeFilters, 1, 0);
        
        if (!currentNodes || currentNodes.length === 0) {
          // 如果没有找到当前审批节点，可能是数据异常，记录日志但不跳过
          console.warn(`[超时检查] ⚠️ 费用申请 ${expense.id} (${expense.name}) 没有找到当前审批节点，状态: ${expense.status}`);
          // 如果申请状态是 pending 或 approving 但没有审批节点，可能是异常情况
          // 这种情况下，我们也可以基于申请的创建时间来判断是否超时
          const expenseCreatedAt = new Date(expense.created_at);
          if (expenseCreatedAt < timeoutThreshold) {
            const hoursElapsed = Math.floor((now - expenseCreatedAt) / (1000 * 60 * 60));
            console.log(`[超时检查] ⏰ 费用申请 ${expense.id} (${expense.name}) 无审批节点但已超时 ${hoursElapsed} 小时，自动拒绝`);
            
            const nowISO = now.toISOString();
            const timeoutComment = `审核超时（已超过${hoursElapsed}小时），系统自动拒绝（无审批节点）`;
            
            // 更新费用申请状态为已拒绝
            await update('expense_applications', {
              status: 'rejected',
              updated_at: nowISO
            }, [{ type: 'eq', column: 'id', value: expense.id }]);
            
            timeoutCount++;
            timeoutIds.push(expense.id);
          }
          continue;
        }

        const currentNode = currentNodes[0];
        
        // 获取当前节点的开始时间（优先使用 approval_start_time，否则使用 created_at）
        // 如果 approval_start_time 为空，使用节点的 created_at，如果节点 created_at 也为空，使用申请的 created_at
        const startTime = currentNode.approval_start_time || currentNode.created_at || expense.created_at;
        const startTimeDate = new Date(startTime);
        
        // 检查日期是否有效
        if (isNaN(startTimeDate.getTime())) {
          console.error(`[超时检查] ❌ 费用申请 ${expense.id} 的时间格式无效: ${startTime}`);
          continue;
        }
        
        // 调试日志：输出当前节点的时间信息
        const hoursElapsed = Math.floor((now - startTimeDate) / (1000 * 60 * 60));
        console.log(`[超时检查] 费用申请 ${expense.id} (${expense.name}) - 节点ID: ${currentNode.id}, approval_start_time: ${currentNode.approval_start_time}, created_at: ${currentNode.created_at}, 申请created_at: ${expense.created_at}, 使用时间: ${startTime}, 时间差: ${hoursElapsed} 小时`);
        
        // 检查是否超过48小时
        if (startTimeDate < timeoutThreshold) {
          const hoursElapsed = Math.floor((now - startTimeDate) / (1000 * 60 * 60));
          console.log(`[超时检查] ⏰ 费用申请 ${expense.id} (${expense.name}) 已超时 ${hoursElapsed} 小时，开始自动拒绝...`);

          const nowISO = now.toISOString();
          const timeoutComment = `审核超时（已超过${hoursElapsed}小时），系统自动拒绝`;

          // 更新当前节点为超时拒绝
          try {
            const nodeUpdateResult = await update('expense_approval_nodes', {
              status: 'rejected',
              comment: timeoutComment,
              is_current_node: false,
              approval_end_time: nowISO,
              updated_at: nowISO
            }, [{ type: 'eq', column: 'id', value: currentNode.id }]);
            console.log(`[超时检查] ✅ 节点 ${currentNode.id} 更新成功:`, nodeUpdateResult);
          } catch (nodeUpdateError) {
            console.error(`[超时检查] ❌ 更新节点 ${currentNode.id} 失败:`, nodeUpdateError);
            throw nodeUpdateError;
          }

          // 更新所有后续待处理节点为取消（排除当前节点）
          // 先查询出所有需要取消的节点
          const subsequentQueryFilters = [
            { type: 'eq', column: 'expense_id', value: expense.id },
            { type: 'in', column: 'status', value: ['pending', 'approving'] }
          ];
          
          const subsequentNodes = await select('expense_approval_nodes', 'id', subsequentQueryFilters);
          
          if (subsequentNodes && subsequentNodes.length > 0) {
            // 过滤掉当前节点
            const nodesToCancel = subsequentNodes.filter(node => node.id !== currentNode.id);
            
            // 逐个更新后续节点
            for (const nodeToCancel of nodesToCancel) {
              await update('expense_approval_nodes', {
                status: 'cancelled',
                comment: '前置节点超时自动拒绝，流程终止',
                updated_at: nowISO
              }, [{ type: 'eq', column: 'id', value: nodeToCancel.id }]);
            }
            
            console.log(`[超时检查] ✅ 已取消 ${nodesToCancel.length} 个后续节点`);
          }

          // 更新费用申请状态为已拒绝
          try {
            const expenseUpdateResult = await update('expense_applications', {
              status: 'rejected',
              updated_at: nowISO
            }, [{ type: 'eq', column: 'id', value: expense.id }]);
            console.log(`[超时检查] ✅ 费用申请 ${expense.id} (${expense.name}) 状态已更新为拒绝`);
            console.log(`[超时检查] 📝 更新结果:`, expenseUpdateResult);
          } catch (expenseUpdateError) {
            console.error(`[超时检查] ❌ 更新费用申请 ${expense.id} 状态失败:`, expenseUpdateError);
            throw expenseUpdateError;
          }

          // 记录操作日志
          await operationLogger.recordOperation('expense_applications', 'timeout_reject', {
            expense_id: expense.id,
            node_id: currentNode.id,
            timeout_hours: hoursElapsed,
            start_time: startTime,
            reject_time: nowISO,
            expense_name: expense.name,
            applicant_id: expense.applicant_id,
            comment: timeoutComment
          }, null); // 系统自动操作，没有操作人

          timeoutCount++;
          timeoutIds.push(expense.id);
        }
      } catch (expenseError) {
        console.error(`[超时检查] 处理费用申请 ${expense.id} 时出错:`, expenseError);
        // 继续处理下一个申请
      }
    }

    console.log(`[超时检查] ✅ 检查完成，共检查 ${pendingExpenses.length} 个申请，超时 ${timeoutCount} 个`);

    return {
      checked: pendingExpenses.length,
      timeout: timeoutCount,
      timeoutIds: timeoutIds
    };

  } catch (error) {
    console.error('[超时检查] ❌ 检查超时审批失败:', error);
    throw error;
  }
}

