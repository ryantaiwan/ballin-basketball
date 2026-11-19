/**
 * POST /api/registrations/[gameId]/register  — 報名球局（正式/候補）
 * POST /api/registrations/[gameId]/leave     — 退出球局（含自動遞補 + LINE 通知）
 * PUT  /api/registrations/[gameId]/name      — 更新顯示名稱
 * PUT  /api/registrations/[gameId]/payment   — 選擇/修改付款方式（本人）
 * POST /api/registrations/[gameId]/mark-paid — 管理者標記已收款
 */
const { db } = require('../../_lib/db');
const { verifyLiffToken } = require('../../_lib/auth');
const { isAdmin } = require('../../_lib/admin');
const { pushMessage } = require('../../_lib/lineNotify');
const { handlePreflight, jsonRes } = require('../../_lib/utils');
const { buildPromoteMessage } = require('../../_lib/flexMessage');

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

/**
 * 確保付款紀錄存在（報名時自動建立，預設付款方式為「現金」）
 */
async function ensurePaymentRecord(gameId, lineUserId, displayName) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO payments (game_id, line_user_id, display_name, payment_method) VALUES (?, ?, ?, '現金')`,
    args: [gameId, lineUserId, displayName],
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  const gameId = req.query.gameId;
  const action = req.query.action;
  if (!gameId) return jsonRes(res, 400, { error: '缺少球局 ID' });

  const { user, error, status } = await verifyLiffToken(req.headers);
  if (error) return jsonRes(res, status, { error });

  // ===== 臨打代報 =====
  if (action === 'guest-register' && req.method === 'POST') {
    const { guestName } = req.body;
    const reporterId = user.lineUserId;
    const reporterName = user.displayName || '代報人';

    if (!guestName || !guestName.trim()) {
      return jsonRes(res, 400, { error: '請輸入臨打人員名稱' });
    }

    const guestNameTrimmed = guestName.trim();

    try {
      const gameResult = await db.execute({
        sql: `SELECT * FROM games WHERE id = ? AND status = 'open'`,
        args: [gameId],
      });
      if (gameResult.rows.length === 0) {
        return jsonRes(res, 404, { error: '球局不存在或未發佈' });
      }
      const game = gameResult.rows[0];

      // 檢查球局發佈後是否滿 24 小時
      const publishedAt = game.published_at || '';
      if (!publishedAt) {
        return jsonRes(res, 400, { error: '球局尚未發佈，無法臨打代報' });
      }
      const publishedTime = new Date(String(publishedAt).replace(' ', 'T'));
      const hoursSincePublished = (new Date().getTime() - publishedTime.getTime()) / (60 * 60 * 1000);
      if (hoursSincePublished < 24) {
        return jsonRes(res, 400, { error: `球局發佈未滿24小時（目前 ${Math.floor(hoursSincePublished)} 小時），無法臨打代報` });
      }

      // 檢查代報人自己是否有報名
      const reporterReg = await db.execute({
        sql: `SELECT 1 FROM registrations WHERE game_id = ? AND line_user_id = ? AND is_guest = 0`,
        args: [gameId, reporterId],
      });
      const reporterWait = await db.execute({
        sql: `SELECT 1 FROM waitlist WHERE game_id = ? AND line_user_id = ? AND is_guest = 0`,
        args: [gameId, reporterId],
      });
      if (reporterReg.rows.length === 0 && reporterWait.rows.length === 0) {
        return jsonRes(res, 400, { error: '您必須先報名此球局才能代報臨打' });
      }

      // 組合臨打顯示名稱格式：臨打 {guestName} {reporterName}[友]
      const guestDisplayName = `臨打 ${guestNameTrimmed} ${reporterName}[友]`;

      // 使用代報人的 line_user_id + 臨打名稱作為唯一鍵
      // 檢查是否已存在相同代報
      const existingGuest = await db.execute({
        sql: `SELECT 1 FROM registrations WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
        args: [gameId, reporterId, guestDisplayName],
      });
      if (existingGuest.rows.length > 0) {
        return jsonRes(res, 400, { error: '此臨打人員已代報' });
      }

      const existingGuestWait = await db.execute({
        sql: `SELECT 1 FROM waitlist WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
        args: [gameId, reporterId, guestDisplayName],
      });
      if (existingGuestWait.rows.length > 0) {
        return jsonRes(res, 400, { error: '此臨打人員已在候補中' });
      }

      // 檢查正選名額
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM registrations WHERE game_id = ?`,
        args: [gameId],
      });
      const currentCount = Number(countResult.rows[0].cnt);

      if (currentCount < game.max_players) {
        // 有正選名額 → 加入正選
        await db.execute({
          sql: `INSERT INTO registrations (game_id, line_user_id, display_name, is_guest, guest_reporter) VALUES (?, ?, ?, 1, ?)`,
          args: [gameId, reporterId, guestDisplayName, reporterName],
        });

        // 建立付款紀錄（臨打付款方式固定「不限定」）
        await db.execute({
          sql: `INSERT OR IGNORE INTO payments (game_id, line_user_id, display_name, payment_method, is_guest) VALUES (?, ?, ?, '不限定', 1)`,
          args: [gameId, reporterId, guestDisplayName],
        });

        return jsonRes(res, 200, { type: 'registered', message: `臨打代報成功：${guestNameTrimmed} 已加入正選名單` });
      } else {
        // 超過人數上限 → 加入候補
        const maxPosResult = await db.execute({
          sql: `SELECT COALESCE(MAX(position), 0) as max_pos FROM waitlist WHERE game_id = ?`,
          args: [gameId],
        });
        const nextPosition = Number(maxPosResult.rows[0].max_pos) + 1;

        await db.execute({
          sql: `INSERT INTO waitlist (game_id, line_user_id, display_name, position, is_guest, guest_reporter) VALUES (?, ?, ?, ?, 1, ?)`,
          args: [gameId, reporterId, guestDisplayName, nextPosition, reporterName],
        });

        return jsonRes(res, 200, { type: 'waitlist', message: `人數已滿，臨打 ${guestNameTrimmed} 已加入候補（第 ${nextPosition} 順位）` });
      }
    } catch (error) {
      console.error('[Registration] 臨打代報失敗:', error);
      return jsonRes(res, 500, { error: '臨打代報失敗: ' + error.message });
    }
  }

  // ===== 報名 =====
  if (action === 'register' && req.method === 'POST') {
    const { displayName } = req.body;
    const lineUserId = user.lineUserId;
    const name = displayName || user.displayName || '未知';

    try {
      const gameResult = await db.execute({
        sql: `SELECT * FROM games WHERE id = ? AND status = 'open'`,
        args: [gameId],
      });
      if (gameResult.rows.length === 0) {
        return jsonRes(res, 404, { error: '球局不存在或已關閉' });
      }
      const game = gameResult.rows[0];

      // 檢查報名截止時間：超過球局開始時間則不能再報名
      const gameStartStr = `${game.game_date} ${game.game_time}`;
      const gameStart = new Date(gameStartStr.replace(' ', 'T'));
      if (new Date() >= gameStart) {
        return jsonRes(res, 400, { error: '報名已截止' });
      }

      const existingReg = await db.execute({
        sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });
      if (existingReg.rows.length > 0) {
        return jsonRes(res, 400, { error: '您已報名此球局' });
      }

      const existingWait = await db.execute({
        sql: `SELECT * FROM waitlist WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });

      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM registrations WHERE game_id = ?`,
        args: [gameId],
      });
      const currentCount = Number(countResult.rows[0].cnt);

      if (currentCount < game.max_players) {
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

        // 自動建立空白付款紀錄
        await ensurePaymentRecord(gameId, lineUserId, name);

        return jsonRes(res, 200, { type: 'registered', message: '報名成功！' });
      } else {
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
      return jsonRes(res, 500, { error: '報名失敗: ' + error.message });
    }
  }

  // ===== 退出 =====
  if (action === 'leave' && req.method === 'POST') {
    const { targetUserId, targetDisplayName } = req.body;
    const requesterId = user.lineUserId;
    const lineUserId = targetUserId || requesterId;

    try {
      // 權限檢查：如果是退出他人，需要管理者權限
      // 臨打代報的退出：代報人可以退出自己代報的臨打，管理者也可以
      if (targetUserId && targetUserId !== requesterId) {
        const admin = await isAdmin(requesterId);
        if (!admin) {
          // 非管理者 → 檢查是否為代報人自己（代報臨打使用代報人的 line_user_id）
          if (targetUserId !== requesterId) {
            return jsonRes(res, 403, { error: '只能退出自己的報名，管理者或代報人可退出臨打' });
          }
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

      // 檢查退出截止時間：非管理者超過截止時間不能退出
      if (game.quit_deadline) {
        const quitDeadlineDate = new Date(game.quit_deadline.replace(' ', 'T'));
        if (new Date() > quitDeadlineDate) {
          const isAdminUser = await isAdmin(requesterId);
          if (!isAdminUser) {
            return jsonRes(res, 400, { error: '已超過退出截止時間，如需退出請聯繫管理者' });
          }
        }
      }

      const gameInfo = `${game.game_date} ${game.game_time} ${game.location}`;

      // 如果有指定 targetDisplayName（臨打退出），用 line_user_id + display_name 精確匹配
      const useDisplayName = !!targetDisplayName;

      const regResult = useDisplayName
        ? await db.execute({
            sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
            args: [gameId, lineUserId, targetDisplayName],
          })
        : await db.execute({
            sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ? AND is_guest = 0`,
            args: [gameId, lineUserId],
          });

      const waitResult = useDisplayName
        ? await db.execute({
            sql: `SELECT * FROM waitlist WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
            args: [gameId, lineUserId, targetDisplayName],
          })
        : await db.execute({
            sql: `SELECT * FROM waitlist WHERE game_id = ? AND line_user_id = ? AND is_guest = 0`,
            args: [gameId, lineUserId],
          });

      if (regResult.rows.length === 0 && waitResult.rows.length === 0) {
        return jsonRes(res, 400, { error: '未報名此球局' });
      }

      const leaverName = regResult.rows.length > 0
        ? regResult.rows[0].display_name
        : waitResult.rows[0].display_name;

      if (regResult.rows.length > 0) {
        const regRow = regResult.rows[0];
        const isGuest = regRow.is_guest === 1;

        // 刪除正選（用 display_name 精確匹配）
        await db.execute({
          sql: `DELETE FROM registrations WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
          args: [gameId, lineUserId, regRow.display_name],
        });
        // 同時刪除付款紀錄
        await db.execute({
          sql: `DELETE FROM payments WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
          args: [gameId, lineUserId, regRow.display_name],
        });

        await pushMessage(lineUserId, `【退出通知】您已退出球局：\n${gameInfo}\n如有需要請重新報名。`);

        const firstWaitResult = await db.execute({
          sql: `SELECT * FROM waitlist WHERE game_id = ? ORDER BY position ASC LIMIT 1`,
          args: [gameId],
        });

        if (firstWaitResult.rows.length > 0) {
          const firstWait = firstWaitResult.rows[0];

          await db.execute({
            sql: `INSERT INTO registrations (game_id, line_user_id, display_name, is_guest, guest_reporter) VALUES (?, ?, ?, ?, ?)`,
            args: [gameId, firstWait.line_user_id, firstWait.display_name, firstWait.is_guest || 0, firstWait.guest_reporter || ''],
          });
          // 為遞補者建立付款紀錄
          await ensurePaymentRecord(gameId, firstWait.line_user_id, firstWait.display_name);

          await db.execute({
            sql: `DELETE FROM waitlist WHERE id = ?`,
            args: [firstWait.id],
          });
          await reorderWaitlist(gameId);

          await pushMessage(
            firstWait.line_user_id,
            buildPromoteMessage(
              {
                title: game.title || '球局',
                gameDate: game.game_date,
                gameTime: game.game_time,
                endTime: game.end_time || '',
                location: game.location,
              },
              firstWait.display_name,
              leaverName
            )
          );

          const remainingWaitResult = await db.execute({
            sql: `SELECT line_user_id, display_name, position FROM waitlist WHERE game_id = ? ORDER BY position ASC`,
            args: [gameId],
          });
          for (const w of remainingWaitResult.rows) {
            await pushMessage(w.line_user_id, `【候補順位更新】球局：${gameInfo}\n您目前的候補順位為第 ${w.position} 位。`);
          }

          return jsonRes(res, 200, {
            message: '退出成功',
            promoted: { lineUserId: firstWait.line_user_id, displayName: firstWait.display_name },
          });
        } else {
          return jsonRes(res, 200, { message: '退出成功，無候補需遞補' });
        }
      }

      if (waitResult.rows.length > 0) {
        const waitRow = waitResult.rows[0];
        await db.execute({
          sql: `DELETE FROM waitlist WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
          args: [gameId, lineUserId, waitRow.display_name],
        });
        await reorderWaitlist(gameId);
        await pushMessage(lineUserId, `【退出通知】您已退出候補：\n${gameInfo}\n如有需要請重新加入候補。`);
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
      await db.execute({
        sql: `UPDATE payments SET display_name = ? WHERE game_id = ? AND line_user_id = ?`,
        args: [displayName.trim(), gameId, lineUserId],
      });
      return jsonRes(res, 200, { message: '名稱已更新', displayName: displayName.trim() });
    } catch (error) {
      console.error('[Registration] 更新名稱失敗:', error);
      return jsonRes(res, 500, { error: '更新名稱失敗' });
    }
  }

  // ===== 選擇/修改付款方式（本人） =====
  if (action === 'payment' && req.method === 'PUT') {
    const { paymentMethod } = req.body;
    const lineUserId = user.lineUserId;
    if (!paymentMethod) {
      return jsonRes(res, 400, { error: '請選擇付款方式' });
    }
    try {
      // 確認有報名
      const regResult = await db.execute({
        sql: `SELECT * FROM registrations WHERE game_id = ? AND line_user_id = ?`,
        args: [gameId, lineUserId],
      });
      if (regResult.rows.length === 0) {
        return jsonRes(res, 400, { error: '您未報名此球局' });
      }

      await db.execute({
        sql: `UPDATE payments SET payment_method = ?, updated_at = datetime('now', '+8 hours') WHERE game_id = ? AND line_user_id = ?`,
        args: [paymentMethod, gameId, lineUserId],
      });

      return jsonRes(res, 200, { message: '付款方式已更新', paymentMethod });
    } catch (error) {
      console.error('[Payment] 更新失敗:', error);
      return jsonRes(res, 500, { error: '更新付款方式失敗' });
    }
  }

  // ===== 管理者標記已收款/未收款 =====
  if (action === 'mark-paid' && req.method === 'POST') {
    const { targetUserId, targetDisplayName, paid } = req.body;
    const requesterId = user.lineUserId;

    const admin = await isAdmin(requesterId);
    if (!admin) {
      return jsonRes(res, 403, { error: '無管理者權限' });
    }

    const targetId = targetUserId;
    const paidValue = paid ? 1 : 0;

    try {
      if (targetDisplayName) {
        // 有指定 display_name（臨打）→ 精確匹配
        await db.execute({
          sql: `UPDATE payments SET paid = ?, paid_at = ?, updated_at = datetime('now', '+8 hours') WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
          args: [paidValue, paid ? new Date().toISOString().slice(0, 19).replace('T', ' ') : '', gameId, targetId, targetDisplayName],
        });
      } else {
        // 一般報名 → 用 line_user_id 匹配（向後相容）
        await db.execute({
          sql: `UPDATE payments SET paid = ?, paid_at = ?, updated_at = datetime('now', '+8 hours') WHERE game_id = ? AND line_user_id = ?`,
          args: [paidValue, paid ? new Date().toISOString().slice(0, 19).replace('T', ' ') : '', gameId, targetId],
        });
      }

      // 通知被標記者
      const gameResult = await db.execute({
        sql: `SELECT game_date, game_time, location FROM games WHERE id = ?`,
        args: [gameId],
      });
      if (gameResult.rows.length > 0) {
        const g = gameResult.rows[0];
        await pushMessage(
          targetId,
          paid
            ? `【收款確認】管理員已確認收到您的款項：\n${g.game_date} ${g.game_time} ${g.location}`
            : `【收款狀態變更】您的收款狀態已變更為「未收款」：\n${g.game_date} ${g.game_time} ${g.location}`
        );
      }

      return jsonRes(res, 200, { message: paid ? '已標記為已收款' : '已標記為未收款' });
    } catch (error) {
      console.error('[Payment] 標記收款失敗:', error);
      return jsonRes(res, 500, { error: '標記收款失敗' });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
