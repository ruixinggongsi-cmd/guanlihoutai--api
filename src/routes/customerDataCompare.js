import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient, select, count, insert } from '../config/supabase.js';
import { verifySignatureAndToken } from '../middleware/combinedAuth.js';
import { isSuperAdmin } from '../utils/superAdmin.js';
import { hasFunctionPermission } from '../utils/rolePermission.js';

const router = express.Router();

/** 状态变更历史表受 RLS 限制，读写需使用 service key */
let serviceSupabase = null;
const getServiceSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase配置错误：缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY');
  }
  if (!serviceSupabase) {
    serviceSupabase = createClient(supabaseUrl, serviceKey);
  }
  return serviceSupabase;
};

const CUSTOMER_STATUS_MAP = {
  '数据': 'active',
  '意向客户': 'inactive',
  '进群客户': 'vip',
  active: 'active',
  inactive: 'inactive',
  vip: 'vip'
};

const ALL_COMPARE_STATUSES = ['active', 'inactive', 'vip'];
const CUSTOMER_STATUS_LABEL_MAP = {
  active: '数据',
  inactive: '意向客户',
  vip: '进群客户'
};

/** 将前端传入的对比范围标准化为数据库 status 值 */
function normalizeCompareStatuses(statuses) {
  if (!statuses || !Array.isArray(statuses) || statuses.length === 0) {
    return [...ALL_COMPARE_STATUSES];
  }
  const normalized = [...new Set(
    statuses
      .map(s => CUSTOMER_STATUS_MAP[s] || s)
      .filter(s => ALL_COMPARE_STATUSES.includes(s))
  )];
  return normalized.length > 0 ? normalized : [...ALL_COMPARE_STATUSES];
}

function isCustomerInCompareScope(customer, allowedStatuses) {
  return allowedStatuses.includes(customer.status);
}

function formatPhoneNumber(phoneValue) {
  if (!phoneValue && phoneValue !== 0) return '';

  let phoneStr = String(phoneValue);

  if (phoneStr.includes('e+') || phoneStr.includes('E+')) {
    const asNumber = Number(phoneStr);
    if (Number.isFinite(asNumber)) {
      phoneStr = asNumber.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 });
    } else {
      phoneStr = parseFloat(phoneStr).toString();
    }
  }

  phoneStr = phoneStr.replace(/\D/g, '');
  phoneStr = phoneStr.replace(/^0+/, '') || '0';

  return phoneStr.trim();
}

function buildPhoneLookupVariants(phoneArray) {
  const phoneVariantsSet = new Set();

  phoneArray.forEach(phone => {
    if (!phone) return;
    phoneVariantsSet.add(phone);
    if (!phone.startsWith('0')) {
      phoneVariantsSet.add(`0${phone}`);
    }
    if (phone.startsWith('0') && phone.length > 1) {
      phoneVariantsSet.add(phone.substring(1));
    }
    // 10/11 位号码互通（常见少写/多写首位 1）
    if (/^\d{10}$/.test(phone)) {
      phoneVariantsSet.add(`1${phone}`);
    }
    if (/^1\d{10}$/.test(phone)) {
      phoneVariantsSet.add(phone.slice(1));
    }
  });

  return Array.from(phoneVariantsSet);
}

function findMatchedCustomersByPhoneVariants(existingCustomersMap, phone) {
  if (!phone) return [];

  const variants = buildPhoneLookupVariants([phone]);
  const merged = [];
  const seenCustomerIds = new Set();

  variants.forEach(variantPhone => {
    const customers = existingCustomersMap.get(variantPhone) || [];
    customers.forEach(customer => {
      const dedupeKey = customer.id || `${customer.phone || ''}_${customer.status || ''}`;
      if (!seenCustomerIds.has(dedupeKey)) {
        seenCustomerIds.add(dedupeKey);
        merged.push(customer);
      }
    });
  });

  return merged;
}

function isPhoneExistingByVariants(existingPhones, phone) {
  if (!phone) return false;
  const variants = buildPhoneLookupVariants([phone]);
  return variants.some(variant => existingPhones.has(variant));
}

function addCustomerToPhoneMap(existingCustomersMap, customer, formatPhone = formatPhoneNumber) {
  const phoneKey = formatPhone(customer.phone);
  if (!phoneKey) return;

  if (!existingCustomersMap.has(phoneKey)) {
    existingCustomersMap.set(phoneKey, []);
  }
  existingCustomersMap.get(phoneKey).push(customer);
}

const CUSTOMER_COMPARE_SELECT = 'id, name, phone, email, company, status, source, created_at, created_by';
const COMPARE_RPC_PHONE_BATCH_SIZE = 3000;
const COMPARE_RPC_TIMEOUT_MS = 15000;
const COMPARE_FALLBACK_PHONE_BATCH_SIZE = 1000;
const COMPARE_FALLBACK_CONCURRENCY = 6;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function runCompareRpcBatch(client, phoneBatch, allowedStatuses) {
  const rpcPromise = client.rpc('compare_customer_phones', {
    phone_list: phoneBatch,
    status_list: allowedStatuses
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('compare_customer_phones RPC 超时')), COMPARE_RPC_TIMEOUT_MS);
  });

  try {
    const { data: phoneMatches, error } = await Promise.race([rpcPromise, timeoutPromise]);
    if (error) {
      throw error;
    }
    return phoneMatches || [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function lookupExistingCustomersByPhoneVariants(client, phoneArray, allowedStatuses, existingCustomersMap) {
  const phoneVariantsArray = buildPhoneLookupVariants(phoneArray);
  const variantBatches = chunkArray(phoneVariantsArray, COMPARE_FALLBACK_PHONE_BATCH_SIZE);
  console.log(
    `按号码变体分 ${variantBatches.length} 批查询（${phoneVariantsArray.length} 个变体，${phoneArray.length} 个唯一号码，并发 ${COMPARE_FALLBACK_CONCURRENCY}）...`
  );

  for (let i = 0; i < variantBatches.length; i += COMPARE_FALLBACK_CONCURRENCY) {
    const concurrentBatches = variantBatches.slice(i, i + COMPARE_FALLBACK_CONCURRENCY);
    await Promise.all(concurrentBatches.map(async (phoneBatch, offset) => {
      const batchNum = i + offset + 1;
      if (phoneBatch.length === 0) return;

      try {
        const { data: batchMatches, error: batchError } = await client
          .from('customers')
          .select(CUSTOMER_COMPARE_SELECT)
          .in('phone', phoneBatch)
          .in('status', allowedStatuses);

        if (batchError) {
          console.error(`✗ 第 ${batchNum} 批号码查询失败:`, batchError.message);
          return;
        }

        batchMatches?.forEach(customer => {
          addCustomerToPhoneMap(existingCustomersMap, customer);
        });
      } catch (error) {
        console.error(`✗ 第 ${batchNum} 批号码查询异常:`, error.message);
      }
    }));
  }
}

async function lookupExistingCustomersByPhones(client, phoneArray, allowedStatuses) {
  const existingCustomersMap = new Map();

  if (phoneArray.length === 0) {
    return existingCustomersMap;
  }

  const rpcBatches = chunkArray(phoneArray, COMPARE_RPC_PHONE_BATCH_SIZE);
  let rpcAvailable = true;

  for (let i = 0; i < rpcBatches.length; i++) {
    if (!rpcAvailable) break;

    const batch = rpcBatches[i];
    const batchNum = i + 1;
    const batchStart = Date.now();

    try {
      const phoneMatches = await runCompareRpcBatch(client, batch, allowedStatuses);

      phoneMatches.forEach(customer => {
        if (isCustomerInCompareScope(customer, allowedStatuses)) {
          addCustomerToPhoneMap(existingCustomersMap, customer);
        }
      });

      console.log(
        `✓ compare_customer_phones 第 ${batchNum}/${rpcBatches.length} 批完成，` +
        `${batch.length} 个号码，命中 ${phoneMatches.length} 条，耗时 ${((Date.now() - batchStart) / 1000).toFixed(2)}s`
      );
    } catch (rpcError) {
      rpcAvailable = false;
      console.warn(`compare_customer_phones 第 ${batchNum} 批失败，改用按号码查询:`, rpcError.message);
      console.warn('提示：在 Supabase 重新执行 manageapi/sql/create_customer_compare_function.sql（索引友好版本）');
      existingCustomersMap.clear();
    }
  }

  if (rpcAvailable) {
    // 即使 RPC 成功，也对未命中的号码补查一次，避免线上 RPC 函数未更新导致漏匹配
    const unmatchedPhones = phoneArray.filter(phone => (
      findMatchedCustomersByPhoneVariants(existingCustomersMap, phone).length === 0
    ));

    if (unmatchedPhones.length > 0) {
      console.warn(
        `RPC 结果存在 ${unmatchedPhones.length}/${phoneArray.length} 个未命中号码，追加按号码变体补查`
      );
      await lookupExistingCustomersByPhoneVariants(client, unmatchedPhones, allowedStatuses, existingCustomersMap);
    }
    return existingCustomersMap;
  }

  await lookupExistingCustomersByPhoneVariants(client, phoneArray, allowedStatuses, existingCustomersMap);
  return existingCustomersMap;
}

const DATABASE_STATS_CACHE_TTL_MS = 5 * 60 * 1000;
let databaseStatsCache = { data: null, expiresAt: 0 };

async function countCustomersByStatusEstimated(status) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase 配置缺失');
  }

  const url = `${supabaseUrl}/rest/v1/customers?select=id&status=eq.${encodeURIComponent(status)}`;
  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'count=estimated'
    }
  });

  if (!response.ok) {
    throw new Error(`估算 ${status} 状态客户数失败`);
  }

  const contentRange = response.headers.get('content-range');
  const totalPart = contentRange?.split('/')?.[1];
  const total = totalPart ? parseInt(totalPart, 10) : NaN;
  if (!Number.isFinite(total)) {
    throw new Error(`无法解析 ${status} 状态客户数`);
  }

  return total;
}

async function fetchCustomerStatusCounts(client) {
  try {
    const { data, error } = await client.rpc('get_customer_status_counts');
    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0];
      const statusCounts = {
        active: Number(row.active_count) || 0,
        inactive: Number(row.inactive_count) || 0,
        vip: Number(row.vip_count) || 0
      };
      const totalCount = Number(row.total_count) || Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
      return { statusCounts, totalCount, approximate: false };
    }
    if (error) {
      console.warn('get_customer_status_counts RPC 失败:', error.message);
    }
  } catch (rpcError) {
    console.warn('get_customer_status_counts 异常:', rpcError.message);
  }

  console.warn('使用估算 count 统计（大数据量下 active 等为近似值；精确统计请执行 manageapi/sql/get_customer_status_counts.sql）');

  const entries = await Promise.all(
    ALL_COMPARE_STATUSES.map(async status => ({
      status,
      count: await countCustomersByStatusEstimated(status)
    }))
  );

  const statusCounts = {};
  let totalCount = 0;
  entries.forEach(({ status, count }) => {
    statusCounts[status] = count;
    totalCount += count;
  });

  return { statusCounts, totalCount, approximate: true };
}

async function getCachedCustomerStatusCounts(client) {
  if (databaseStatsCache.data && Date.now() < databaseStatsCache.expiresAt) {
    return databaseStatsCache.data;
  }

  const stats = await fetchCustomerStatusCounts(client);
  databaseStatsCache = {
    data: stats,
    expiresAt: Date.now() + DATABASE_STATS_CACHE_TTL_MS
  };
  return stats;
}

function getShanghaiDayStartISO(daysAgo = 0) {
  const now = new Date();
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const shanghaiDate = new Date(now.getTime() + shanghaiOffsetMs);
  shanghaiDate.setUTCDate(shanghaiDate.getUTCDate() - daysAgo);
  const year = shanghaiDate.getUTCFullYear();
  const month = String(shanghaiDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shanghaiDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00:00+08:00`;
}

function resolveDateRange(dateScope) {
  switch (dateScope) {
    case 'today':
      return { start: getShanghaiDayStartISO(0), end: getShanghaiDayStartISO(-1) };
    case 'yesterday':
      return { start: getShanghaiDayStartISO(1), end: getShanghaiDayStartISO(0) };
    case 'day_before':
      return { start: getShanghaiDayStartISO(2), end: getShanghaiDayStartISO(1) };
    case 'last7':
      return { start: getShanghaiDayStartISO(6), end: null };
    case 'all':
      return { start: null, end: null };
    default:
      return { start: getShanghaiDayStartISO(0), end: getShanghaiDayStartISO(-1) };
  }
}

const UNKNOWN_UPLOADER_ID = '__unknown__';

function toShanghaiDateKey(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const shanghaiDate = new Date(date.getTime() + shanghaiOffsetMs);
  const year = shanghaiDate.getUTCFullYear();
  const month = String(shanghaiDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shanghaiDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sortUploaderSummaryRows(rows) {
  return [...rows].sort((a, b) => b.total_count - a.total_count);
}

async function fetchUploaderSummaryRows(startDate, endDate, dateScope) {
  const client = getSupabaseClient();

  try {
    const { data, error } = await client.rpc('get_customer_uploader_summary', {
      p_start: startDate,
      p_end: endDate
    });
    if (error) throw error;
    return (data || []).filter(row => row.uploader_id);
  } catch (rpcError) {
    console.warn('get_customer_uploader_summary RPC 失败:', rpcError.message);

    // 全量统计禁止走分批扫描（54万+数据会卡几分钟）
    if (dateScope === 'all') {
      throw new Error('全量统计查询超时，请暂时选择「近7天」等范围；或在 Supabase 重新执行 get_customer_uploader_summary.sql（已增加超时时间）');
    }

    console.warn('使用分批聚合兜底');
    return aggregateCustomersByUploader(startDate, endDate);
  }
}

async function aggregateCustomersByUploader(startDate, endDate) {
  const client = getSupabaseClient();
  const summaryMap = new Map();
  const batchSize = 1000;
  let from = 0;

  while (true) {
    let query = client
      .from('customers')
      .select('id, created_by, status')
      .not('created_by', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + batchSize - 1);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lt('created_at', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const id = row.created_by;
      if (!id) continue;
      if (!summaryMap.has(id)) {
        summaryMap.set(id, {
          uploader_id: id,
          total_count: 0,
          active_count: 0,
          inactive_count: 0,
          vip_count: 0
        });
      }
      const entry = summaryMap.get(id);
      entry.total_count += 1;
      if (row.status === 'active') entry.active_count += 1;
      else if (row.status === 'inactive') entry.inactive_count += 1;
      else if (row.status === 'vip') entry.vip_count += 1;
    }

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return sortUploaderSummaryRows(Array.from(summaryMap.values()));
}

async function countMissingCreatedBy(startDate, endDate) {
  const filters = [{ type: 'is', column: 'created_by', value: null }];
  if (startDate) filters.push({ type: 'gte', column: 'created_at', value: startDate });
  if (endDate) filters.push({ type: 'lt', column: 'created_at', value: endDate });
  return count('customers', filters);
}

async function enrichUploaderSummaryRows(rows) {
  if (!rows || rows.length === 0) return [];

  const userIds = rows.map(row => row.uploader_id).filter(Boolean);
  const userMap = new Map();

  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);
    const users = await select('users', 'id, name, username', [{ type: 'in', column: 'id', value: batch }]);
    (users || []).forEach(user => {
      userMap.set(user.id, user.name || user.username || '未知用户');
    });
  }

  return sortUploaderSummaryRows(rows.map(row => ({
    uploader_id: row.uploader_id,
    uploader_name: userMap.get(row.uploader_id) || '未知用户',
    total_count: Number(row.total_count || 0),
    active_count: Number(row.active_count || 0),
    inactive_count: Number(row.inactive_count || 0),
    vip_count: Number(row.vip_count || 0)
  })));
}

async function backfillCreatedByForRange({ userId, startDate, endDate }) {
  const client = getSupabaseClient();
  let updated = 0;
  const batchSize = 500;

  while (true) {
    let query = client
      .from('customers')
      .select('id')
      .is('created_by', null)
      .order('id', { ascending: true })
      .limit(batchSize);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lt('created_at', endDate);

    const { data: rows, error: selectError } = await query;
    if (selectError) throw selectError;
    if (!rows || rows.length === 0) break;

    const ids = rows.map(row => row.id);
    const { error: updateError } = await client
      .from('customers')
      .update({
        created_by: userId,
        updated_at: new Date().toISOString()
      })
      .in('id', ids);

    if (updateError) throw updateError;
    updated += ids.length;
    if (rows.length < batchSize) break;
  }

  return updated;
}

async function enrichCustomersWithCreators(customers) {
  if (!customers || customers.length === 0) return customers;

  const creatorIds = [...new Set(customers.map(c => c.created_by).filter(Boolean))];
  if (creatorIds.length === 0) return customers;

  const userMap = new Map();
  for (let i = 0; i < creatorIds.length; i += 100) {
    const batch = creatorIds.slice(i, i + 100);
    const users = await select('users', 'id, name, username', [{ type: 'in', column: 'id', value: batch }]);
    (users || []).forEach(user => {
      userMap.set(user.id, user.name || user.username || '未知用户');
    });
  }

  return customers.map(customer => ({
    ...customer,
    creator_name: customer.created_by ? (userMap.get(customer.created_by) || '未知用户') : '-'
  }));
}

async function fetchUserMap(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const userMap = new Map();

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const users = await select('users', 'id, name, username', [{ type: 'in', column: 'id', value: batch }]);
    (users || []).forEach(user => {
      userMap.set(user.id, {
        id: user.id,
        name: user.name || user.username || '未知用户',
        username: user.username
      });
    });
  }

  return userMap;
}

async function attachStatusChangeLogs(customers) {
  if (!customers || customers.length === 0) return customers;

  const customerIds = [...new Set(customers.map(customer => customer.id).filter(Boolean))];
  if (customerIds.length === 0) return customers;

  const logsByCustomerId = new Map();
  const changedByIds = new Set();
  const client = getServiceSupabaseClient();

  try {
    for (let i = 0; i < customerIds.length; i += 200) {
      const batch = customerIds.slice(i, i + 200);
      const { data, error } = await client
        .from('customer_status_change_logs')
        .select('id, customer_id, old_status, new_status, changed_by, changed_at, compare_phone, note')
        .in('customer_id', batch)
        .order('changed_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          console.warn('customer_status_change_logs 表尚未创建，跳过状态修改历史');
          return customers;
        }
        throw error;
      }

      (data || []).forEach(log => {
        if (!logsByCustomerId.has(log.customer_id)) {
          logsByCustomerId.set(log.customer_id, []);
        }
        logsByCustomerId.get(log.customer_id).push(log);
        if (log.changed_by) changedByIds.add(log.changed_by);
      });
    }

    const userMap = await fetchUserMap(Array.from(changedByIds));

    customers.forEach(customer => {
      const logs = logsByCustomerId.get(customer.id) || [];
      // logs 按 changed_at 降序；最早一次修改的 old_status 即为创建时状态
      const earliestLog = logs.length > 0 ? logs[logs.length - 1] : null;
      const createdStatus = earliestLog?.old_status || customer.status || null;
      customer.created_status = createdStatus;
      customer.created_status_label = createdStatus
        ? (CUSTOMER_STATUS_LABEL_MAP[createdStatus] || createdStatus)
        : null;
      customer.status_change_logs = logs.slice(0, 5).map(log => ({
        ...log,
        old_status_label: CUSTOMER_STATUS_LABEL_MAP[log.old_status] || log.old_status,
        new_status_label: CUSTOMER_STATUS_LABEL_MAP[log.new_status] || log.new_status,
        changed_by_user: userMap.get(log.changed_by) || null
      }));
      customer.latest_status_change = customer.status_change_logs[0] || null;
    });
  } catch (error) {
    console.warn('加载客户状态修改历史失败:', error.message);
  }

  return customers;
}

async function recordCustomerStatusChangeLogs(logRows) {
  if (!logRows || logRows.length === 0) return { inserted: 0, skipped: false };

  const client = getServiceSupabaseClient();
  try {
    const { data, error } = await client
      .from('customer_status_change_logs')
      .insert(logRows)
      .select('id');

    if (error) {
      if (error.code === '42P01') {
        console.warn('customer_status_change_logs 表尚未创建，状态已更新但未写入专用历史表');
        return { inserted: 0, skipped: true, error: error.message };
      }
      if (error.code === '42501') {
        console.warn('customer_status_change_logs 写入被 RLS 拒绝，请确认使用 SUPABASE_SERVICE_KEY:', error.message);
        return { inserted: 0, skipped: true, error: error.message };
      }
      throw error;
    }

    return { inserted: data?.length || 0, skipped: false };
  } catch (error) {
    console.warn('写入客户状态修改历史失败:', error.message);
    return { inserted: 0, skipped: true, error: error.message };
  }
}

async function recordCustomerUploadLog(payload) {
  const logRow = {
    user_id: payload.userId,
    file_name: payload.fileName || null,
    total_submitted: payload.totalSubmitted || 0,
    success_count: payload.successCount || 0,
    failed_count: payload.failedCount || 0,
    duplicate_count: payload.duplicateCount || 0,
    invalid_count: payload.invalidCount || 0,
    compare_statuses: payload.compareStatuses || null,
    default_status: payload.defaultStatus || null,
    uploaded_at: payload.uploadedAt || new Date().toISOString(),
    notes: payload.notes || null
  };

  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('customer_upload_logs')
      .insert(logRow)
      .select('id')
      .single();
    if (error) throw error;
    return data?.id || null;
  } catch (error) {
    console.warn('写入 customer_upload_logs 失败，回退 operation_logs:', error.message);
    try {
      const { default: OperationLogger } = await import('../utils/operationLogger.js');
      const operationLogger = new OperationLogger();
      await operationLogger.recordOperation({
        userId: payload.userId,
        targetType: 'customers',
        operationType: 'import',
        operationName: '客户对比上传',
        targetName: payload.fileName || '对比上传',
        newData: {
          totalSubmitted: payload.totalSubmitted,
          successCount: payload.successCount,
          failedCount: payload.failedCount,
          duplicateCount: payload.duplicateCount,
          invalidCount: payload.invalidCount,
          compareStatuses: payload.compareStatuses,
          defaultStatus: payload.defaultStatus
        }
      });
    } catch (logError) {
      console.warn('回退 operation_logs 也失败:', logError.message);
    }
    return null;
  }
}

async function enrichUploadLogRows(rows) {
  if (!rows || rows.length === 0) return [];
  const userIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
  const userMap = new Map();
  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);
    const users = await select('users', 'id, name, username', [{ type: 'in', column: 'id', value: batch }]);
    (users || []).forEach(user => {
      userMap.set(user.id, user.name || user.username || '未知用户');
    });
  }
  return rows.map(row => ({
    ...row,
    uploader_name: userMap.get(row.user_id) || '未知用户'
  }));
}

/**
 * 按上传人汇总（超级管理员）
 */
router.get('/uploader-summary', verifySignatureAndToken, async (req, res, next) => {
  try {
    if (!(await hasFunctionPermission(req.user, 'database_compare:uploader_stats'))) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法查看上传人统计'
      });
    }

    const dateScope = req.query.dateScope || 'last7';
    const { start: startDate, end: endDate } = resolveDateRange(dateScope);

    const rows = await fetchUploaderSummaryRows(startDate, endDate, dateScope);
    const enrichedRows = await enrichUploaderSummaryRows(rows);
    const missingCount = await countMissingCreatedBy(startDate, endDate);
    const trackedCount = enrichedRows.reduce((sum, row) => sum + row.total_count, 0);

    res.json({
      success: true,
      data: enrichedRows,
      meta: {
        totalRecords: trackedCount + missingCount,
        trackedCount,
        missingCount,
        uploaderCount: enrichedRows.length
      },
      dateScope,
      message: '获取上传人统计成功'
    });
  } catch (error) {
    console.error('获取上传人统计失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取上传人统计失败',
      error: error.message
    });
  }
});

/**
 * 补全缺失的上传人（超级管理员）
 */
router.post('/backfill-created-by', verifySignatureAndToken, async (req, res, next) => {
  try {
    if (!(await hasFunctionPermission(req.user, 'database_compare:uploader_stats'))) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法补全上传人'
      });
    }

    const { userId, dateScope = 'all', startDate: customStart, endDate: customEnd } = req.body;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '请选择要补全的上传人'
      });
    }

    const users = await select('users', 'id, name, username', [{ type: 'eq', column: 'id', value: userId }], 1);
    if (!users || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: '上传人不存在'
      });
    }

    let startDate = customStart || null;
    let endDate = customEnd || null;
    if (!customStart && !customEnd && dateScope && dateScope !== 'all') {
      const range = resolveDateRange(dateScope);
      startDate = range.start;
      endDate = range.end;
    }

    const updated = await backfillCreatedByForRange({ userId, startDate, endDate });

    res.json({
      success: true,
      data: {
        updated,
        uploaderName: users[0].name || users[0].username || '未知用户'
      },
      message: `已补全 ${updated} 条数据的上传人`
    });
  } catch (error) {
    console.error('补全上传人失败:', error);
    return res.status(500).json({
      success: false,
      message: '补全上传人失败',
      error: error.message
    });
  }
});

/**
 * 超级管理员：分页查看客户数据（支持按上传人、状态、时间筛选）
 */
router.get('/database-list', verifySignatureAndToken, async (req, res, next) => {
  try {
    const canViewDatabase = await hasFunctionPermission(req.user, 'database_compare:database_view');
    const canViewUploaderStats = await hasFunctionPermission(req.user, 'database_compare:uploader_stats');
    if (!canViewDatabase && !canViewUploaderStats) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法查看客户数据列表'
      });
    }

    const {
      page = 1,
      pageSize = 100,
      keyword = '',
      status = '',
      createdBy = '',
      dateScope = ''
    } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    const orFilters = [];
    if (keyword) {
      orFilters.push(
        { type: 'ilike', column: 'name', value: keyword },
        { type: 'ilike', column: 'company', value: keyword },
        { type: 'ilike', column: 'phone', value: keyword },
        { type: 'ilike', column: 'email', value: keyword }
      );
    }

    const filters = [];
    if (status) filters.push({ type: 'eq', column: 'status', value: status });
    if (createdBy === UNKNOWN_UPLOADER_ID) {
      filters.push({ type: 'is', column: 'created_by', value: null });
    } else if (createdBy) {
      filters.push({ type: 'eq', column: 'created_by', value: createdBy });
    }
    if (dateScope) {
      const { start, end } = resolveDateRange(dateScope);
      if (start) filters.push({ type: 'gte', column: 'created_at', value: start });
      if (end) filters.push({ type: 'lt', column: 'created_at', value: end });
    }

    const order = { column: 'created_at', ascending: false };
    let data = await select('customers', '*', filters, Number(pageSize), offset, order, orFilters);
    data = await enrichCustomersWithCreators(data || []);
    const totalCount = await count('customers', filters, orFilters);

    res.json({
      success: true,
      data: data || [],
      pagination: {
        total: totalCount,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(totalCount / Number(pageSize))
      },
      message: '获取数据库客户列表成功'
    });
  } catch (error) {
    console.error('获取数据库客户列表失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取数据库客户列表失败',
      error: error.message
    });
  }
});

/**
 * 测试数据库连接
 */
router.get('/test-connection', verifySignatureAndToken, async (req, res, next) => {
  try {
    const client = getSupabaseClient();
    
    // 简单查询测试
    const { data, error } = await client
      .from('customers')
      .select('id, phone')
      .limit(1);
    
    if (error) {
      return res.status(500).json({
        success: false,
        message: '数据库连接测试失败',
        error: error.message,
        errorCode: error.code
      });
    }
    
    res.json({
      success: true,
      message: '数据库连接正常',
      sampleData: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '数据库连接测试失败',
      error: error.message
    });
  }
});

/**
 * 批量检查客户数据是否已存在（仅对比电话号码）
 * 如果电话号码在customers表中存在，则标记为重复
 */
router.post('/batch-check-optimized', verifySignatureAndToken, async (req, res, next) => {
  try {
    if (!(await hasFunctionPermission(req.user, 'database_compare:compare'))) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法执行数据对比'
      });
    }

    console.log('=== 开始批量对比 ===');
    console.log('收到批量对比请求，数据量:', req.body.customerList?.length || 0);
    
    const { customerList, compareStatuses } = req.body;
    const allowedStatuses = normalizeCompareStatuses(compareStatuses);
    
    console.log('对比范围（客户状态）:', allowedStatuses.join(', '));
    
    if (!customerList || !Array.isArray(customerList) || customerList.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供客户数据列表'
      });
    }
    
    if (customerList.length > 1000000) {
      return res.status(400).json({
        success: false,
        message: '单次最多支持对比1000000条数据'
      });
    }
    
    // 初始化Supabase客户端
    let client;
    try {
      client = getSupabaseClient();
      console.log('✓ Supabase客户端初始化成功');
    } catch (clientError) {
      console.error('✗ Supabase客户端初始化失败:', clientError);
      return res.status(500).json({
        success: false,
        message: '数据库连接失败',
        error: clientError.message
      });
    }
    
    // 电话号码格式化函数：统一处理格式（与前端保持一致）
    const formatPhone = formatPhoneNumber;
    
    // 提取所有电话号码（去重并清理）
    const phones = new Set();
    const phoneOriginalMap = new Map(); // 存储原始电话号码到格式化后的映射，用于调试
    
    customerList.forEach((customer, index) => {
      const originalPhone = customer.phone;
      const phone = formatPhone(customer.phone);
      if (phone) {
        phones.add(phone);
        // 存储映射关系（如果同一个格式化后的号码有多个原始格式，只保留第一个）
        if (!phoneOriginalMap.has(phone)) {
          phoneOriginalMap.set(phone, originalPhone);
        }
      }
      // 每处理1000条打印一次进度
      if ((index + 1) % 1000 === 0) {
        console.log(`已处理 ${index + 1}/${customerList.length} 条数据`);
      }
    });
    
    console.log(`✓ 提取到 ${phones.size} 个唯一电话号码`);
    // 调试：打印前5个电话号码示例（原始格式和格式化后）
    if (phones.size > 0) {
      const samplePhones = Array.from(phones).slice(0, 5);
      console.log(`[调试] 前5个电话号码示例（格式化后）:`, samplePhones);
      samplePhones.forEach(formatted => {
        const original = phoneOriginalMap.get(formatted);
        console.log(`[调试]   格式化后: "${formatted}", 原始: "${original}"`);
      });
    }
    
    if (phones.size === 0) {
      return res.status(400).json({
        success: false,
        message: '客户数据中没有有效的电话号码'
      });
    }
    
    // 批量查询已存在的客户（按电话号码，RPC 优先，失败则按号码变体分批查询）
    const phoneArray = Array.from(phones);

    console.log(`准备查询 ${phoneArray.length} 个电话号码...`);
    const queryStartTime = Date.now();

    let existingCustomersMap;
    try {
      existingCustomersMap = await lookupExistingCustomersByPhones(client, phoneArray, allowedStatuses);
    } catch (error) {
      console.error('查询数据库失败:', error);
      return res.status(500).json({
        success: false,
        message: '查询数据库失败',
        error: error.message || String(error)
      });
    }
    
    const queryEndTime = Date.now();
    const queryDuration = ((queryEndTime - queryStartTime) / 1000).toFixed(2);
    console.log(`✓ 数据库查询完成，共找到 ${existingCustomersMap.size} 个重复电话号码，耗时 ${queryDuration} 秒`);
    
    // 调试：打印前5个匹配的电话号码示例
    if (existingCustomersMap.size > 0) {
      const sampleMatches = Array.from(existingCustomersMap.keys()).slice(0, 5);
      console.log(`[调试] 数据库中找到的重复电话号码示例:`, sampleMatches);
      sampleMatches.forEach(phone => {
        const customers = existingCustomersMap.get(phone);
        if (customers && customers.length > 0) {
          console.log(`[调试]   电话号码 ${phone} 匹配到 ${customers.length} 条记录，第一条:`, {
            id: customers[0].id,
            name: customers[0].name,
            phone: customers[0].phone,
            status: customers[0].status
          });
        }
      });
    }
    
    // 批量查询用户信息（创建者）
    const creatorIds = new Set();
    existingCustomersMap.forEach(customers => {
      customers.forEach(customer => {
        if (customer.created_by) {
          creatorIds.add(customer.created_by);
        }
      });
    });
    
    console.log(`准备查询 ${creatorIds.size} 个创建者信息...`);
    const userMap = new Map();
    
    if (creatorIds.size > 0) {
      try {
        const userIdArray = Array.from(creatorIds);
        const userBatchSize = 100;
        
        for (let i = 0; i < userIdArray.length; i += userBatchSize) {
          const userBatch = userIdArray.slice(i, i + userBatchSize);
          
          const { data: users, error: userError } = await client
            .from('users')
            .select('id, name, username')
            .in('id', userBatch);
          
          if (userError) {
            console.warn('查询用户信息失败:', userError);
          } else if (users) {
            users.forEach(user => {
              userMap.set(user.id, {
                id: user.id,
                name: user.name || user.username || '未知用户',
                username: user.username
              });
            });
          }
        }
        
        console.log(`✓ 成功查询 ${userMap.size} 个用户信息`);
        
        // 将用户信息附加到客户记录中
        existingCustomersMap.forEach((customers, phone) => {
          customers.forEach(customer => {
            if (customer.created_by && userMap.has(customer.created_by)) {
              customer.created_by_user = userMap.get(customer.created_by);
            } else {
              customer.created_by_user = null;
            }
          });
        });
      } catch (error) {
        console.warn('查询用户信息时出错:', error);
      }
    }

    const matchedCustomerById = new Map();
    existingCustomersMap.forEach(customers => {
      customers.forEach(customer => {
        if (customer.id && !matchedCustomerById.has(customer.id)) {
          matchedCustomerById.set(customer.id, customer);
        }
      });
    });
    await attachStatusChangeLogs(Array.from(matchedCustomerById.values()));
    
    // 处理每个新客户，检查电话号码是否重复
    console.log('开始处理对比结果...');
    const results = customerList.map((newCustomer, index) => {
      // 格式化上传数据中的电话号码
      const phone = formatPhone(newCustomer.phone);
      
      if (!phone) {
        return {
          ...newCustomer,
          isDuplicate: false,
          duplicateReason: '电话号码为空',
          matchedCustomers: []
        };
      }
      
      const matchedCustomers = findMatchedCustomersByPhoneVariants(existingCustomersMap, phone);
      const isDuplicate = matchedCustomers.length > 0;
      
      // 调试日志：前10条数据打印详细信息
      if (index < 10) {
        console.log(`[调试] 第${index + 1}条: 原始phone="${newCustomer.phone}", 格式化后phone="${phone}", 是否重复=${isDuplicate}, 匹配数量=${matchedCustomers.length}`);
        if (isDuplicate && matchedCustomers.length > 0) {
          console.log(`[调试]   匹配到的客户:`, {
            id: matchedCustomers[0].id,
            name: matchedCustomers[0].name,
            phone_db: matchedCustomers[0].phone,
            phone_db_formatted: formatPhone(matchedCustomers[0].phone),
            status: matchedCustomers[0].status
          });
        } else if (!isDuplicate && phone) {
          // 如果应该匹配但没有匹配到，检查existingCustomersMap中是否有这个号码
          console.log(`[警告] 第${index + 1}条未匹配到，但电话号码为: "${phone}"`);
          console.log(`[调试]   existingCustomersMap中是否有此号码:`, existingCustomersMap.has(phone));
          // 打印existingCustomersMap中的前5个键
          const mapKeys = Array.from(existingCustomersMap.keys()).slice(0, 5);
          console.log(`[调试]   existingCustomersMap中的前5个键:`, mapKeys);
        }
      }
      
      // 每处理1000条打印一次进度
      if ((index + 1) % 1000 === 0) {
        console.log(`已处理 ${index + 1}/${customerList.length} 条对比结果`);
      }
      
      // 如果是重复数据，使用数据库中第一个匹配客户的状态
      // 如果是新增数据，使用上传文件中的状态
      let displayStatus = newCustomer.status || 'active';
      if (isDuplicate && matchedCustomers.length > 0) {
        // 使用数据库中匹配客户的状态
        const dbStatus = matchedCustomers[0].status;
        if (dbStatus) {
          displayStatus = dbStatus;
          // 调试日志：每100条打印一次
          if ((index + 1) % 100 === 0) {
            console.log(`[调试] 客户 ${phone}: 数据库状态=${dbStatus}, 上传文件状态=${newCustomer.status}, 最终使用=${displayStatus}`);
          }
        } else {
          console.warn(`[警告] 客户 ${phone} 的匹配记录中没有status字段，matchedCustomers[0]:`, JSON.stringify(matchedCustomers[0]));
        }
      }
      
      return {
        ...newCustomer,
        status: displayStatus, // 使用正确的状态值
        isDuplicate: isDuplicate,
        duplicateReason: isDuplicate
          ? `数据库已有相同号码：${matchedCustomers[0].phone || phone}（${matchedCustomers[0].status || '未知状态'}）`
          : '未找到重复数据（新客户）',
        matchedCustomers: matchedCustomers
      };
    });
    
    // 统计结果
    const duplicateCount = results.filter(r => r.isDuplicate).length;
    const uniqueCount = results.filter(r => !r.isDuplicate);
    
    console.log(`✓ 对比完成: 总计 ${results.length} 条，重复 ${duplicateCount} 条，新增 ${uniqueCount.length} 条`);
    
    res.json({
      success: true,
      data: {
        results: results,
        summary: {
          total: results.length,
          duplicate: duplicateCount,
          unique: uniqueCount.length,
          duplicateRate: results.length > 0 ? ((duplicateCount / results.length) * 100).toFixed(2) + '%' : '0%',
          compareStatuses: allowedStatuses
        }
      },
      message: '批量对比完成'
    });
    
  } catch (error) {
    console.error('✗ 批量对比客户数据失败:', error);
    console.error('错误类型:', error.constructor.name);
    console.error('错误消息:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('错误详情:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    return res.status(500).json({
      success: false,
      message: '对比失败',
      error: error.message || String(error),
      errorType: error.constructor.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 获取客户数据库统计信息
 */
router.get('/database-stats', verifySignatureAndToken, async (req, res, next) => {
  try {
    if (!(await hasFunctionPermission(req.user, 'database_compare:view'))) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法查看数据库统计'
      });
    }

    const client = getSupabaseClient();
    const { statusCounts, totalCount, approximate } = await getCachedCustomerStatusCounts(client);
    
    res.json({
      success: true,
      data: {
        totalCustomers: totalCount,
        statusCounts,
        approximate: approximate === true,
        message: approximate
          ? `底料数据库约有 ${totalCount} 条客户记录（大数据量为估算值）`
          : `底料数据库共有 ${totalCount} 条客户记录`
      },
      message: '获取统计信息成功'
    });
    
  } catch (error) {
    console.error('获取数据库统计失败:', error);
    return res.status(500).json({
      success: false,
      message: error.message || '获取统计信息失败',
      error: error.message
    });
  }
});

/**
 * 记录一次对比上传批次（谁在什么时候上传了多少）
 */
router.post('/upload-sessions', verifySignatureAndToken, async (req, res, next) => {
  try {
    const {
      fileName = '',
      totalSubmitted = 0,
      successCount = 0,
      failedCount = 0,
      duplicateCount = 0,
      invalidCount = 0,
      compareStatuses = [],
      defaultStatus = ''
    } = req.body;

    const logId = await recordCustomerUploadLog({
      userId: req.user.id,
      fileName,
      totalSubmitted,
      successCount,
      failedCount,
      duplicateCount,
      invalidCount,
      compareStatuses,
      defaultStatus
    });

    res.json({
      success: true,
      data: { id: logId },
      message: '上传记录已保存'
    });
  } catch (error) {
    console.error('保存上传记录失败:', error);
    return res.status(500).json({
      success: false,
      message: '保存上传记录失败',
      error: error.message
    });
  }
});

/**
 * 查询对比上传批次记录
 */
router.get('/upload-sessions', verifySignatureAndToken, async (req, res, next) => {
  try {
    const { page = 1, pageSize = 50, dateScope = 'all', userId = '' } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    const client = getSupabaseClient();

    const { start, end } = resolveDateRange(dateScope === 'all' ? 'all' : (dateScope || 'today'));

    let query = client
      .from('customer_upload_logs')
      .select('*', { count: 'exact' })
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + Number(pageSize) - 1);

    if (!isSuperAdmin(req.user)) {
      query = query.eq('user_id', req.user.id);
    } else if (userId) {
      query = query.eq('user_id', userId);
    }
    if (start) query = query.gte('uploaded_at', start);
    if (end) query = query.lt('uploaded_at', end);

    const { data, error, count: total } = await query;
    if (error) {
      if (error.code === '42P01') {
        return res.json({
          success: true,
          data: [],
          pagination: { total: 0, page: Number(page), pageSize: Number(pageSize), totalPages: 0 },
          message: '上传记录表尚未创建，请在 Supabase 执行 create_customer_upload_logs.sql'
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: await enrichUploadLogRows(data || []),
      pagination: {
        total: total || 0,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil((total || 0) / Number(pageSize))
      },
      message: '获取上传记录成功'
    });
  } catch (error) {
    console.error('获取上传记录失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取上传记录失败',
      error: error.message
    });
  }
});

/**
 * 批量修改重复客户状态（允许非上传人修改，但必须记录修改人）
 */
router.post('/bulk-update-status', verifySignatureAndToken, async (req, res, next) => {
  try {
    if (!(await hasFunctionPermission(req.user, 'database_compare:compare'))) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法修改重复客户状态'
      });
    }

    const { customerIds = [], status, note = '', comparePhoneMap = {} } = req.body;
    const newStatus = CUSTOMER_STATUS_MAP[status] || status;
    const ids = [...new Set((Array.isArray(customerIds) ? customerIds : []).filter(Boolean))];

    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要修改状态的重复客户'
      });
    }

    if (!ALL_COMPARE_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: '无效的客户状态'
      });
    }

    if (ids.length > 10000) {
      return res.status(400).json({
        success: false,
        message: '单次最多修改10000条客户状态'
      });
    }

    const client = getSupabaseClient();
    const existingCustomers = [];

    for (let i = 0; i < ids.length; i += 1000) {
      const batch = ids.slice(i, i + 1000);
      const { data, error } = await client
        .from('customers')
        .select('id, name, phone, status, created_by, created_at')
        .in('id', batch);

      if (error) throw error;
      existingCustomers.push(...(data || []));
    }

    const existingIdSet = new Set(existingCustomers.map(customer => customer.id));
    const missingIds = ids.filter(id => !existingIdSet.has(id));
    const customersToUpdate = existingCustomers.filter(customer => customer.status !== newStatus);
    const unchangedCount = existingCustomers.length - customersToUpdate.length;

    if (customersToUpdate.length === 0) {
      return res.json({
        success: true,
        data: {
          updated: 0,
          unchanged: unchangedCount,
          missing: missingIds.length,
          historyLogged: 0
        },
        message: '所选客户已是目标状态，无需修改'
      });
    }

    const changedAt = new Date().toISOString();
    const updateIds = customersToUpdate.map(customer => customer.id);

    for (let i = 0; i < updateIds.length; i += 1000) {
      const batch = updateIds.slice(i, i + 1000);
      const { error } = await client
        .from('customers')
        .update({
          status: newStatus,
          updated_at: changedAt
        })
        .in('id', batch);

      if (error) throw error;
    }

    const logRows = customersToUpdate.map(customer => ({
      customer_id: customer.id,
      old_status: customer.status,
      new_status: newStatus,
      changed_by: req.user.id,
      changed_at: changedAt,
      compare_phone: comparePhoneMap?.[customer.id] || null,
      note: note || null
    }));

    const historyResult = await recordCustomerStatusChangeLogs(logRows);

    try {
      const { default: OperationLogger } = await import('../utils/operationLogger.js');
      const operationLogger = new OperationLogger();
      await operationLogger.recordOperation({
        userId: req.user.id,
        username: req.user.username || req.user.name,
        operationType: 'update',
        operationName: '批量修改重复客户状态',
        targetType: 'customers',
        targetId: updateIds.slice(0, 100).join(','),
        targetName: `批量修改 ${customersToUpdate.length} 条客户状态`,
        oldData: {
          customerIds: updateIds,
          statuses: [...new Set(customersToUpdate.map(customer => customer.status))]
        },
        newData: {
          status: newStatus,
          statusLabel: CUSTOMER_STATUS_LABEL_MAP[newStatus],
          updatedCount: customersToUpdate.length,
          unchangedCount,
          missingCount: missingIds.length
        },
        changedFields: ['status']
      }, req);
    } catch (logError) {
      console.warn('记录批量状态修改操作日志失败:', logError.message);
    }

    const updatedCustomers = existingCustomers.map(customer => (
      updateIds.includes(customer.id)
        ? { ...customer, status: newStatus, updated_at: changedAt }
        : customer
    ));
    await attachStatusChangeLogs(updatedCustomers);

    res.json({
      success: true,
      data: {
        updated: customersToUpdate.length,
        unchanged: unchangedCount,
        missing: missingIds.length,
        historyLogged: historyResult.inserted,
        historySkipped: historyResult.skipped === true,
        customers: updatedCustomers
      },
      message: `已修改 ${customersToUpdate.length} 条客户状态为「${CUSTOMER_STATUS_LABEL_MAP[newStatus]}」`
    });
  } catch (error) {
    console.error('批量修改重复客户状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '批量修改客户状态失败',
      error: error.message
    });
  }
});

/**
 * 批量保存新增客户数据到数据库（高性能批量创建）
 * 优化：批量检查重复，大批次插入，适合十几万条数据
 */
router.post('/save-new-customers', verifySignatureAndToken, async (req, res, next) => {
  try {
    if (!(await hasFunctionPermission(req.user, 'database_compare:import'))) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法导入客户数据'
      });
    }

    const { customerList, compareStatuses } = req.body;
    const allowedStatuses = normalizeCompareStatuses(compareStatuses);
    const currentUserId = req.user.id;
    
    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        message: '无法识别当前用户，上传人已记录失败'
      });
    }
    
    if (!customerList || !Array.isArray(customerList) || customerList.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供客户数据列表'
      });
    }
    
    console.log(`准备批量创建 ${customerList.length} 条客户数据，创建用户: ${currentUserId}`);
    const startTime = Date.now();
    
    const client = getSupabaseClient();
    
    // 电话号码格式化函数：统一处理格式（与对比逻辑保持一致）
    const formatPhone = (phoneValue) => {
      if (!phoneValue && phoneValue !== 0) return '';
      
      // 转换为字符串
      let phoneStr = String(phoneValue);
      
      // 处理科学计数法（如 1.21551e+10）
      if (phoneStr.includes('e+') || phoneStr.includes('E+')) {
        phoneStr = parseFloat(phoneStr).toString();
      }
      
      // 去除所有非数字字符（保留数字）
      phoneStr = phoneStr.replace(/\D/g, '');
      
      // 去除前导零（但保留至少一个数字）
      phoneStr = phoneStr.replace(/^0+/, '') || '0';
      
      return phoneStr.trim();
    };
    
    // 第一步：快速过滤和准备数据（不检查数据库）
    const validCustomers = [];
    const invalidCustomers = [];
    
    for (const customer of customerList) {
      // 验证必填字段：电话号码
      if (!customer.phone && customer.phone !== 0) {
        invalidCustomers.push({ customer, reason: '电话号码为空' });
        continue;
      }
      
      // 格式化电话号码，确保与对比逻辑一致
      const phone = formatPhone(customer.phone);
      
      if (!phone || phone === '0') {
        invalidCustomers.push({ customer, reason: '电话号码无效' });
        continue;
      }
      
      // 确保name字段不为空（数据库约束要求NOT NULL）
      // 如果name为空或只有空格，使用电话号码作为默认值
      const customerName = (customer.name && String(customer.name).trim()) 
        ? String(customer.name).trim() 
        : `客户_${phone}`;
      
      // 状态映射：将前端的中文状态映射到数据库状态值
      const statusMap = CUSTOMER_STATUS_MAP;
      const customerStatus = customer.status && statusMap[customer.status] 
        ? statusMap[customer.status] 
        : (customer.status || 'active'); // 如果传入的是英文状态值，直接使用；否则默认为'active'
      
      // 准备客户数据，所有字段都使用合理的默认值
      // 注意：即使只有电话号码也可以保存，其他字段可以为空
      validCustomers.push({
        name: customerName, // 必填，使用电话号码作为默认值
        company: (customer.company && String(customer.company).trim()) ? String(customer.company).trim() : null,
        phone: phone, // 必填
        email: (customer.email && String(customer.email).trim()) ? String(customer.email).trim() : null,
        status: customerStatus, // 使用映射后的状态值
        source: 'other', // 标记为导入来源（数据库约束只允许：online, offline, referral, other）
        address: (customer.address && String(customer.address).trim()) ? String(customer.address).trim() : null,
        notes: (customer.notes && String(customer.notes).trim()) ? String(customer.notes).trim() : '',
        created_by: currentUserId, // 记录创建用户
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    if (validCustomers.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有有效的客户数据可保存',
        invalidCount: invalidCustomers.length
      });
    }
    
    console.log(`✓ 数据准备完成: ${validCustomers.length} 条有效，${invalidCustomers.length} 条无效`);
    
    // 第二步：批量检查重复（一次性查询所有电话号码）
    // 注意：查询时也要格式化数据库中的电话号码，确保格式一致
    const phones = new Set(validCustomers.map(c => c.phone));
    const phoneArray = Array.from(phones);
    const existingPhones = new Set();
    
    if (phoneArray.length > 0) {
      console.log(`批量检查 ${phoneArray.length} 个电话号码是否已存在...`);
      const checkBatchSize = 1000; // 大批次检查
      
      // 创建电话号码变体集合（包含带前导零和不带前导零的版本）
      const phoneVariantsSet = new Set();
      phoneArray.forEach(phone => {
        phoneVariantsSet.add(phone); // 格式化后的号码
        // 添加可能的变体：带前导零的版本
        if (phone && !phone.startsWith('0')) {
          phoneVariantsSet.add('0' + phone);
        }
        // 添加可能的变体：不带前导零的版本（如果原号码以0开头）
        if (phone && phone.startsWith('0') && phone.length > 1) {
          phoneVariantsSet.add(phone.substring(1));
        }
      });
      const phoneVariantsArray = Array.from(phoneVariantsSet);
      
      for (let i = 0; i < phoneVariantsArray.length; i += checkBatchSize) {
        const phoneBatch = phoneVariantsArray.slice(i, i + checkBatchSize);
        
        try {
          const { data: existing, error } = await client
            .from('customers')
            .select('phone, status')
            .in('phone', phoneBatch)
            .in('status', allowedStatuses);
          
          if (!error && existing) {
            // 格式化数据库返回的电话号码，确保格式一致
            existing.forEach(c => {
              if (!isCustomerInCompareScope(c, allowedStatuses)) {
                return;
              }
              const formattedPhone = formatPhone(c.phone);
              if (formattedPhone) {
                existingPhones.add(formattedPhone);
              }
            });
          }
        } catch (checkError) {
          console.warn(`检查批次 ${Math.floor(i / checkBatchSize) + 1} 失败:`, checkError.message);
        }
      }
      
      console.log(`✓ 发现 ${existingPhones.size} 个已存在的电话号码（格式化后）`);
    }
    
    // 第三步：过滤掉已存在的客户（使用格式化后的电话号码比较）
    const customersToInsert = validCustomers.filter(c => {
      const formattedPhone = formatPhone(c.phone);
      return !isPhoneExistingByVariants(existingPhones, formattedPhone);
    });
    const duplicateCount = validCustomers.length - customersToInsert.length;
    
    if (customersToInsert.length === 0) {
      return res.status(400).json({
        success: false,
        message: '所有客户数据都已存在',
        duplicateCount: duplicateCount
      });
    }
    
    console.log(`准备插入 ${customersToInsert.length} 条新客户数据（跳过 ${duplicateCount} 条重复）`);
    
    // 第四步：大批量插入（分批处理，避免单次插入过多导致超时或失败）
    const insertBatchSize = 200; // 减小批次大小，提高成功率（200条一批比较稳定）
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const createdIds = [];
    
    for (let i = 0; i < customersToInsert.length; i += insertBatchSize) {
      const batch = customersToInsert.slice(i, i + insertBatchSize);
      const batchNum = Math.floor(i / insertBatchSize) + 1;
      const totalBatches = Math.ceil(customersToInsert.length / insertBatchSize);
      
      try {
        const { data, error } = await client
          .from('customers')
          .insert(batch)
          .select('id');
        
        if (error) {
          console.error(`批量插入失败 (批次 ${batchNum}/${totalBatches}):`, error);
          console.error('错误代码:', error.code);
          console.error('错误详情:', JSON.stringify(error, null, 2));
          console.error('失败批次数据示例:', JSON.stringify(batch.slice(0, 2), null, 2));
          errorCount += batch.length;
          errors.push({
            batch: batchNum,
            error: error.message || String(error),
            errorCode: error.code,
            errorDetails: error.details || error.hint,
            count: batch.length
          });
        } else if (data) {
          successCount += data.length;
          createdIds.push(...data.map(c => c.id));
          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`✓ 进度: ${batchNum}/${totalBatches} 批次，已插入 ${successCount} 条`);
          }
        } else {
          // 没有data也没有error，可能是静默失败
          console.warn(`批量插入无返回 (批次 ${batchNum}/${totalBatches})`);
          errorCount += batch.length;
          errors.push({
            batch: batchNum,
            error: '插入操作无返回数据',
            count: batch.length
          });
        }
      } catch (batchError) {
        console.error(`批量插入异常 (批次 ${batchNum}/${totalBatches}):`, batchError);
        console.error('异常堆栈:', batchError.stack);
        errorCount += batch.length;
        errors.push({
          batch: batchNum,
          error: batchError.message || String(batchError),
          count: batch.length
        });
      }
    }
    
    // 第五步：记录操作日志（异步，不阻塞响应）
    const logOperation = async () => {
      try {
        const { default: OperationLogger } = await import('../utils/operationLogger.js');
        const operationLogger = new OperationLogger();
        await operationLogger.recordOperation(
          'customers',
          'batch_create',
          createdIds.slice(0, 100).join(','), // 只记录前100个ID
          '客户',
          {
            count: successCount,
            source: 'import',
            total: customerList.length,
            invalid: invalidCustomers.length,
            duplicate: duplicateCount,
            failed: errorCount
          },
          currentUserId
        );
      } catch (logError) {
        console.warn('记录操作日志失败:', logError);
      }
    };
    logOperation(); // 异步执行，不等待
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`批量创建完成: 成功 ${successCount} 条，失败 ${errorCount} 条，重复 ${duplicateCount} 条，无效 ${invalidCustomers.length} 条，耗时 ${duration} 秒`);
    
    // 构建响应消息
    let responseMessage = `成功创建 ${successCount} 条客户数据`
    if (errorCount > 0) {
      responseMessage += `，${errorCount} 条失败`
      if (errors.length > 0) {
        const firstError = errors[0]
        responseMessage += `（错误: ${firstError.error || '未知错误'}）`
      }
    }
    if (duplicateCount > 0) {
      responseMessage += `，${duplicateCount} 条重复`
    }
    if (invalidCustomers.length > 0) {
      responseMessage += `，${invalidCustomers.length} 条无效`
    }
    responseMessage += `，耗时 ${duration} 秒`
    
    res.json({
      success: true,
      data: {
        total: customerList.length,
        success: successCount,
        failed: errorCount,
        duplicate: duplicateCount,
        invalid: invalidCustomers.length,
        duration: `${duration}秒`,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined // 只返回前10个错误
      },
      message: responseMessage
    });
    
  } catch (error) {
    console.error('批量创建客户数据失败:', error);
    return res.status(500).json({
      success: false,
      message: '批量创建客户失败',
      error: error.message || String(error)
    });
  }
});

export default router;
