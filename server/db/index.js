/**
 * Turso 資料庫連線模組
 * 使用 @libsql/client 驅動
 */
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

/**
 * 初始化資料庫（建立所有資料表）
 */
async function initDatabase() {
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.execute(stmt);
  }
  console.log('[DB] 資料庫初始化完成');
}

module.exports = { db, initDatabase };
