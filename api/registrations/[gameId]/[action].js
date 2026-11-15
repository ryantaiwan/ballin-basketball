/**
 * POST /api/registrations/[gameId]/register  — 報名球局（正式/候補）
 * POST /api/registrations/[gameId]/leave     — 退出球局（含自動遞補 + LINE 通知）
 * PUT  /api/registrations/[gameId]/name      — 更新顯示名稱
 */
const { db } = require('../../_lib/db');
const { verifyLiffToken } = require('../../_lib/auth');
const { isAdmin } = require('../../_lib/admin');
const { pushMessage } = require('../../_lib/lineNotify');
const { handlePreflight, jsonRes } = require('../../_lib/utils');

/**
 * 重新排列候補順位
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  const gameId = req.query.gameId;
  const action = req.query.action; // register / leave / name

  if (!gameId) {
    return jsonRes(res, 400, { error: '缺少球局 ID' });
  }

  // 驗證 LIFF Token（所有操作都需要）
  const { user, error, status } = await verifyLiffToken(req.headers);
  if (error) return jsonRes(res, status, { error });

  // ===== 報名 =====
  if (action === 'register' && req.method === 'POST') {
    const { displayName } = req.body;
    const lineUserId = user.lineUserId;
    const name = displayName || user.displayName || '未知';

    try {
      // 檢查球局
      const gameResult = await db.execute({
        sql: `SELECT * FROM games WHERE id = ? AND status = 'open'`,
        args: [gameId],
      });
      if (gameResult.rows.length === 0) {
        return jsonRes(res, 404, { error: '球局不存在或已關閉' });
      }
      const game = gameResult.rows[0];

      // 檢查是否已報名
      const existingReg = await db.execute({
        sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });
      if (existingReg.rows.length > 0) {
        return jsonRes(res, 400, { error: '您已報名此球局' });
      }

      // 檢查是否已在候補
      const existingWait = await db.execute({
        sql: `SELECT * FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });

      // 檢查人數
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM registrations WHERE game_id = ?`,
        args: [gameId],
      });
      const currentCount = Number(countResult.rows[0].cnt);

      if (currentCount < game.max_players) {
        // 正式報名
        if (existingWait.rows.length > 0) {
          await db.execute({
            sql: `DELETE FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
            args: [gameId, lineUserId],
          });
          await reorderWaitlist(gameId);
        }

        await db.execute({
          sql: `INSERT INTO registrations (game_id, line_user_id, display_name) VALUES (?, ?, ?)`,
          args: [gameId, lineUserId, name],
        });

        return jsonRes(res, 200, { type: 'registered', message: '報名成功！' });
      } else {
        // 加入候補
        if (existingWait.rows.length > 0) {
          return jsonRes(res, 400, { error: '您已在候補名單中' });
        }

        const maxPosResult = await db.execute({
          sql: `SELECT COALESCE(MAX(position), 0) as max_pos FROM waitlist WHERE game_id = ?`,
          args: [gameId],
        });
        const nextPosition = Number(maxPosResult.rows[0].max_pos) + 1;

        await db.execute({
          sql: `INSERT INTO waitlist (game_id, line_user_id, display_name, position) VALUES (?, ?, ?, ?)`,
          args: [gameId, lineUserId, name, nextPosition],
        });

        return jsonRes(res, 200, { type: 'waitlist', message: `人數已滿，已加入候補（第 ${nextPosition} 順位）` });
      }
    } catch (error) {
      console.error('[Registration] 報名失敗:', error);
      return jsonRes(res, 500, { error: '報名失敗' });
    }
  }

  // ===== 退出 =====
  if (action === 'leave' && req.method === 'POST') {
    const { targetUserId } = req.body;
    const requesterId = user.lineUserId;
    const lineUserId = targetUserId || requesterId;

    try {
      // 若指定 targetUserId 且不是自己，需管理者權限
      if (targetUserId && targetUserId !== requesterId) {
        const admin = await isAdmin(requesterId);
        if (!admin) {
          return jsonRes(res, 403, { error: '只能退出自己的報名，管理者可退出他人' });
        }
      }

      const gameResult = await db.execute({
        sql: `SELECT * FROM games WHERE id = ?`,
        args: [gameId],
      });
      if (gameResult.rows.length === 0) {
        return jsonRes(res, 404, { error: '球局不存在' });
      }
      const game = gameResult.rows[0];
      const gameInfo = `${game.game_date} ${game.game_time} ${game.location}`;

      const regResult = await db.execute({
        sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });

      const waitResult = await db.execute({
        sql: `SELECT * FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });

      if (regResult.rows.length === 0 && waitResult.rows.length === 0) {
        return jsonRes(res, 400, { error: '未報名此球局' });
      }

      const leaverName = regResult.rows.length > 0
        ? regResult.rows[0].display_name
        : waitResult.rows[0].display_name;

      // === 退出正式報名 ===
      if (regResult.rows.length > 0) {
        await db.execute({
          sql: `DELETE FROM registrations WHERE game_id = ? AND line_user_id = ?`,
          args: [gameId, lineUserId],
        });

        // LINE 通知退出者
        await pushMessage(
          lineUserId,
          `【退出通知】您已退出球局：\n${gameInfo}\n如有需要請重新報名。`
        );

        // 候補自動遞補
        const firstWaitResult = await db.execute({
          sql: `SELECT * FROM waitlist WHERE game_id = ? ORDER BY position ASC LIMIT 1`,
          args: [gameId],
        });

        if (firstWaitResult.rows.length > 0) {
          const firstWait = firstWaitResult.rows[0];

          await db.execute({
            sql: `INSERT INTO registrations (game_id, line_user_id, display_name) VALUES (?, ?, ?)`,
            args: [gameId, firstWait.line_user_id, firstWait.display_name],
          });

          await db.execute({
            sql: `DELETE FROM waitlist WHERE id = ?`,
            args: [firstWait.id],
          });

          await reorderWaitlist(gameId);

          // LINE 通知遞補者
          await pushMessage(
            firstWait.line_user_id,
            `【自動遞補通知】恭喜！您已自動遞補進入球局：\n${gameInfo}\n因「${leaverName}」退出，您由候補轉為正式報名。`
          );

          // 通知其他候補者順位變動
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

          return jsonRes(res, 200, {
            message: '退出成功',
            promoted: {
              lineUserId: firstWait.line_user_id,
              displayName: firstWait.display_name,
            },
          });
        } else {
          return jsonRes(res, 200, { message: '退出成功，無候補需遞補' });
        }
      }

      // === 退出候補 ===
      if (waitResult.rows.length > 0) {
        await db.execute({
          sql: `DELETE FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
          args: [gameId, lineUserId],
        });

        await reorderWaitlist(gameId);

        await pushMessage(
          lineUserId,
          `【退出通知】您已退出候補：\n${gameInfo}\n如有需要請重新加入候補。`
        );

        return jsonRes(res, 200, { message: '已退出候補' });
      }
    } catch (error) {
      console.error('[Registration] 退出失敗:', error);
      return jsonRes(res, 500, { error: '退出失敗' });
    }
  }

  // ===== 更新名稱 =====
  if (action === 'name' && req.method === 'PUT') {
    const { displayName } = req.body;
    const lineUserId = user.lineUserId;

    if (!displayName || !displayName.trim()) {
      return jsonRes(res, 400, { error: '名稱不可為空' });
    }

    try {
      await db.execute({
        sql: `UPDATE registrations SET display_name = ? WHERE game_id = ? AND line_user_id = ?`,
        args: [displayName.trim(), gameId, lineUserId],
      });

      await db.execute({
        sql: `UPDATE waitlist SET display_name = ? WHERE game_id = ? AND line_user_id = ?`,
        args: [displayName.trim(), gameId, lineUserId],
      });

      return jsonRes(res, 200, { message: '名稱已更新', displayName: displayName.trim() });
    } catch (error) {
      console.error('[Registration] 更新名稱失敗:', error);
      return jsonRes(res, 500, { error: '更新名稱失敗' });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
