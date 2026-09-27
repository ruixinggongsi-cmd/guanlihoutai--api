/**
 * 联合付款元数据：写入审批节点 attachments，无需改表结构
 * attachments 里增加一项：{ type: 'joint_payment_meta', ... }
 */

export const JOINT_PAYMENT_META_TYPE = 'joint_payment_meta';

export function buildJointPaymentMeta({
  id,
  expenseIds = [],
  totalAmount = 0,
  count = 0,
  paymentMethod = '',
  accountType = '',
  payeeNames = []
}) {
  return {
    type: JOINT_PAYMENT_META_TYPE,
    id: id || null,
    expenseIds: [...new Set((expenseIds || []).filter(Boolean))],
    totalAmount: Number(totalAmount) || 0,
    count: Number(count) || expenseIds.length || 0,
    paymentMethod: paymentMethod || '',
    accountType: accountType || '',
    payeeNames: payeeNames || [],
    createdAt: new Date().toISOString()
  };
}

export function parseAttachmentsField(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function extractJointPaymentMetaFromAttachments(raw) {
  const list = parseAttachmentsField(raw);
  return list.find((item) => item && item.type === JOINT_PAYMENT_META_TYPE) || null;
}

export function extractJointPaymentMetaFromComment(comment = '') {
  const text = String(comment || '');
  const match = text.match(/\[JOINT_PAYMENT\](\{[\s\S]*?\})(?:\n|$)/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || !Array.isArray(parsed.expenseIds)) return null;
    return {
      type: JOINT_PAYMENT_META_TYPE,
      ...parsed
    };
  } catch {
    return null;
  }
}

export function extractJointPaymentMetaFromNode(node) {
  if (!node) return null;
  return (
    extractJointPaymentMetaFromAttachments(node.attachments) ||
    extractJointPaymentMetaFromComment(node.comment)
  );
}

export function buildJointPaymentComment(meta, humanComment = '') {
  const payload = {
    id: meta.id,
    expenseIds: meta.expenseIds,
    totalAmount: meta.totalAmount,
    count: meta.count,
    paymentMethod: meta.paymentMethod,
    accountType: meta.accountType,
    payeeNames: meta.payeeNames || []
  };
  const marker = `[JOINT_PAYMENT]${JSON.stringify(payload)}`;
  const base = humanComment?.trim()
    ? humanComment.trim()
    : `联合付款确认：${meta.paymentMethod || '-'} / ${meta.accountType || '无账号'}，共 ${meta.count} 笔，合计 ¥${Number(meta.totalAmount || 0).toFixed(2)}`;
  return `${marker}\n${base}`;
}

export function stripJointPaymentMarker(comment = '') {
  return String(comment || '')
    .replace(/\[JOINT_PAYMENT\]\{[\s\S]*?\}(?:\n)?/, '')
    .trim();
}
