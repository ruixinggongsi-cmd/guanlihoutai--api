/**
 * 部署 compare_customer_phones RPC 到 Supabase
 * 运行: node scripts/deploy_customer_compare_function.js
 *
 * 需要以下环境变量之一:
 * - DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
 * - SUPABASE_DB_PASSWORD=[数据库密码]（与 SUPABASE_URL 配合使用）
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!password || !supabaseUrl) {
    return null;
  }

  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error('缺少数据库连接配置。请任选其一：');
    console.error('  1. 在 .env 中设置 DATABASE_URL');
    console.error('  2. 在 .env 中设置 SUPABASE_DB_PASSWORD');
    console.error('  3. 在 Supabase SQL Editor 手动执行 manageapi/sql/ 下的 SQL 文件');
    process.exit(1);
  }

  const sqlFiles = [
    'create_customer_compare_function.sql',
    'get_customer_status_counts.sql'
  ];

  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    for (const file of sqlFiles) {
      const sqlPath = join(__dirname, '../sql', file);
      const sql = readFileSync(sqlPath, 'utf8');
      console.log(`正在部署 ${file}...`);
      await client.query(sql);
      console.log(`✓ ${file} 部署成功`);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('部署失败:', error.message);
  process.exit(1);
});
