/**
 * GET /api/user/check-admin — 檢查是否為管理者
 */
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
    return jsonRes(res, 200, { isAdmin: admin });
  } catch (error) {
    console.error('[User] 管理員檢查失敗:', error);
    return jsonRes(res, 500, { error: '檢查失敗' });
  }
};
