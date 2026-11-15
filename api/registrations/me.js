/**
 * GET /api/registrations/me — 取得我的報名紀錄
 *
 * 注意：Vercel 路由 /api/registrations/me 需要放在 [gameId] 之前
 * 由於 Vercel 檔案路由優先級，me 不會被 [gameId] 捕獲
 */
const { db } = require('../_lib/db');
const { verifyLiffToken } = require('../_lib/auth');
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

  const lineUserId = user.lineUserId;

  try {
    const regResult = await db.execute({
      sql: `SELECT r.*, g.title, g.game_date, g.game_time, g.location
            FROM registrations r
            JOIN games g ON r.game_id = g.id
            WHERE r.line_user_id = ? AND g.status != 'cancelled'
            ORDER BY g.game_date ASC`,
      args: [lineUserId],
    });

    const waitResult = await db.execute({
      sql: `SELECT w.*, g.title, g.game_date, g.game_time, g.location
            FROM waitlist w
            JOIN games g ON w.game_id = g.id
            WHERE w.line_user_id = ? AND g.status != 'cancelled'
            ORDER BY g.game_date ASC`,
      args: [lineUserId],
    });

    return jsonRes(res, 200, {
      registrations: regResult.rows.map((r) => ({
        id: r.id,
        gameId: r.game_id,
        title: r.title,
        gameDate: r.game_date,
        gameTime: r.game_time,
        location: r.location,
        displayName: r.display_name,
        registeredAt: r.registered_at,
      })),
      waitlist: waitResult.rows.map((w) => ({
        id: w.id,
        gameId: w.game_id,
        title: w.title,
        gameDate: w.game_date,
        gameTime: w.game_time,
        location: w.location,
        displayName: w.display_name,
        position: w.position,
        joinedAt: w.joined_at,
      })),
    });
  } catch (error) {
    console.error('[Registration] 取得紀錄失敗:', error);
    return jsonRes(res, 500, { error: '取得紀錄失敗' });
  }
};
