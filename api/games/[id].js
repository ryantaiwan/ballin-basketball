/**
 * GET  /api/games/[id]  — 取得球局詳情（含報名/候補名單）
 * PUT  /api/games/[id]  — 修改球局（管理者）
 * DELETE /api/games/[id] — 刪除球局（管理者，軟刪除）
 */
const { db } = require('../_lib/db');
const { verifyLiffToken, optionalVerifyLiffToken } = require('../_lib/auth');
const { isAdmin, requireAdmin } = require('../_lib/admin');
const { handlePreflight, jsonRes } = require('../_lib/utils');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  const gameId = req.query.id;

  if (!gameId) {
    return jsonRes(res, 400, { error: '缺少球局 ID' });
  }

  // === GET 詳情 ===
  if (req.method === 'GET') {
    try {
      const gameResult = await db.execute({
        sql: `SELECT * FROM games WHERE id = ? AND status != 'cancelled'`,
        args: [gameId],
      });

      if (gameResult.rows.length === 0) {
        return jsonRes(res, 404, { error: '找不到此球局' });
      }

      const g = gameResult.rows[0];

      const regResult = await db.execute({
        sql: `SELECT id, line_user_id, display_name, registered_at
              FROM registrations WHERE game_id = ?
              ORDER BY registered_at ASC`,
        args: [gameId],
      });

      const waitResult = await db.execute({
        sql: `SELECT id, line_user_id, display_name, joined_at, position
              FROM waitlist WHERE game_id = ?
              ORDER BY position ASC`,
        args: [gameId],
      });

      const registeredCount = regResult.rows.length;
      const isFull = registeredCount >= g.max_players;

      // 可選驗證使用者
      const { user } = await optionalVerifyLiffToken(req.headers);

      let myRegistration = null;
      let myWaitlist = null;
      if (user) {
        const myReg = regResult.rows.find((r) => r.line_user_id === user.lineUserId);
        if (myReg) myRegistration = { id: myReg.id, displayName: myReg.display_name };

        const myWait = waitResult.rows.find((w) => w.line_user_id === user.lineUserId);
        if (myWait) myWaitlist = { id: myWait.id, displayName: myWait.display_name, position: myWait.position };
      }

      return jsonRes(res, 200, {
        game: {
          id: g.id,
          title: g.title,
          gameDate: g.game_date,
          gameTime: g.game_time,
          location: g.location,
          notes: g.notes,
          price: g.price,
          maxPlayers: g.max_players,
          status: g.status,
          registeredCount,
          waitlistCount: waitResult.rows.length,
          isFull,
        },
        registrations: regResult.rows.map((r) => ({
          id: r.id,
          lineUserId: r.line_user_id,
          displayName: r.display_name,
          registeredAt: r.registered_at,
        })),
        waitlist: waitResult.rows.map((w) => ({
          id: w.id,
          lineUserId: w.line_user_id,
          displayName: w.display_name,
          joinedAt: w.joined_at,
          position: w.position,
        })),
        myRegistration,
        myWaitlist,
        isAdmin: user ? await isAdmin(user.lineUserId) : false,
      });
    } catch (error) {
      console.error('[Games] 取得詳情失敗:', error);
      return jsonRes(res, 500, { error: '取得球局詳情失敗' });
    }
  }

  // === PUT 修改 ===
  if (req.method === 'PUT') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    const { title, gameDate, gameTime, location, notes, price, maxPlayers, status: gameStatus } = req.body;

    try {
      await db.execute({
        sql: `UPDATE games SET
                title = COALESCE(?, title),
                game_date = COALESCE(?, game_date),
                game_time = COALESCE(?, game_time),
                location = COALESCE(?, location),
                notes = COALESCE(?, notes),
                price = COALESCE(?, price),
                max_players = COALESCE(?, max_players),
                status = COALESCE(?, status),
                updated_at = datetime('now', '+8 hours')
              WHERE id = ?`,
        args: [title, gameDate, gameTime, location, notes, price, maxPlayers, gameStatus, gameId],
      });

      return jsonRes(res, 200, { message: '球局已更新' });
    } catch (error) {
      console.error('[Games] 修改失敗:', error);
      return jsonRes(res, 500, { error: '修改球局失敗' });
    }
  }

  // === DELETE 刪除（軟刪除） ===
  if (req.method === 'DELETE') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    try {
      await db.execute({
        sql: `UPDATE games SET status = 'cancelled', updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        args: [gameId],
      });

      return jsonRes(res, 200, { message: '球局已刪除' });
    } catch (error) {
      console.error('[Games] 刪除失敗:', error);
      return jsonRes(res, 500, { error: '刪除球局失敗' });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
