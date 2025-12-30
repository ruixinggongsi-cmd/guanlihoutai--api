CREATE OR REPLACE VIEW employee_application_statistics AS
WITH expense_stats AS (
    -- 费用申请统计
    SELECT 
        ea.applicant_id,
        -- 已申请总额（所有状态）
        COALESCE(SUM(ea.amount), 0) as total_expense_amount,
        -- 待审批金额（pending状态）
        COALESCE(SUM(CASE WHEN ea.status = 'pending' THEN ea.amount ELSE 0 END), 0) as pending_expense_amount,
        -- 已审批金额（approved状态）
        COALESCE(SUM(CASE WHEN ea.status = 'approved' THEN ea.amount ELSE 0 END), 0) as approved_expense_amount,
        -- 已拒绝金额（rejected状态）
        COALESCE(SUM(CASE WHEN ea.status = 'rejected' THEN ea.amount ELSE 0 END), 0) as rejected_expense_amount,
        -- 费用申请总数
        COUNT(*) as total_expense_count,
        -- 待审批费用数量
        COUNT(CASE WHEN ea.status = 'pending' THEN 1 END) as pending_expense_count,
        -- 最早费用申请日期
        MIN(ea.date) as earliest_expense_date,
        -- 最晚费用申请日期
        MAX(ea.date) as latest_expense_date
    FROM expense_applications ea
    WHERE ea.applicant_id IS NOT NULL
    GROUP BY ea.applicant_id
),
equipment_stats AS (
    -- 设备申请统计
    SELECT 
        eqa.applicant_id,
        -- 已申请设备总数（所有状态）
        COALESCE(SUM(eqa.quantity), 0) as total_equipment_quantity,
        -- 待审批设备数量（pending状态）
        COALESCE(SUM(CASE WHEN eqa.status = 'pending' THEN eqa.quantity ELSE 0 END), 0) as pending_equipment_quantity,
        -- 已审批设备数量（approved状态）
        COALESCE(SUM(CASE WHEN eqa.status = 'approved' THEN eqa.quantity ELSE 0 END), 0) as approved_equipment_quantity,
        -- 已拒绝设备数量（rejected状态）
        COALESCE(SUM(CASE WHEN eqa.status = 'rejected' THEN eqa.quantity ELSE 0 END), 0) as rejected_equipment_quantity,
        -- 设备申请记录数
        COUNT(*) as total_equipment_count,
        -- 待审批设备申请数量
        COUNT(CASE WHEN eqa.status = 'pending' THEN 1 END) as pending_equipment_count,
        -- 最早设备申请日期
        MIN(eqa.application_date) as earliest_equipment_date,
        -- 最晚设备申请日期
        MAX(eqa.application_date) as latest_equipment_date
    FROM equipment_applications eqa
    WHERE eqa.applicant_id IS NOT NULL
    GROUP BY eqa.applicant_id, eqa.applicant_name, eqa.applicant_department_id
),
current_pending_stats AS (
    -- 当前待审批中的申请（审批中状态）
    SELECT 
        ea.applicant_id,
        COUNT(*) as approving_expense_count,
        COALESCE(SUM(ea.amount), 0) as approving_expense_amount
    FROM expense_applications ea
    WHERE ea.status = 'approving'
    GROUP BY ea.applicant_id
),
equipment_approving_stats AS (
    -- 当前审批中的设备申请
    SELECT 
        eqa.applicant_id,
        COUNT(*) as approving_equipment_count,
        COALESCE(SUM(eqa.quantity), 0) as approving_equipment_quantity
    FROM equipment_applications eqa
    WHERE eqa.status = 'approving'
    GROUP BY eqa.applicant_id
)
-- 最终统计视图
SELECT 
    COALESCE(es.applicant_id, eqs.applicant_id) as applicant_id,
    -- 费用统计
    COALESCE(es.total_expense_amount, 0) as total_expense_amount,
    COALESCE(es.pending_expense_amount, 0) as pending_expense_amount,
    COALESCE(es.approved_expense_amount, 0) as approved_expense_amount,
    COALESCE(es.rejected_expense_amount, 0) as rejected_expense_amount,
    COALESCE(es.total_expense_count, 0) as total_expense_count,
    COALESCE(es.pending_expense_count, 0) as pending_expense_count,
    COALESCE(cpes.approving_expense_count, 0) as approving_expense_count,
    COALESCE(cpes.approving_expense_amount, 0) as approving_expense_amount,
    -- 设备统计（仅数量，不包含金额估值）
    COALESCE(eqs.total_equipment_quantity, 0) as total_equipment_quantity,
    COALESCE(eqs.pending_equipment_quantity, 0) as pending_equipment_quantity,
    COALESCE(eqs.approved_equipment_quantity, 0) as approved_equipment_quantity,
    COALESCE(eqs.rejected_equipment_quantity, 0) as rejected_equipment_quantity,
    COALESCE(eqs.total_equipment_count, 0) as total_equipment_count,
    COALESCE(eqs.pending_equipment_count, 0) as pending_equipment_count,
    COALESCE(eas.approving_equipment_count, 0) as approving_equipment_count,
    COALESCE(eas.approving_equipment_quantity, 0) as approving_equipment_quantity,
    -- 综合统计（仅费用金额，不包含设备估值）
    COALESCE(es.total_expense_amount, 0) as total_application_value, -- 仅费用申请总额
    COALESCE(es.pending_expense_amount, 0) as pending_application_value, -- 仅待审批费用金额
    -- 日期信息
    LEAST(
        COALESCE(es.earliest_expense_date, '9999-12-31'::date),
        COALESCE(eqs.earliest_equipment_date, '9999-12-31'::date)
    ) as earliest_application_date,
    GREATEST(
        COALESCE(es.latest_expense_date, '1900-01-01'::date),
        COALESCE(eqs.latest_equipment_date, '1900-01-01'::date)
    ) as latest_application_date,
    -- 详细信息（JSON格式）
    JSONB_BUILD_OBJECT(
        'expense', CASE WHEN es.applicant_id IS NOT NULL THEN JSONB_BUILD_OBJECT(
            'total_amount', es.total_expense_amount,
            'pending_amount', es.pending_expense_amount,
            'approved_amount', es.approved_expense_amount,
            'rejected_amount', es.rejected_expense_amount,
            'total_count', es.total_expense_count,
            'pending_count', es.pending_expense_count,
            'approving_count', COALESCE(cpes.approving_expense_count, 0),
            'approving_amount', COALESCE(cpes.approving_expense_amount, 0)
        ) ELSE NULL END,
        'equipment', CASE WHEN eqs.applicant_id IS NOT NULL THEN JSONB_BUILD_OBJECT(
            'total_quantity', eqs.total_equipment_quantity,
            'pending_quantity', eqs.pending_equipment_quantity,
            'approved_quantity', eqs.approved_equipment_quantity,
            'rejected_quantity', eqs.rejected_equipment_quantity,
            'total_count', eqs.total_equipment_count,
            'pending_count', eqs.pending_equipment_count,
            'approving_count', COALESCE(eas.approving_equipment_count, 0),
            'approving_quantity', COALESCE(eas.approving_equipment_quantity, 0)
        ) ELSE NULL END
    ) as application_details
FROM expense_stats es
FULL OUTER JOIN equipment_stats eqs ON es.applicant_id = eqs.applicant_id
LEFT JOIN current_pending_stats cpes ON COALESCE(es.applicant_id, eqs.applicant_id) = cpes.applicant_id
LEFT JOIN equipment_approving_stats eas ON COALESCE(es.applicant_id, eqs.applicant_id) = eas.applicant_id
ORDER BY total_application_value DESC;

-- 添加注释
COMMENT ON VIEW employee_application_statistics IS '员工申请统计视图 - 统计每个员工的费用和设备申请情况';
COMMENT ON COLUMN employee_application_statistics.applicant_id IS '申请人ID';
COMMENT ON COLUMN employee_application_statistics.total_expense_amount IS '费用申请总金额';
COMMENT ON COLUMN employee_application_statistics.pending_expense_amount IS '待审批费用金额';
COMMENT ON COLUMN employee_application_statistics.approved_expense_amount IS '已审批费用金额';
COMMENT ON COLUMN employee_application_statistics.rejected_expense_amount IS '已拒绝费用金额';
COMMENT ON COLUMN employee_application_statistics.total_expense_count IS '费用申请总数量';
COMMENT ON COLUMN employee_application_statistics.pending_expense_count IS '待审批费用数量';
COMMENT ON COLUMN employee_application_statistics.approving_expense_count IS '审批中费用数量';
COMMENT ON COLUMN employee_application_statistics.approving_expense_amount IS '审批中费用金额';
COMMENT ON COLUMN employee_application_statistics.total_equipment_quantity IS '设备申请总数量';
COMMENT ON COLUMN employee_application_statistics.pending_equipment_quantity IS '待审批设备数量';
COMMENT ON COLUMN employee_application_statistics.approved_equipment_quantity IS '已审批设备数量';
COMMENT ON COLUMN employee_application_statistics.rejected_equipment_quantity IS '已拒绝设备数量';
COMMENT ON COLUMN employee_application_statistics.total_equipment_count IS '设备申请记录数';
COMMENT ON COLUMN employee_application_statistics.pending_equipment_count IS '待审批设备申请数';
COMMENT ON COLUMN employee_application_statistics.approving_equipment_count IS '审批中设备申请数';
COMMENT ON COLUMN employee_application_statistics.approving_equipment_quantity IS '审批中设备数量';
COMMENT ON COLUMN employee_application_statistics.total_application_value IS '费用申请总额（不包含设备）';
COMMENT ON COLUMN employee_application_statistics.pending_application_value IS '待审批费用金额（不包含设备）';
COMMENT ON COLUMN employee_application_statistics.earliest_application_date IS '最早申请日期';
COMMENT ON COLUMN employee_application_statistics.latest_application_date IS '最晚申请日期';
COMMENT ON COLUMN employee_application_statistics.application_details IS '申请详细信息（JSON）';