-- 用户设备数据视图（仅审批通过数据）
-- 包含用户姓名、所属部门名称、设备主类别名称、子类别名称、数量、申请日期
-- 只查询状态为'approved'的审批通过数据

CREATE OR REPLACE VIEW user_equipment_approved_view AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    u.username as user_username,
    d.department_name,
    parent_cat.category_name as main_category_name,
    child_cat.category_name as sub_category_name,
    ea.quantity as equipment_quantity,
    ea.application_date,
    ea.name as equipment_name,
    ea.description as equipment_description,
    ea.created_at as created_time,
    ea.status as application_status
FROM equipment_applications ea
INNER JOIN users u ON ea.applicant_id = u.id
LEFT JOIN department d ON u.department = d.id
LEFT JOIN equipment_categories child_cat ON ea.sub_category_id = child_cat.id
LEFT JOIN equipment_categories parent_cat ON ea.main_category_id = parent_cat.id
WHERE ea.status = 'approved'
ORDER BY ea.application_date DESC, u.name ASC;

-- 添加视图注释
COMMENT ON VIEW user_equipment_approved_view IS '用户设备数据视图（仅审批通过）- 展示用户设备申请的完整信息，只包含状态为approved的数据';
COMMENT ON COLUMN user_equipment_approved_view.user_id IS '用户ID';
COMMENT ON COLUMN user_equipment_approved_view.user_name IS '用户姓名';
COMMENT ON COLUMN user_equipment_approved_view.user_username IS '用户登录名';
COMMENT ON COLUMN user_equipment_approved_view.department_name IS '所属部门名称';
COMMENT ON COLUMN user_equipment_approved_view.main_category_name IS '设备主类别名称';
COMMENT ON COLUMN user_equipment_approved_view.sub_category_name IS '设备子类别名称';
COMMENT ON COLUMN user_equipment_approved_view.equipment_quantity IS '设备数量';
COMMENT ON COLUMN user_equipment_approved_view.application_date IS '申请日期';
COMMENT ON COLUMN user_equipment_approved_view.equipment_name IS '设备名称';
COMMENT ON COLUMN user_equipment_approved_view.equipment_description IS '设备描述';
COMMENT ON COLUMN user_equipment_approved_view.created_time IS '创建时间';
COMMENT ON COLUMN user_equipment_approved_view.application_status IS '申请状态';