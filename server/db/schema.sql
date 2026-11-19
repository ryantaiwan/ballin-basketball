-- ============================================
-- 有Ball必In 籃球歡樂打社團 - 球局報名系統
-- Turso (SQLite) 資料庫初始化腳本 V2
-- ============================================

-- 球局表
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '球局',
  game_date TEXT NOT NULL,          -- 格式: YYYY-MM-DD
  game_time TEXT NOT NULL,          -- 格式: HH:MM (開始時間)
  end_time TEXT DEFAULT '',         -- 格式: HH:MM (結束時間)
  location TEXT NOT NULL,
  notes TEXT DEFAULT '',            -- 備註 (列表顯示前200字)
  price INTEGER DEFAULT 0,          -- 價格 (NT$)
  max_players INTEGER NOT NULL DEFAULT 20,
  status TEXT DEFAULT 'open',       -- open / in_progress / ended / cancelled
  payment_methods TEXT DEFAULT '',  -- JSON 陣列字串，如 ["LINE PAY","現金"]
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 報名表 (正式報名)
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  line_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  registered_at TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, line_user_id)
);

-- 候補表
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  line_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  joined_at TEXT DEFAULT (datetime('now', '+8 hours')),
  position INTEGER NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, line_user_id)
);

-- 管理者白名單
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT DEFAULT '管理者',
  created_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 付款紀錄表 (每位報名者的付款方式 + 收款狀態)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  line_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  payment_method TEXT DEFAULT '',
  paid INTEGER DEFAULT 0,           -- 0=未收款 1=已收款
  paid_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, line_user_id)
);

-- 付款方式選項表 (可維護)
CREATE TABLE IF NOT EXISTS payment_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  display_order INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_registrations_game_id ON registrations(game_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_game_id ON waitlist(game_id);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_payments_game_id ON payments(game_id);
