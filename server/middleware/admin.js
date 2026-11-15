/**
 * 管理者驗證中介軟體
 * 檢查當前 LINE User ID 是否在 admins 白名單中
 */
const { db } = require('../db');

async function requireAdmin(req, res, next) {
  if (!req.user || !req.user.lineUserId) {
    return res.status(401).json({ error: '未登入' });
  }

  try {
    const result = await db.execute({
      sql: 'SELECT * FROM admins WHERE line_user_id = ?',
      args: [req.user.lineUserId],
    });

    if (result.rows.length === 0) {
      return res.status(403).json({ error: '無管理者權限' });
    }

    req.admin = result.rows[0];
    next();
  } catch (error) {
    console.error('[Admin] 驗證失敗:', error);
    return res.status(500).json({ error: '伺服器錯誤' });
  }
}

/**
 * 檢查是否為管理者（回傳 boolean，不阻擋請求）
 */
async function isAdmin(lineUserId) {
  if (!lineUserId) return false;
  const result = await db.execute({
    sql: 'SELECT 1 FROM admins WHERE line_user_id = ?',
    args: [lineUserId],
  });
  return result.rows.length > 0;
}

module.exports = { requireAdmin, isAdmin };
