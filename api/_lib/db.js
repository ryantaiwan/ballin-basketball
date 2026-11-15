/**
 * Turso 資料庫連線模組 (Vercel Serverless 版)
 * 使用 @libsql/client 驅動
 * Serverless 環境每次呼叫都會新建連線，Turso 驅動已最佳化此場景
 */
const { createClient } = require('@libsql/client');

let _client = null;

/**
 * 取得或建立 DB client（延遲初始化）
 * 在沒有環境變數時不會立即報錯，而是等到實際使用時才報錯
 */
function getDb() {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error('TURSO_DATABASE_URL 未設定');
    }
    _client = createClient({
      url: url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

/**
 * 確保資料表存在（冪等，使用 IF NOT EXISTS）
 */
async function ensureSchema() {
  const fs = require('fs');
  const path = require('path');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const client = getDb();
  for (const stmt of statements) {
    await client.execute(stmt);
  }
}

// 匯出一個 Proxy，讓 `db.execute(...)` 呼叫時自動觸發 getDb()
const db = new Proxy({}, {
  get(_target, prop) {
    const client = getDb();
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

module.exports = { db, ensureSchema };
