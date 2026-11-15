/**
 * GET /api/user/me         — 取得使用者資訊（含是否管理者）
 * GET /api/user/check-admin — 檢查管理員狀態
 */
const { db } = require('../_lib/db');
const { verifyLiffToken } = require('../_lib/auth');
const { isAdmin } = require('../_lib/admin');
const { handlePreflight, jsonRes } = require('../_lib/utils');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET') {
    return jsonRes(res, 405, { error: 'Method Not Allowed' });
  }

  const { user, error, status } = await verifyLiffToken(req.headers);
  if (error) return jsonRes(res, status, { error });

  try {
    const admin = await isAdmin(user.lineUserId);

    let adminDisplayName = null;
    if (admin) {
      const adminResult = await db.execute({
        sql: 'SELECT display_name FROM admins WHERE line_user_id = ?',
        args: [user.lineUserId],
      });
      if (adminResult.rows.length > 0) {
        adminDisplayName = adminResult.rows[0].display_name;
      }
    }

    return jsonRes(res, 200, {
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      isAdmin: admin,
      adminDisplayName,
    });
  } catch (error) {
    console.error('[User] 取得資訊失敗:', error);
    return jsonRes(res, 500, { error: '取得使用者資訊失敗' });
  }
};
