/**
 * 資料庫初始化腳本 V2 — 逐步執行，詳細錯誤報告
 */
require('dotenv').config();

const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function setup() {
  console.log('=== 有Ball必In — 資料庫初始化 V2 ===\n');

  const statements = [
    {
      label: 'CREATE TABLE games',
      sql: `CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '球局',
        game_date TEXT NOT NULL,
        game_time TEXT NOT NULL,
        location TEXT NOT NULL,
        notes TEXT DEFAULT '',
        price INTEGER DEFAULT 0,
        max_players INTEGER NOT NULL DEFAULT 20,
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT (datetime('now', '+8 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
      )`
    },
    {
      label: 'CREATE TABLE registrations',
      sql: `CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        registered_at TEXT DEFAULT (datetime('now', '+8 hours')),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        UNIQUE(game_id, line_user_id)
      )`
    },
    {
      label: 'CREATE TABLE waitlist',
      sql: `CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        joined_at TEXT DEFAULT (datetime('now', '+8 hours')),
        position INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        UNIQUE(game_id, line_user_id)
      )`
    },
    {
      label: 'CREATE TABLE admins',
      sql: `CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        line_user_id TEXT UNIQUE NOT NULL,
        display_name TEXT DEFAULT '管理者',
        created_at TEXT DEFAULT (datetime('now', '+8 hours'))
      )`
    },
    {
      label: 'CREATE INDEX idx_registrations_game_id',
      sql: `CREATE INDEX IF NOT EXISTS idx_registrations_game_id ON registrations(game_id)`
    },
    {
      label: 'CREATE INDEX idx_waitlist_game_id',
      sql: `CREATE INDEX IF NOT EXISTS idx_waitlist_game_id ON waitlist(game_id)`
    },
    {
      label: 'CREATE INDEX idx_games_date',
      sql: `CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date)`
    },
  ];

  for (const stmt of statements) {
    try {
      await db.execute(stmt.sql);
      console.log(`✅ ${stmt.label}`);
    } catch (err) {
      console.log(`❌ ${stmt.label}: ${err.message}`);
    }
  }

  // 寫入管理者
  const adminId = process.env.INITIAL_ADMIN_IDS;
  if (adminId) {
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO admins (line_user_id, display_name) VALUES (?, '管理員')`,
        args: [adminId.trim()],
      });
      console.log(`✅ 管理者已寫入: ${adminId.trim()}`);
    } catch (err) {
      console.log(`❌ 管理者寫入失敗: ${err.message}`);
    }
  }

  // 驗證資料表
  try {
    const tables = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    console.log('\n📋 資料表清單:');
    tables.rows.forEach((r) => console.log('  -', r.name));
  } catch (err) {
    console.log('❌ 查詢資料表失敗:', err.message);
  }

  // 驗證管理者
  try {
    const admins = await db.execute(`SELECT * FROM admins`);
    console.log('\n👤 管理者清單:');
    admins.rows.forEach((r) => console.log('  -', r.line_user_id, '(' + r.display_name + ')'));
  } catch (err) {
    console.log('❌ 查詢管理者失敗:', err.message);
  }

  // 建立測試球局
  try {
    const cnt = await db.execute(`SELECT COUNT(*) as cnt FROM games`);
    if (Number(cnt.rows[0].cnt) === 0) {
      await db.execute({
        sql: `INSERT INTO games (title, game_date, game_time, location, notes, price, max_players) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          '週末歡樂打',
          '2026-11-22',
          '19:00',
          '台北市中正運動中心 B1 籃球場',
          '本週六晚上的歡樂籃球聚，歡迎所有程度的球友參加！記得帶水壺和替換衣物，場地有飲水機可以使用。打球以安全第一、友誼第二為原則，不要受傷了！',
          150,
          20,
        ],
      });
      console.log('\n✅ 測試球局已建立');
    } else {
      console.log(`\n📋 已有 ${cnt.rows[0].cnt} 場球局`);
    }
  } catch (err) {
    console.log('❌ 球局建立失敗:', err.message);
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
}

setup().catch((err) => {
  console.error('致命錯誤:', err);
  process.exit(1);
});
