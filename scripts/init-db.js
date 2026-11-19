/**
 * 資料庫初始化腳本 V3 — 含付款方式/收款/結束時間
 * 逐步執行，詳細錯誤報告，冪等（可重複執行）
 */
require('dotenv').config();

const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run(label, sql, args) {
  try {
    if (args) {
      await db.execute({ sql, args });
    } else {
      await db.execute(sql);
    }
    console.log(`✅ ${label}`);
    return true;
  } catch (err) {
    // ALTER TABLE 已存在欄位不算錯誤
    if (err.message && (err.message.includes('duplicate column') || err.message.includes('already exists'))) {
      console.log(`⏭️  ${label} (已存在，跳過)`);
      return true;
    }
    console.log(`❌ ${label}: ${err.message}`);
    return false;
  }
}

async function setup() {
  console.log('=== 有Ball必In — 資料庫初始化 V3 ===\n');

  // ===== 1. 基本表（冪等） =====
  await run('CREATE TABLE games (V3)', `CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '球局',
    game_date TEXT NOT NULL,
    game_time TEXT NOT NULL,
    end_time TEXT DEFAULT '',
    location TEXT NOT NULL,
    notes TEXT DEFAULT '',
    price INTEGER DEFAULT 0,
    max_players INTEGER NOT NULL DEFAULT 20,
    status TEXT DEFAULT 'open',
    payment_methods TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
  )`);

  await run('CREATE TABLE registrations', `CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    line_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    registered_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    UNIQUE(game_id, line_user_id)
  )`);

  await run('CREATE TABLE waitlist', `CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    line_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    joined_at TEXT DEFAULT (datetime('now', '+8 hours')),
    position INTEGER NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    UNIQUE(game_id, line_user_id)
  )`);

  await run('CREATE TABLE admins', `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT UNIQUE NOT NULL,
    display_name TEXT DEFAULT '管理者',
    created_at TEXT DEFAULT (datetime('now', '+8 hours'))
  )`);

  // ===== 2. 新表 =====
  await run('CREATE TABLE payments', `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    line_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    payment_method TEXT DEFAULT '',
    paid INTEGER DEFAULT 0,
    paid_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    UNIQUE(game_id, line_user_id)
  )`);

  await run('CREATE TABLE payment_options', `CREATE TABLE IF NOT EXISTS payment_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now', '+8 hours'))
  )`);

  await run('CREATE TABLE game_notifications', `CREATE TABLE IF NOT EXISTS game_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    notification_type TEXT NOT NULL,
    sent_at TEXT DEFAULT (datetime('now', '+8 hours')),
    UNIQUE(game_id, notification_type)
  )`);

  // ===== 3. ALTER TABLE（為現有 games 表新增欄位，冪等） =====
  console.log('\n--- ALTER TABLE games ---');
  await run('ADD COLUMN end_time', `ALTER TABLE games ADD COLUMN end_time TEXT DEFAULT ''`);
  await run('ADD COLUMN payment_methods', `ALTER TABLE games ADD COLUMN payment_methods TEXT DEFAULT ''`);
  await run('ADD COLUMN guest_price', `ALTER TABLE games ADD COLUMN guest_price INTEGER DEFAULT 0`);
  await run('ADD COLUMN min_players', `ALTER TABLE games ADD COLUMN min_players INTEGER DEFAULT 0`);

  // ===== 4. 索引 =====
  console.log('\n--- 索引 ---');
  await run('CREATE INDEX idx_registrations_game_id', `CREATE INDEX IF NOT EXISTS idx_registrations_game_id ON registrations(game_id)`);
  await run('CREATE INDEX idx_waitlist_game_id', `CREATE INDEX IF NOT EXISTS idx_waitlist_game_id ON waitlist(game_id)`);
  await run('CREATE INDEX idx_games_date', `CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date)`);
  await run('CREATE INDEX idx_payments_game_id', `CREATE INDEX IF NOT EXISTS idx_payments_game_id ON payments(game_id)`);

  // ===== 5. 預設付款方式 =====
  console.log('\n--- 預設付款方式 ---');
  const defaultOptions = [
    { name: 'LINE PAY', order: 1 },
    { name: '銀行轉帳', order: 2 },
    { name: '現金', order: 3 },
    { name: '街口支付', order: 4 },
  ];
  for (const opt of defaultOptions) {
    await run(`INSERT payment_option: ${opt.name}`,
      `INSERT OR IGNORE INTO payment_options (name, display_order, enabled) VALUES (?, ?, 1)`,
      [opt.name, opt.order]
    );
  }

  // ===== 6. 管理者 =====
  console.log('\n--- 管理者 ---');
  const adminId = process.env.INITIAL_ADMIN_IDS;
  if (adminId) {
    await run('INSERT admin',
      `INSERT OR IGNORE INTO admins (line_user_id, display_name) VALUES (?, '管理員')`,
      [adminId.trim()]
    );
    console.log(`  管理者 ID: ${adminId.trim()}`);
  }

  // ===== 7. 驗證 =====
  console.log('\n--- 驗證 ---');
  try {
    const tables = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    console.log('📋 資料表清單:');
    tables.rows.forEach((r) => console.log('  -', r.name));
  } catch (err) {
    console.log('❌ 查詢資料表失敗:', err.message);
  }

  try {
    const opts = await db.execute(`SELECT * FROM payment_options ORDER BY display_order`);
    console.log('\n💳 付款方式選項:');
    opts.rows.forEach((r) => console.log(`  - ${r.name} (order: ${r.display_order}, enabled: ${r.enabled})`));
  } catch (err) {
    console.log('❌ 查詢付款方式失敗:', err.message);
  }

  try {
    const admins = await db.execute(`SELECT * FROM admins`);
    console.log('\n👤 管理者:');
    admins.rows.forEach((r) => console.log(`  - ${r.line_user_id} (${r.display_name})`));
  } catch (err) {
    console.log('❌ 查詢管理者失敗:', err.message);
  }

  try {
    const cnt = await db.execute(`SELECT COUNT(*) as cnt FROM games`);
    console.log(`\n🏀 球局數量: ${cnt.rows[0].cnt}`);
  } catch (err) {
    console.log('❌ 查詢球局數量失敗:', err.message);
  }

  // ===== 8. 更新現有球局的 payment_methods（如有測試球局） =====
  try {
    const games = await db.execute(`SELECT id, payment_methods FROM games WHERE payment_methods = '' OR payment_methods IS NULL`);
    if (games.rows.length > 0) {
      const defaultMethods = JSON.stringify(['LINE PAY', '現金']);
      for (const g of games.rows) {
        await db.execute({
          sql: `UPDATE games SET payment_methods = ? WHERE id = ?`,
          args: [defaultMethods, g.id],
        });
      }
      console.log(`\n✅ 已為 ${games.rows.length} 場現有球局設定預設付款方式`);
    }
  } catch (err) {
    console.log('⚠️ 更新現有球局付款方式失敗:', err.message);
  }

  console.log('\n=== 初始化完成 ===');
  process.exit(0);
}

setup().catch((err) => {
  console.error('致命錯誤:', err);
  process.exit(1);
});
