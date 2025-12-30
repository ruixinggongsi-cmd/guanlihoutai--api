-- 任务统计函数测试数据
-- 用于验证和测试任务统计函数的正确性

-- 清除现有测试数据（谨慎使用）
-- delete from public.user_task_execution_details where task_id in (select id from public.user_tasks where task_name like '测试任务%');
-- delete from public.user_tasks where task_name like '测试任务%';

-- 创建测试用户（如果尚不存在）
insert into public.users (id, username, email, department_id, status, created_at, updated_at) 
values 
    ('550e8400-e29b-41d4-a716-446655440001', 'test_user1', 'test1@example.com', '550e8400-e29b-41d4-a716-446655440100', 'active', now(), now()),
    ('550e8400-e29b-41d4-a716-446655440002', 'test_user2', 'test2@example.com', '550e8400-e29b-41d4-a716-446655440100', 'active', now(), now())
on conflict (id) do nothing;

-- 创建测试部门（如果尚不存在）
insert into public.departments (id, name, code, parent_id, sort_order, status, created_at, updated_at)
values 
    ('550e8400-e29b-41d4-a716-446655440100', '测试部门', 'TEST', null, 1, 'active', now(), now())
on conflict (id) do nothing;

-- 插入测试任务数据
insert into public.user_tasks (
    id, task_name, task_type, task_description, priority, status,
    assignee_id, assignee_name, assignee_department_id,
    creator_id, creator_name,
    due_date, start_time, end_time, execution_progress,
    created_at, updated_at
) values 
-- 测试用户1的任务（作为负责人）
('550e8400-e29b-41d4-a716-446655440010', '测试任务-高优先级进行中', 'work_execution', '这是一个高优先级的测试任务', 'high', 'in_progress',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() + interval '7 days', now() - interval '2 days', null, 65,
 now() - interval '10 days', now() - interval '2 days'),

('550e8400-e29b-41d4-a716-446655440011', '测试任务-中等优先级等待', 'routine_task', '这是一个中等优先级的常规任务', 'medium', 'wait',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() + interval '14 days', null, null, 0,
 now() - interval '8 days', now() - interval '8 days'),

('550e8400-e29b-41d4-a716-446655440012', '测试任务-紧急优先级待处理', 'project_promotion', '这是一个紧急的项目推进任务', 'urgent', 'pending',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() + interval '3 days', null, null, 0,
 now() - interval '5 days', now() - interval '5 days'),

('550e8400-e29b-41d4-a716-446655440013', '测试任务-低优先级已完成', 'system_maintenance', '这是一个低优先级的系统维护任务', 'low', 'completed',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() - interval '1 day', now() - interval '5 days', now() - interval '2 days', 100,
 now() - interval '15 days', now() - interval '2 days'),

('550e8400-e29b-41d4-a716-446655440014', '测试任务-高优先级已逾期', 'data_analysis', '这是一个高优先级的数据分析任务', 'high', 'in_progress',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() - interval '2 days', now() - interval '8 days', null, 45,
 now() - interval '12 days', now() - interval '8 days'),

('550e8400-e29b-41d4-a716-446655440015', '测试任务-中等优先级已取消', 'team_coordination', '这是一个中等优先级的团队协调任务', 'medium', 'cancelled',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() + interval '10 days', null, null, 0,
 now() - interval '6 days', now() - interval '1 day'),

-- 测试用户2的任务（作为创建者）
('550e8400-e29b-41d4-a716-446655440020', '测试任务-用户2创建进行中', 'work_execution', '这是用户2创建的执行中任务', 'medium', 'in_progress',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() + interval '12 days', now() - interval '1 day', null, 30,
 now() - interval '4 days', now() - interval '1 day'),

('550e8400-e29b-41d4-a716-446655440021', '测试任务-用户2创建已完成', 'routine_task', '这是用户2创建的已完成任务', 'high', 'completed',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() - interval '3 days', now() - interval '6 days', now() - interval '3 days', 100,
 now() - interval '9 days', now() - interval '3 days'),

('550e8400-e29b-41d4-a716-446655440022', '测试任务-用户2创建等待中', 'project_promotion', '这是用户2创建的等待中任务', 'low', 'wait',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 '550e8400-e29b-41d4-a716-446655440002', 'test_user2',
 now() + interval '20 days', null, null, 0,
 now() - interval '3 days', now() - interval '3 days');

-- 插入测试任务执行明细数据
insert into public.user_task_execution_details (
    id, task_id, action_type, action_description,
    executor_id, executor_name, executor_department_id,
    execution_result, current_progress, execution_time,
    duration_seconds, created_at
) values 
-- 任务 550e8400-e29b-41d4-a716-446655440010 的执行记录
('550e8400-e29b-41d4-a716-446655440110', '550e8400-e29b-41d4-a716-446655440010', 'start', '开始执行高优先级任务',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 'success', 10, now() - interval '2 days', 3600, now() - interval '2 days'),

('550e8400-e29b-41d4-a716-446655440111', '550e8400-e29b-41d4-a716-446655440010', 'progress', '任务进展更新',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 'success', 40, now() - interval '1 day', 7200, now() - interval '1 day'),

('550e8400-e29b-41d4-a716-446655440112', '550e8400-e29b-41d4-a716-446655440010', 'progress', '任务进展更新',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 'success', 65, now() - interval '6 hours', 5400, now() - interval '6 hours'),

-- 任务 550e8400-e29b-41d4-a716-446655440013 的完成记录
('550e8400-e29b-41d4-a716-446655440113', '550e8400-e29b-41d4-a716-446655440013', 'complete', '低优先级任务完成',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 'success', 100, now() - interval '2 days', 10800, now() - interval '2 days'),

-- 任务 550e8400-e29b-41d4-a716-446655440021 的完成记录
('550e8400-e29b-41d4-a716-446655440114', '550e8400-e29b-41d4-a716-446655440021', 'complete', '用户2创建的任务完成',
 '550e8400-e29b-41d4-a716-446655440001', 'test_user1', '550e8400-e29b-41d4-a716-446655440100',
 'success', 100, now() - interval '3 days', 14400, now() - interval '3 days');

-- 测试查询语句

-- 测试1：验证基本统计函数
select '=== 测试用户1作为负责人的基本统计 ===' as test_name;
select * from public.get_user_task_statistics('550e8400-e29b-41d4-a716-446655440001', 'assignee');

select '=== 测试用户2作为创建者的基本统计 ===' as test_name;
select * from public.get_user_task_statistics('550e8400-e29b-41d4-a716-446655440002', 'creator');

-- 验证任务总数不含已取消的任务
select '验证任务总数统计（应不含已取消的）' as description,
       (select total_tasks from public.get_user_task_statistics('550e8400-e29b-41d4-a716-446655440001', 'assignee')) as total_tasks_excluding_cancelled,
       (select count(*) from public.user_tasks where assignee_id = '550e8400-e29b-41d4-a716-446655440001' and status != 'cancelled') as manual_count_excluding_cancelled,
       (select count(*) from public.user_tasks where assignee_id = '550e8400-e29b-41d4-a716-446655440001') as total_including_cancelled;

-- 测试2：验证优先级统计
select '=== 测试用户1优先级分布 ===' as test_name;
select * from public.get_user_task_priority_statistics('550e8400-e29b-41d4-a716-446655440001', 'assignee');

-- 测试3：验证任务类型统计
select '=== 测试用户1任务类型分布 ===' as test_name;
select * from public.get_user_task_type_statistics('550e8400-e29b-41d4-a716-446655440001', 'assignee');

-- 测试4：验证状态分布统计
select '=== 测试用户1状态分布 ===' as test_name;
select * from public.get_user_task_status_distribution('550e8400-e29b-41d4-a716-446655440001', 'assignee');

-- 测试5：验证综合统计
select '=== 测试用户1综合统计 ===' as test_name;
select public.get_user_comprehensive_task_statistics('550e8400-e29b-41d4-a716-446655440001', 'assignee');

-- 测试6：验证API函数
select '=== 测试API概览统计 ===' as test_name;
select public.api_get_user_task_overview('550e8400-e29b-41d4-a716-446655440001', 'assignee');

select '=== 测试API分布统计 ===' as test_name;
select public.api_get_user_task_distribution('550e8400-e29b-41d4-a716-446655440001', 'assignee', true, true, true);

select '=== 测试API综合统计 ===' as test_name;
select public.api_get_user_comprehensive_stats('550e8400-e29b-41d4-a716-446655440001', 'assignee');

-- 测试7：验证趋势统计
select '=== 测试用户1任务趋势（最近30天） ===' as test_name;
select public.api_get_user_task_trends('550e8400-e29b-41d4-a716-446655440001', 'assignee', 30);