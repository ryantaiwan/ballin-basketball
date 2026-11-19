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
  price INTEGER DEFAULT 0,          -- 費用 (NT$)
  guest_price INTEGER DEFAULT 0,    -- 臨打者費用 (NT$)
  min_players INTEGER DEFAULT 0,    -- 最少人數限制
  max_players INTEGER NOT NULL DEFAULT 20,
  status TEXT DEFAULT 'open',       -- open / in_progress / ended / cancelled / scheduled
  payment_methods TEXT DEFAULT '',  -- JSON 陣列字串，如 ["LINE PAY","現金"]
  quit_deadline TEXT DEFAULT '',    -- 退出球局截止時間 (格式: YYYY-MM-DD HH:MM)
  publish_mode TEXT DEFAULT 'immediate', -- immediate / scheduled (立即發佈 / 指定時間)
  publish_at TEXT DEFAULT '',       -- 指定發佈時間 (格式: YYYY-MM-DD HH:MM)
  published_at TEXT DEFAULT '',     -- 實際發佈時間 (格式: YYYY-MM-DD HH:MM)
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 報名表 (正式報名)
CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  line_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_guest INTEGER DEFAULT 0,           -- 0=一般報名 1=臨打代報
  guest_reporter TEXT DEFAULT '',       -- 代報人 display_name (臨打用)
  registered_at TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, line_user_id, display_name)  -- 允許同人代報多位臨打
);

-- 候補表
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  line_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_guest INTEGER DEFAULT 0,           -- 0=一般候補 1=臨打代報
  guest_reporter TEXT DEFAULT '',       -- 代報人 display_name (臨打用)
  joined_at TEXT DEFAULT (datetime('now', '+8 hours')),
  position INTEGER NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, line_user_id, display_name)
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
  is_guest INTEGER DEFAULT 0,       -- 0=一般 1=臨打
  updated_at TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, line_user_id, display_name)
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

-- 通知紀錄表（避免重複發送）
CREATE TABLE IF NOT EXISTS game_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL,  -- cancel_low / reminder_24h / reminder_12h / reminder_2h / reminder_30m
  sent_at TEXT DEFAULT (datetime('now', '+8 hours')),
  UNIQUE(game_id, notification_type)
);

-- LINE 群組表（webhook 自動捕捉 group ID）
CREATE TABLE IF NOT EXISTS line_groups (
  group_id TEXT PRIMARY KEY,
  group_type TEXT DEFAULT 'group',  -- group / room
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);
