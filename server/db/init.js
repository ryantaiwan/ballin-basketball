/**
 * 資料庫初始化腳本
 * 執行: npm run db:init
 */
require('dotenv').config();
const { initDatabase } = require('./index');
const { db } = require('./index');

async function setup() {
  console.log('=== 有Ball必In 籃球歡樂打社團 — 資料庫初始化 ===\n');

  // 1. 建立所有資料表
  await initDatabase();

  // 2. 寫入初始管理者
  const initialAdminIds = process.env.INITIAL_ADMIN_IDS;
  if (initialAdminIds) {
    const ids = initialAdminIds.split(',').map((s) => s.trim());
    for (const id of ids) {
      try {
        await db.execute({
          sql: `INSERT OR IGNORE INTO admins (line_user_id, display_name) VALUES (?, '管理者')`,
          args: [id],
        });
        console.log(`[Admin] 已新增管理者: ${id}`);
      } catch (e) {
        console.log(`[Admin] ${id} 已存在`);
      }
    }
  }

  // 3. 建立一筆測試球局（方便第一次測試）
  const testGame = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM games`,
  });
  if (Number(testGame.rows[0].cnt) === 0) {
    await db.execute({
      sql: `INSERT INTO games (title, game_date, game_time, location, notes, price, max_players)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    console.log('[Game] 已建立測試球局');
  }

  console.log('\n=== 初始化完成 ===');
  process.exit(0);
}

setup().catch((err) => {
  console.error('初始化失敗:', err);
  process.exit(1);
});
