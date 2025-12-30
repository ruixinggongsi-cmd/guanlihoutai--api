# 任务中心表结构设计文档

## 概述

任务中心是一个统一的任务管理平台，支持多种业务类型的任务创建、分配、执行和跟踪。本设计基于现有的费用申请、设备申请等审批流程，提供通用的任务管理能力。

## 表结构说明

### 1. 任务表 (tasks)

主要字段说明：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | uuid | 主键，自动生成 |
| task_name | text | 任务名称 |
| task_type | text | 任务类型 (expense_approval, equipment_approval, system_maintenance等) |
| priority | text | 优先级 (high, medium, low) |
| status | text | 任务状态 (pending, in_progress, completed, cancelled, failed) |
| related_business_id | uuid | 关联业务ID |
| related_business_type | text | 关联业务类型 |
| assignee_id | uuid | 任务负责人ID |
| creator_id | uuid | 创建者ID |
| due_date | timestamp | 截止日期 |
| start_time | timestamp | 开始时间 |
| end_time | timestamp | 结束时间 |
| estimated_duration_seconds | integer | 预计耗时(秒) |
| actual_duration_seconds | integer | 实际耗时(秒) |

### 2. 任务执行明细表 (task_execution_details)

记录任务的详细执行过程，包括状态变更、评论、转交等操作。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | uuid | 主键，自动生成 |
| task_id | uuid | 关联任务ID |
| action_type | text | 操作类型 (start, pause, resume, complete, cancel, fail, comment, transfer) |
| executor_id | uuid | 执行人ID |
| execution_result | text | 执行结果 (success, failure, partial_success) |
| execution_time | timestamp | 执行时间 |
| duration_seconds | integer | 本次执行耗时(秒) |
| attachment_urls | text[] | 附件URL数组 |

## 设计特点

### 1. 通用性设计
- 支持多种业务类型的任务管理
- 灵活的关联机制，可关联任何业务实体
- 可扩展的状态和优先级体系

### 2. 审批流程集成
- 与现有的费用申请、设备申请审批流程无缝集成
- 支持自动任务创建和状态同步
- 提供统一的任务查询和统计接口

### 3. 性能优化
- 合理的索引设计，支持多维度查询
- 视图和函数封装复杂查询逻辑
- 支持分页和条件筛选

## 使用示例

### 1. 创建任务
```sql
-- 创建费用审批任务
SELECT public.create_task(
  '审批费用申请-差旅费',
  'expense_approval',
  '需要审批张三的差旅费用申请，金额：¥5,000',
  'high',
  '550e8400-e29b-41d4-a716-446655440001', -- 费用申请ID
  'expense_application',
  '660e8400-e29b-41d4-a716-446655440002', -- 负责人ID
  '李四',
  '770e8400-e29b-41d4-a716-446655440003', -- 负责人部门ID
  '880e8400-e29b-41d4-a716-446655440004', -- 创建者ID
  '王五',
  now() + interval '3 days', -- 3天内完成
  3600 -- 预计1小时完成
);
```

### 2. 更新任务状态
```sql
-- 开始执行任务
SELECT public.update_task_status(
  '990e8400-e29b-41d4-a716-446655440005', -- 任务ID
  'in_progress',
  '660e8400-e29b-41d4-a716-446655440002', -- 执行人ID
  '李四',
  '770e8400-e29b-41d4-a716-446655440003',
  '开始审批费用申请'
);

-- 完成任务
SELECT public.update_task_status(
  '990e8400-e29b-41d4-a716-446655440005',
  'completed',
  '660e8400-e29b-41d4-a716-446655440002',
  '李四',
  '770e8400-e29b-41d4-a716-446655440003',
  '费用申请已通过审批'
);
```

### 3. 查询任务统计
```sql
-- 获取用户任务统计
SELECT * FROM public.get_user_task_statistics('660e8400-e29b-41d4-a716-446655440002');

-- 查看我的任务
SELECT * FROM public.my_tasks_view WHERE assignee_id = '660e8400-e29b-41d4-a716-446655440002';

-- 查看任务执行历史
SELECT * FROM public.task_execution_history WHERE task_id = '990e8400-e29b-41d4-a716-446655440005' ORDER BY execution_time DESC;
```

## 集成建议

### 1. 与现有审批系统集成
- 在费用申请、设备申请创建时自动生成对应任务
- 任务状态变更时同步更新审批节点状态
- 提供统一的任务提醒和通知机制

### 2. 前端界面设计
- 任务列表页面：支持按状态、优先级、负责人筛选
- 任务详情页面：显示执行历史和操作记录
- 任务统计页面：个人和团队的任务完成情况统计

### 3. 权限控制
- 基于现有用户角色体系控制任务访问权限
- 任务负责人可以更新自己负责任务的状态
- 管理员可以查看和管理所有任务

## 扩展性考虑

### 1. 任务类型扩展
- 支持自定义任务类型
- 不同类型任务可以有不同的字段和流程
- 提供任务模板功能

### 2. 工作流集成
- 支持复杂的工作流定义
- 条件分支和并行处理
- 自动化规则和触发器

### 3. 通知机制
- 任务状态变更通知
- 即将到期提醒
- 逾期警告和升级处理