-- 用户费用数据视图
-- 包含用户姓名、所属部门名称、费用主类别名称、子类别名称、费用金额、申请日期

CREATE OR REPLACE VIEW user_expense_data_view AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    u.username as user_username,
    d.department_name,
    parent_cat.category_name as main_category_name,
    child_cat.category_name as sub_category_name,
    ea.amount as expense_amount,
    ea.date as application_date,
    ea.status as application_status,
    ea.description as expense_description,
    ea.created_at as created_time,
    ea.name as expense_name
FROM expense_applications ea
INNER JOIN users u ON ea.applicant_id = u.id
LEFT JOIN department d ON u.department = d.id
LEFT JOIN expense_categories child_cat ON ea.sub_category_id = child_cat.id
LEFT JOIN expense_categories parent_cat ON ea.main_category_id = parent_cat.id
where ea.status <> 'approved'
ORDER BY ea.date DESC, u.name ASC;

-- 添加视图注释
COMMENT ON VIEW user_expense_data_view IS '用户费用数据视图 - 展示用户费用申请的完整信息，包含用户、部门、分类等关联数据';
COMMENT ON COLUMN user_expense_data_view.user_id IS '用户ID';
COMMENT ON COLUMN user_expense_data_view.user_name IS '用户姓名';
COMMENT ON COLUMN user_expense_data_view.user_username IS '用户登录名';
COMMENT ON COLUMN user_expense_data_view.department_name IS '所属部门名称';
COMMENT ON COLUMN user_expense_data_view.main_category_name IS '费用主类别名称';
COMMENT ON COLUMN user_expense_data_view.sub_category_name IS '费用子类别名称';
COMMENT ON COLUMN user_expense_data_view.expense_amount IS '费用金额';
COMMENT ON COLUMN user_expense_data_view.application_date IS '申请日期';
COMMENT ON COLUMN user_expense_data_view.application_status IS '申请状态';
COMMENT ON COLUMN user_expense_data_view.expense_description IS '费用描述';
COMMENT ON COLUMN user_expense_data_view.created_time IS '创建时间';
COMMENT ON COLUMN user_expense_data_view.expense_name IS '费用名称';