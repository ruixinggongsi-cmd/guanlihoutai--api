import Joi from 'joi';

// 登录验证（新表结构）
export const loginValidation = Joi.object({
  username: Joi.string().min(3).max(50).required()
    .messages({
      'string.empty': '用户名不能为空',
      'string.min': '用户名至少3个字符',
      'string.max': '用户名不能超过50个字符',
      'any.required': '用户名不能为空'
    }),
  password: Joi.string().min(6).max(128).required()
    .messages({
      'string.empty': '密码不能为空',
      'string.min': '密码至少6个字符',
      'string.max': '密码不能超过128个字符',
      'any.required': '密码不能为空'
    })
});


// 用户资料验证（新表结构）
export const profileValidation = Joi.object({
  username: Joi.string().min(3).max(50).optional()
    .messages({
      'string.min': '用户名至少3个字符',
      'string.max': '用户名不能超过50个字符'
    }),
  name: Joi.string().min(1).max(100).optional()
    .messages({
      'string.min': '姓名至少1个字符',
      'string.max': '姓名不能超过100个字符'
    }),
  email: Joi.string().email().max(255).optional()
    .messages({
      'string.email': '请输入有效的邮箱地址',
      'string.max': '邮箱不能超过255个字符'
    }),
  phone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional()
    .messages({
      'string.pattern.base': '请输入有效的手机号码'
    }),
  department: Joi.string().uuid().optional().allow(null)
    .messages({
      'string.uuid': '部门ID必须是有效的UUID'
    }),
  roles: Joi.string().uuid().optional().allow(null)
    .messages({
      'string.uuid': '角色ID必须是有效的UUID'
    }),
  status: Joi.boolean().optional()
    .messages({
      'boolean.base': '状态必须是布尔值'
    }),
  remarks: Joi.string().max(500).optional().allow('')
    .messages({
      'string.max': '备注不能超过500个字符'
    })
});

// 密码修改验证（新表结构）
export const passwordValidation = Joi.object({
  currentPassword: Joi.string().required()
    .messages({
      'string.empty': '当前密码不能为空',
      'any.required': '当前密码不能为空'
    }),
  newPassword: Joi.string().min(6).max(128).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.empty': '新密码不能为空',
      'string.min': '新密码至少6个字符',
      'string.max': '新密码不能超过128个字符',
      'string.pattern.base': '新密码必须包含至少一个小写字母、一个大写字母和一个数字',
      'any.required': '新密码不能为空'
    })
});

// 审批流程验证
export const approvalFlowValidation = Joi.object({
  name: Joi.string().min(1).max(100).required()
    .messages({
      'string.empty': 'Flow name is required',
      'string.max': 'Flow name cannot exceed 100 characters'
    }),
  description: Joi.string().max(500).optional().allow('')
    .messages({
      'string.max': 'Description cannot exceed 500 characters'
    }),
  type: Joi.string().valid('leave', 'expense', 'purchase', 'custom').required()
    .messages({
      'any.only': 'Type must be one of: leave, expense, purchase, custom'
    }),
  status: Joi.string().valid('active', 'inactive').default('active')
    .messages({
      'any.only': 'Status must be either "active" or "inactive"'
    }),
  nodes: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    type: Joi.string().valid('start', 'approval', 'condition', 'end').required(),
    assignee: Joi.string().optional(),
    conditions: Joi.array().optional()
  })).optional()
});



// 部门验证
export const departmentValidation = Joi.object({
  department_name: Joi.string().min(1).max(100).required()
    .messages({
      'string.empty': '部门名称不能为空',
      'string.min': '部门名称长度不能少于1个字符',
      'string.max': '部门名称长度不能超过100个字符',
      'any.required': '部门名称是必填项'
    }),
  parent_id: Joi.string().uuid().allow(null).optional(),
  remarks: Joi.string().max(500).allow('').optional()
    .messages({
      'string.max': '部门描述长度不能超过500个字符'
    }),
  status: Joi.string().valid('active', 'inactive').default('active')
    .messages({
      'any.only': '状态必须是active或inactive'
    })
});

// 通用ID验证
export const idValidation = Joi.object({
  id: Joi.string().uuid().required()
    .messages({
      'string.empty': 'ID不能为空',
      'string.guid': 'ID格式不正确',
      'any.required': 'ID是必填项'
    })
});

export default {
  loginValidation,
  profileValidation,
  passwordValidation,
  approvalFlowValidation,

  idValidation
};