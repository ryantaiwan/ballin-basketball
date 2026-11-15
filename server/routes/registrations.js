/**
 * 報名/候補路由
 * - 報名球局
 * - 加入候補
 * - 退出球局（含候補自動遞補 + LINE 通知）
 * - 更新顯示名稱
 */
const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { verifyLiffToken } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const { pushMessage, pushMultiMessage } = require('../utils/lineNotify');

/**
 * POST /api/registrations/:gameId/register
 * 報名球局（正式報名）
 */
router.post('/:gameId/register', verifyLiffToken, async (req, res) => {
  const gameId = req.params.gameId;
  const { displayName } = req.body;
  const lineUserId = req.user.lineUserId;
  const name = displayName || req.user.displayName || '未知';

  try {
    // 檢查球局是否存在
    const gameResult = await db.execute({
      sql: `SELECT * FROM games WHERE id = ? AND status = 'open'`,
      args: [gameId],
    });
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: '球局不存在或已關閉' });
    }
    const game = gameResult.rows[0];

    // 檢查是否已報名
    const existingReg = await db.execute({
      sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ?`,
      args: [gameId, lineUserId],
    });
    if (existingReg.rows.length > 0) {
      return res.status(400).json({ error: '您已報名此球局' });
    }

    // 檢查是否已在候補
    const existingWait = await db.execute({
      sql: `SELECT * FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
      args: [gameId, lineUserId],
    });

    // 檢查人數是否已滿
    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM registrations WHERE game_id = ?`,
      args: [gameId],
    });
    const currentCount = Number(countResult.rows[0].cnt);

    if (currentCount < game.max_players) {
      // 正式報名
      // 若在候補中，先移除
      if (existingWait.rows.length > 0) {
        await db.execute({
          sql: `DELETE FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
          args: [gameId, lineUserId],
        });
        // 重新排列候補順位
        await reorderWaitlist(gameId);
      }

      await db.execute({
        sql: `INSERT INTO registrations (game_id, line_user_id, display_name) VALUES (?, ?, ?)`,
        args: [gameId, lineUserId, name],
      });

      res.json({ type: 'registered', message: '報名成功！' });
    } else {
      // 人數已滿，加入候補
      // 若已在候補則不重複加入
      if (existingWait.rows.length > 0) {
        return res.status(400).json({ error: '您已在候補名單中' });
      }

      // 取得候補最大順位
      const maxPosResult = await db.execute({
        sql: `SELECT COALESCE(MAX(position), 0) as max_pos FROM waitlist WHERE game_id = ?`,
        args: [gameId],
      });
      const nextPosition = Number(maxPosResult.rows[0].max_pos) + 1;

      await db.execute({
        sql: `INSERT INTO waitlist (game_id, line_user_id, display_name, position) VALUES (?, ?, ?, ?)`,
        args: [gameId, lineUserId, name, nextPosition],
      });

      res.json({ type: 'waitlist', message: `人數已滿，已加入候補（第 ${nextPosition} 順位）` });
    }
  } catch (error) {
    console.error('[Registration] 報名失敗:', error);
    res.status(500).json({ error: '報名失敗' });
  }
});

/**
 * POST /api/registrations/:gameId/leave
 * 退出球局
 * - 本人或管理者可操作
 * - 退出後候補第一位自動遞補
 * - LINE 通知退出者及遞補者
 */
router.post('/:gameId/leave', verifyLiffToken, async (req, res) => {
  const gameId = req.params.gameId;
  const { targetUserId } = req.body; // 管理者指定退出的對象，不傳則退出自己
  const requesterId = req.user.lineUserId;
  const lineUserId = targetUserId || requesterId;

  try {
    // 若指定了 targetUserId 且不是自己，需檢查管理者權限
    if (targetUserId && targetUserId !== requesterId) {
      const admin = await isAdmin(requesterId);
      if (!admin) {
        return res.status(403).json({ error: '只能退出自己的報名，管理者可退出他人' });
      }
    }

    // 取得球局資訊（用於通知訊息）
    const gameResult = await db.execute({
      sql: `SELECT * FROM games WHERE id = ?`,
      args: [gameId],
    });
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: '球局不存在' });
    }
    const game = gameResult.rows[0];
    const gameInfo = `${game.game_date} ${game.game_time} ${game.location}`;

    // 檢查是否在正式報名中
    const regResult = await db.execute({
      sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ?`,
      args: [gameId, lineUserId],
    });

    // 檢查是否在候補中
    const waitResult = await db.execute({
      sql: `SELECT * FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
      args: [gameId, lineUserId],
    });

    if (regResult.rows.length === 0 && waitResult.rows.length === 0) {
      return res.status(400).json({ error: '您未報名此球局' });
    }

    const leaverName = regResult.rows.length > 0
      ? regResult.rows[0].display_name
      : waitResult.rows[0].display_name;

    // === 情況 1: 退出正式報名 ===
    if (regResult.rows.length > 0) {
      // 刪除報名記錄
      await db.execute({
        sql: `DELETE FROM registrations WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });

      // LINE 通知退出者
      await pushMessage(
        lineUserId,
        `【退出通知】您已退出球局：\n${gameInfo}\n如有需要請重新報名。`
      );

      // 候補自動遞補 — 取候補第一位
      const firstWaitResult = await db.execute({
        sql: `SELECT * FROM waitlist WHERE game_id = ? ORDER BY position ASC LIMIT 1`,
        args: [gameId],
      });

      if (firstWaitResult.rows.length > 0) {
        const firstWait = firstWaitResult.rows[0];

        // 將候補第一位移至正式報名
        await db.execute({
          sql: `INSERT INTO registrations (game_id, line_user_id, display_name) VALUES (?, ?, ?)`,
          args: [gameId, firstWait.line_user_id, firstWait.display_name],
        });

        // 從候補表中刪除
        await db.execute({
          sql: `DELETE FROM waitlist WHERE id = ?`,
          args: [firstWait.id],
        });

        // 重新排列剩餘候補順位
        await reorderWaitlist(gameId);

        // LINE 通知遞補者
        await pushMessage(
          firstWait.line_user_id,
          `【自動遞補通知】恭喜！您已自動遞補進入球局：\n${gameInfo}\n因「${leaverName}」退出，您由候補轉為正式報名。`
        );

        // 通知所有剩餘候補者順位變動
        const remainingWaitResult = await db.execute({
          sql: `SELECT line_user_id, display_name, position FROM waitlist WHERE game_id = ? ORDER BY position ASC`,
          args: [gameId],
        });
        for (const w of remainingWaitResult.rows) {
          await pushMessage(
            w.line_user_id,
            `【候補順位更新】球局：${gameInfo}\n您目前的候補順位為第 ${w.position} 位。`
          );
        }

        res.json({
          message: '退出成功',
          promoted: {
            lineUserId: firstWait.line_user_id,
            displayName: firstWait.display_name,
          },
        });
      } else {
        res.json({ message: '退出成功，無候補需遞補' });
      }
      return;
    }

    // === 情況 2: 退出候補 ===
    if (waitResult.rows.length > 0) {
      await db.execute({
        sql: `DELETE FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });

      // 重新排列候補順位
      await reorderWaitlist(gameId);

      // LINE 通知退出者
      await pushMessage(
        lineUserId,
        `【退出通知】您已退出候補：\n${gameInfo}\n如有需要請重新加入候補。`
      );

      res.json({ message: '已退出候補' });
    }
  } catch (error) {
    console.error('[Registration] 退出失敗:', error);
    res.status(500).json({ error: '退出失敗' });
  }
});

/**
 * PUT /api/registrations/:gameId/name
 * 更新報名者的顯示名稱
 */
router.put('/:gameId/name', verifyLiffToken, async (req, res) => {
  const gameId = req.params.gameId;
  const { displayName } = req.body;
  const lineUserId = req.user.lineUserId;

  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: '名稱不可為空' });
  }

  try {
    // 更新報名表
    await db.execute({
      sql: `UPDATE registrations SET display_name = ? WHERE game_id = ? AND line_user_id = ?`,
      args: [displayName.trim(), gameId, lineUserId],
    });

    // 更新候補表
    await db.execute({
      sql: `UPDATE waitlist SET display_name = ? WHERE game_id = ? AND line_user_id = ?`,
      args: [displayName.trim(), gameId, lineUserId],
    });

    res.json({ message: '名稱已更新', displayName: displayName.trim() });
  } catch (error) {
    console.error('[Registration] 更新名稱失敗:', error);
    res.status(500).json({ error: '更新名稱失敗' });
  }
});

/**
 * GET /api/registrations/me
 * 取得當前使用者的所有報名紀錄
 */
router.get('/me', verifyLiffToken, async (req, res) => {
  const lineUserId = req.user.lineUserId;

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

    res.json({
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
    res.status(500).json({ error: '取得紀錄失敗' });
  }
});

/**
 * 重新排列候補順位（內部函式）
 */
async function reorderWaitlist(gameId) {
  const result = await db.execute({
    sql: `SELECT id FROM waitlist WHERE game_id = ? ORDER BY position ASC`,
    args: [gameId],
  });

  for (let i = 0; i < result.rows.length; i++) {
    await db.execute({
      sql: `UPDATE waitlist SET position = ? WHERE id = ?`,
      args: [i + 1, result.rows[i].id],
    });
  }
}

module.exports = router;
