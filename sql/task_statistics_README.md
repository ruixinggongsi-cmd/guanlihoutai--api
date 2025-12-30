# 任务统计函数文档

## 概述

本套SQL函数用于统计用户的任务数量和相关指标，基于`user_tasks`表提供全面的任务统计分析功能。

## 表结构

主要基于以下表：
- `public.user_tasks` - 任务主表
- `public.user_task_execution_details` - 任务执行明细表

## 核心统计函数

### 1. 基本任务统计函数

#### `get_user_task_statistics(p_user_id uuid, p_role_type text)`
获取用户的基本任务统计信息。

**参数：**
- `p_user_id`: 用户ID
- `p_role_type`: 角色类型 ('assignee' 或 'creator')

**返回字段：**
- `total_tasks`: 总任务数（不含已取消的任务）
- `in_progress_tasks`: 在执行任务数
- `completed_tasks`: 已完成任务数
- `wait_tasks`: 等待执行任务数
- `pending_tasks`: 待处理任务数
- `cancelled_tasks`: 已取消任务数
- `overdue_tasks`: 已逾期任务数

### 2. 分布统计函数

#### `get_user_task_priority_statistics(p_user_id uuid, p_role_type text)`
获取用户各优先级任务数量统计。

**返回字段：**
- `priority`: 优先级 (high, medium, low, urgent)
- `task_count`: 任务数量
- `percentage`: 百分比

#### `get_user_task_type_statistics(p_user_id uuid, p_role_type text)`
获取用户各任务类型数量统计。

**返回字段：**
- `task_type`: 任务类型
- `task_count`: 任务数量
- `percentage`: 百分比

#### `get_user_task_status_distribution(p_user_id uuid, p_role_type text)`
获取用户任务状态分布统计。

**返回字段：**
- `status`: 任务状态
- `task_count`: 任务数量
- `percentage`: 百分比

### 3. 综合统计函数

#### `get_user_comprehensive_task_statistics(p_user_id uuid, p_role_type text)`
获取用户的完整综合统计信息，返回JSON格式数据。

**返回JSON结构：**
```json
{
  "basic_stats": {
    "total_tasks": 10,
    "in_progress_tasks": 3,
    "completed_tasks": 5,
    "wait_tasks": 1,
    "pending_tasks": 1,
    "cancelled_tasks": 0,
    "overdue_tasks": 1
  },
  "priority_distribution": [
    {"priority": "high", "task_count": 4, "percentage": 40.00},
    {"priority": "medium", "task_count": 4, "percentage": 40.00},
    {"priority": "low", "task_count": 2, "percentage": 20.00}
  ],
  "type_distribution": [...],
  "status_distribution": [...],
  "generated_at": "2025-01-01T12:00:00Z",
  "role_type": "assignee"
}
```

## API端点函数

### 1. 概览统计API

#### `api_get_user_task_overview(p_user_id uuid, p_role_type text)`
返回标准化的概览统计JSON格式。

**返回示例：**
```json
{
  "success": true,
  "data": {
    "totalTasks": 10,
    "inProgressTasks": 3,
    "completedTasks": 5,
    "waitTasks": 1,
    "pendingTasks": 1,
    "cancelledTasks": 0,
    "overdueTasks": 1,
    "completionRate": 50.00
  },
  "meta": {
    "userId": "用户ID",
    "roleType": "assignee",
    "timestamp": "2025-01-01T12:00:00Z"
  }
}
```

### 2. 分布统计API

#### `api_get_user_task_distribution(...)`
获取任务分布统计，可自定义包含的统计类型。

**参数：**
- `p_include_types`: 是否包含任务类型统计
- `p_include_priorities`: 是否包含优先级统计
- `p_include_statuses`: 是否包含状态分布统计

### 3. 综合统计API

#### `api_get_user_comprehensive_stats(p_user_id uuid, p_role_type text)`
获取用户的完整综合统计信息。

### 4. 趋势统计API

#### `api_get_user_task_trends(p_user_id uuid, p_role_type text, p_days integer)`
获取用户任务的趋势统计数据。

**参数：**
- `p_days`: 统计天数（1-365，默认30天）

## 使用示例

### 基本使用

```sql
-- 获取用户作为负责人的任务统计
select * from public.get_user_task_statistics('用户ID', 'assignee');

-- 获取用户作为创建者的任务统计
select * from public.get_user_task_statistics('用户ID', 'creator');

-- 获取优先级分布
select * from public.get_user_task_priority_statistics('用户ID', 'assignee');

-- 获取任务类型统计
select * from public.get_user_task_type_statistics('用户ID', 'assignee');

-- 获取状态分布
select * from public.get_user_task_status_distribution('用户ID', 'assignee');
```

### API使用

```sql
-- 获取概览统计
select public.api_get_user_task_overview('用户ID', 'assignee');

-- 获取分布统计
select public.api_get_user_task_distribution('用户ID', 'assignee', true, true, true);

-- 获取综合统计
select public.api_get_user_comprehensive_stats('用户ID', 'assignee');

-- 获取趋势统计（最近30天）
select public.api_get_user_task_trends('用户ID', 'assignee', 30);
```

## 测试数据

提供了完整的测试数据和验证查询，位于`task_statistics_test_data.sql`文件中。

测试数据包括：
- 测试用户和部门
- 各种状态和优先级的任务
- 任务执行明细记录
- 完整的测试查询语句

## 错误处理

所有API函数都包含错误处理机制：
- 参数验证
- 角色类型验证
- 异常捕获
- 标准化的错误返回格式

## 性能优化

- 使用适当的索引
- 避免全表扫描
- 使用窗口函数优化百分比计算
- 合理的查询计划

## 注意事项

1. 确保用户ID存在且有效
2. 角色类型只能是'assignee'或'creator'
3. 统计函数会自动处理NULL值
4. 百分比计算会四舍五入到2位小数
5. 逾期任务计算基于当前时间和截止日期