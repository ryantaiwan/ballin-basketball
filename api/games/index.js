/**
 * GET /api/games       — 取得所有球局列表
 * POST /api/games      — 新增球局（管理者）
 */
const { db, ensureSchema } = require('../_lib/db');
const { verifyLiffToken } = require('../_lib/auth');
const { requireAdmin } = require('../_lib/admin');
const { handlePreflight, jsonRes } = require('../_lib/utils');

module.exports = async (req, res) => {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') {
    try {
      const result = await db.execute(`
        SELECT
          g.*,
          (SELECT COUNT(*) FROM registrations r WHERE r.game_id = g.id) AS reg_count,
          (SELECT COUNT(*) FROM waitlist w WHERE w.game_id = g.id) AS wait_count
        FROM games g
        WHERE g.status != 'cancelled'
        ORDER BY g.game_date ASC, g.game_time ASC
      `);

      const games = result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        gameDate: row.game_date,
        gameTime: row.game_time,
        location: row.location,
        notes: row.notes,
        notesShort: (row.notes || '').substring(0, 200),
        price: row.price,
        maxPlayers: row.max_players,
        status: row.status,
        registeredCount: row.reg_count,
        waitlistCount: row.wait_count,
        isFull: row.reg_count >= row.max_players,
      }));

      return jsonRes(res, 200, { games });
    } catch (error) {
      console.error('[Games] 取得列表失敗:', error);
      return jsonRes(res, 500, { error: '取得球局列表失敗' });
    }
  }

  if (req.method === 'POST') {
    // 驗證管理者
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    const { title, gameDate, gameTime, location, notes, price, maxPlayers } = req.body;

    if (!gameDate || !gameTime || !location) {
      return jsonRes(res, 400, { error: '日期、時間、地點為必填' });
    }

    try {
      const result = await db.execute({
        sql: `INSERT INTO games (title, game_date, game_time, location, notes, price, max_players)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          title || '球局',
          gameDate,
          gameTime,
          location,
          notes || '',
          price || 0,
          maxPlayers || 20,
        ],
      });

      return jsonRes(res, 201, { id: Number(result.lastInsertRowid), message: '球局已建立' });
    } catch (error) {
      console.error('[Games] 新增失敗:', error);
      return jsonRes(res, 500, { error: '新增球局失敗' });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
