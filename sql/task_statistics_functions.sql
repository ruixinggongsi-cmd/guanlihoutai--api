-- 任务统计函数
-- 用于统计用户的任务数量和相关指标

-- 函数：获取用户任务统计概览
-- 参数：用户ID（可以是assignee_id或creator_id）
-- 返回：任务总数（不含已取消的任务）、在执行数量、完成数量、等待执行数量
create or replace function public.get_user_task_statistics(
    p_user_id uuid,
    p_role_type text default 'assignee'  -- 'assignee' 或 'creator'
)
returns table (
    total_tasks bigint,
    in_progress_tasks bigint,
    completed_tasks bigint,
    wait_tasks bigint,
    pending_tasks bigint,
    cancelled_tasks bigint,
    overdue_tasks bigint
) 
language plpgsql
as $$
begin
    if p_role_type = 'assignee' then
        return query
        select 
            count(*) filter (where status != '4_cancelled') as total_tasks,
            count(*) filter (where status = '0_in_progress') as in_progress_tasks,
            count(*) filter (where status = '3_completed') as completed_tasks,
            count(*) filter (where status = '1_wait') as wait_tasks,
            count(*) filter (where status = '2_pending') as pending_tasks,
            count(*) filter (where status = '4_cancelled') as cancelled_tasks,
            count(*) filter (where status != '3_completed' and status != '4_cancelled' and due_date < now()) as overdue_tasks
        from public.user_tasks
        where assignee_id = p_user_id;
    elsif p_role_type = 'creator' then
        return query
        select 
            count(*) filter (where status != '4_cancelled') as total_tasks,
            count(*) filter (where status = '0_in_progress') as in_progress_tasks,
            count(*) filter (where status = '3_completed') as completed_tasks,
            count(*) filter (where status = '1_wait') as wait_tasks,
            count(*) filter (where status = '2_pending') as pending_tasks,
            count(*) filter (where status = '4_cancelled') as cancelled_tasks,
            count(*) filter (where status != '3_completed' and status != '4_cancelled' and due_date < now()) as overdue_tasks
        from public.user_tasks
        where creator_id = p_user_id;
    else
        raise exception 'Invalid role_type. Must be "assignee" or "creator"';
    end if;
end;
$$;

-- 函数：获取用户各优先级任务数量统计
-- 参数：用户ID和角色类型
-- 返回：各优先级的任务数量
create or replace function public.get_user_task_priority_statistics(
    p_user_id uuid,
    p_role_type text default 'assignee'
)
returns table (
    priority text,
    task_count bigint,
    percentage numeric
) 
language plpgsql
as $$
begin
    if p_role_type = 'assignee' then
        return query
        select 
            coalesce(t.priority, 'unknown') as priority,
            count(*) as task_count,
            round(count(*) * 100.0 / nullif(sum(count(*)) over (), 0), 2) as percentage
        from public.user_tasks t
        where t.assignee_id = p_user_id
        group by t.priority
        order by task_count desc;
    elsif p_role_type = 'creator' then
        return query
        select 
            coalesce(t.priority, 'unknown') as priority,
            count(*) as task_count,
            round(count(*) * 100.0 / nullif(sum(count(*)) over (), 0), 2) as percentage
        from public.user_tasks t
        where t.creator_id = p_user_id
        group by t.priority
        order by task_count desc;
    else
        raise exception 'Invalid role_type. Must be "assignee" or "creator"';
    end if;
end;
$$;
