/**
 * 球局路由 — CRUD + 列表/詳情
 */
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { verifyLiffToken, optionalVerifyLiffToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

/**
 * GET /api/games
 * 取得所有球局列表
 * 回傳每場球局的報名人數與候補人數
 */
router.get('/', async (req, res) => {
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

    res.json({ games });
  } catch (error) {
    console.error('[Games] 取得列表失敗:', error);
    res.status(500).json({ error: '取得球局列表失敗' });
  }
});

/**
 * GET /api/games/:id
 * 取得單場球局詳情（含報名名單與候補名單）
 */
router.get('/:id', optionalVerifyLiffToken, async (req, res) => {
  const gameId = req.params.id;

  try {
    // 取得球局資料
    const gameResult = await db.execute({
      sql: `SELECT * FROM games WHERE id = ? AND status != 'cancelled'`,
      args: [gameId],
    });

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: '找不到此球局' });
    }

    const g = gameResult.rows[0];

    // 取得報名名單
    const regResult = await db.execute({
      sql: `SELECT id, line_user_id, display_name, registered_at
            FROM registrations WHERE game_id = ?
            ORDER BY registered_at ASC`,
      args: [gameId],
    });

    // 取得候補名單
    const waitResult = await db.execute({
      sql: `SELECT id, line_user_id, display_name, joined_at, position
            FROM waitlist WHERE game_id = ?
            ORDER BY position ASC`,
      args: [gameId],
    });

    const registeredCount = regResult.rows.length;
    const isFull = registeredCount >= g.max_players;

    // 判斷當前使用者是否已報名 / 已候補
    let myRegistration = null;
    let myWaitlist = null;
    if (req.user) {
      const myReg = regResult.rows.find((r) => r.line_user_id === req.user.lineUserId);
      if (myReg) myRegistration = { id: myReg.id, displayName: myReg.display_name };

      const myWait = waitResult.rows.find((w) => w.line_user_id === req.user.lineUserId);
      if (myWait) myWaitlist = { id: myWait.id, displayName: myWait.display_name, position: myWait.position };
    }

    res.json({
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
      isAdmin: req.user ? await require('../middleware/admin').isAdmin(req.user.lineUserId) : false,
    });
  } catch (error) {
    console.error('[Games] 取得詳情失敗:', error);
    res.status(500).json({ error: '取得球局詳情失敗' });
  }
});

/**
 * POST /api/games
 * 新增球局（管理者限定）
 */
router.post('/', verifyLiffToken, requireAdmin, async (req, res) => {
  const { title, gameDate, gameTime, location, notes, price, maxPlayers } = req.body;

  if (!gameDate || !gameTime || !location) {
    return res.status(400).json({ error: '日期、時間、地點為必填' });
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

    res.status(201).json({ id: Number(result.lastInsertRowid), message: '球局已建立' });
  } catch (error) {
    console.error('[Games] 新增失敗:', error);
    res.status(500).json({ error: '新增球局失敗' });
  }
});

/**
 * PUT /api/games/:id
 * 修改球局（管理者限定）
 */
router.put('/:id', verifyLiffToken, requireAdmin, async (req, res) => {
  const gameId = req.params.id;
  const { title, gameDate, gameTime, location, notes, price, maxPlayers, status } = req.body;

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
      args: [title, gameDate, gameTime, location, notes, price, maxPlayers, status, gameId],
    });

    res.json({ message: '球局已更新' });
  } catch (error) {
    console.error('[Games] 修改失敗:', error);
    res.status(500).json({ error: '修改球局失敗' });
  }
});

/**
 * DELETE /api/games/:id
 * 刪除球局（管理者限定，軟刪除設為 cancelled）
 */
router.delete('/:id', verifyLiffToken, requireAdmin, async (req, res) => {
  const gameId = req.params.id;

  try {
    await db.execute({
      sql: `UPDATE games SET status = 'cancelled', updated_at = datetime('now', '+8 hours') WHERE id = ?`,
      args: [gameId],
    });

    res.json({ message: '球局已刪除' });
  } catch (error) {
    console.error('[Games] 刪除失敗:', error);
    res.status(500).json({ error: '刪除球局失敗' });
  }
});

module.exports = router;
