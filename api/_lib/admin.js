/**
 * 管理者權限檢查 (Vercel Serverless 版)
 */
const { db } = require('./db');

/**
 * 檢查是否為管理者
 * @param {string} lineUserId
 * @returns {Promise<boolean>}
 */
async function isAdmin(lineUserId) {
  if (!lineUserId) return false;
  const result = await db.execute({
    sql: 'SELECT 1 FROM admins WHERE line_user_id = ?',
    args: [lineUserId],
  });
  return result.rows.length > 0;
}

/**
 * 驗證使用者 + 管理者權限
 * @param {object} headers - 請求 headers
 * @returns {Promise<{user: object|null, error: string|null, status: number}>}
 */
async function requireAdmin(headers) {
  const { user, error, status } = await require('./auth').verifyLiffToken(headers);
  if (error) return { user: null, error, status };

  const admin = await isAdmin(user.lineUserId);
  if (!admin) {
    return { user, error: '無管理者權限', status: 403 };
  }

  return { user, error: null, status: 200 };
}

module.exports = { isAdmin, requireAdmin };
