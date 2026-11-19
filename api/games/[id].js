/**
 * GET  /api/games/[id]  — 取得球局詳情（含報名/候補/付款名單）
 * PUT  /api/games/[id]  — 修改球局（管理者）
 * DELETE /api/games/[id] — 刪除球局（管理者，軟刪除）
 */
const { db } = require('../_lib/db');
const { optionalVerifyLiffToken } = require('../_lib/auth');
const { isAdmin, requireAdmin } = require('../_lib/admin');
const { pushMessage, pushMultiMessage, broadcast } = require('../_lib/lineNotify');
const { handlePreflight, jsonRes } = require('../_lib/utils');
const { buildCancelMessage, buildGameCarouselMessage } = require('../_lib/flexMessage');
const { getGameWithRoster, getGameUrl } = require('../_lib/gameData');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  const gameId = req.query.id;
  if (!gameId) return jsonRes(res, 400, { error: '缺少球局 ID' });

  // === GET /api/games/[id]/flex — 回傳 Flex Message JSON（供前端 liff.sendMessages 使用）===
  if (req.method === 'GET' && req.query.flex === 'true') {
    try {
      const roster = await getGameWithRoster(gameId);
      if (!roster) {
        return jsonRes(res, 404, { error: '找不到此球局' });
      }
      const flexMessage = buildGameCarouselMessage(roster.game, {
        registrations: roster.registrations,
        waitlist: roster.waitlist,
        gameUrl: getGameUrl(gameId),
        statusLabel: '🏀 球局資訊',
        showRegisterButton: true,
      });
      return jsonRes(res, 200, flexMessage);
    } catch (error) {
      console.error('[Games] 取得 Flex JSON 失敗:', error);
      return jsonRes(res, 500, { error: '取得 Flex JSON 失敗' });
    }
  }

  // === POST /api/games/[id]?publish=true — 手動發佈排程中球局 ===
  if (req.method === 'POST' && req.query.publish === 'true') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    try {
      const gameResult = await db.execute({
        sql: `SELECT * FROM games WHERE id = ?`,
        args: [gameId],
      });
      if (gameResult.rows.length === 0) {
        return jsonRes(res, 404, { error: '找不到此球局' });
      }
      const game = gameResult.rows[0];
      if (game.status !== 'scheduled') {
        return jsonRes(res, 400, { error: '此球局不是排程中狀態，無法手動發佈' });
      }

      // 發佈：改為 open
      await db.execute({
        sql: `UPDATE games SET status = 'open', published_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        args: [gameId],
      });

      // LINE 通知：發到群組 + 所有管理者（Flex Message 卡片）
      try {
        const adminResult = await db.execute(`SELECT line_user_id FROM admins`);
        const adminIds = adminResult.rows.map((r) => r.line_user_id);

        const card = buildGameCarouselMessage(
          {
            id: game.id,
            title: game.title || '球局',
            gameDate: game.game_date,
            gameTime: game.game_time,
            endTime: game.end_time || '',
            location: game.location,
            notes: game.notes || '',
            price: game.price || 0,
            guestPrice: game.guest_price || 0,
            minPlayers: game.min_players || 0,
            maxPlayers: game.max_players || 20,
            registeredCount: 0,
            waitlistCount: 0,
          },
          {
            registrations: [],
            waitlist: [],
            gameUrl: getGameUrl(game.id),
            statusLabel: '🏀 球局開放報名',
            showRegisterButton: true,
          }
        );
        await broadcast(adminIds, card);
      } catch (notifyErr) {
        console.warn('[Games] 手動發佈 LINE 通知失敗:', notifyErr.message);
      }

      return jsonRes(res, 200, { message: '球局已發佈' });
    } catch (error) {
      console.error('[Games] 手動發佈失敗:', error);
      return jsonRes(res, 500, { error: '發佈失敗: ' + error.message });
    }
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
        sql: `SELECT id, line_user_id, display_name, registered_at, is_guest, guest_reporter
              FROM registrations WHERE game_id = ? ORDER BY registered_at ASC`,
        args: [gameId],
      });

      const waitResult = await db.execute({
        sql: `SELECT id, line_user_id, display_name, joined_at, position, is_guest, guest_reporter
              FROM waitlist WHERE game_id = ? ORDER BY position ASC`,
        args: [gameId],
      });

      // 取得付款紀錄
      const payResult = await db.execute({
        sql: `SELECT line_user_id, display_name, payment_method, paid, paid_at, is_guest
              FROM payments WHERE game_id = ?`,
        args: [gameId],
      });

      // 建立付款 lookup（用 line_user_id + display_name 作為 key，支援同人代報多位臨打）
      const paymentMap = {};
      payResult.rows.forEach((p) => {
        const key = `${p.line_user_id}__${p.display_name}`;
        paymentMap[key] = {
          paymentMethod: p.payment_method || '',
          paid: p.paid === 1,
          paidAt: p.paid_at || '',
          isGuest: p.is_guest === 1,
        };
      });

      const registeredCount = regResult.rows.length;
      const isFull = registeredCount >= g.max_players;

      const { user } = await optionalVerifyLiffToken(req.headers);

      let myRegistration = null;
      let myWaitlist = null;
      let myPayment = null;
      if (user) {
        const myReg = regResult.rows.find((r) => r.line_user_id === user.lineUserId);
        if (myReg) {
          myRegistration = { id: myReg.id, displayName: myReg.display_name, isGuest: myReg.is_guest === 1, guestReporter: myReg.guest_reporter || '' };
          const payKey = `${myReg.line_user_id}__${myReg.display_name}`;
          myPayment = paymentMap[payKey] || null;
        }
        const myWait = waitResult.rows.find((w) => w.line_user_id === user.lineUserId);
        if (myWait) myWaitlist = { id: myWait.id, displayName: myWait.display_name, position: myWait.position, isGuest: myWait.is_guest === 1, guestReporter: myWait.guest_reporter || '' };
      }

      return jsonRes(res, 200, {
        game: {
          id: g.id,
          title: g.title,
          gameDate: g.game_date,
          gameTime: g.game_time,
          endTime: g.end_time || '',
          quitDeadline: g.quit_deadline || '',
          location: g.location,
          notes: g.notes,
          price: g.price,
          guestPrice: g.guest_price || 0,
          minPlayers: g.min_players || 0,
          maxPlayers: g.max_players,
          status: g.status,
          publishMode: g.publish_mode || 'immediate',
          publishAt: g.publish_at || '',
          publishedAt: g.published_at || '',
          paymentMethods: g.payment_methods ? JSON.parse(g.payment_methods) : [],
          registeredCount,
          waitlistCount: waitResult.rows.length,
          isFull,
        },
        registrations: regResult.rows.map((r) => ({
          id: r.id,
          lineUserId: r.line_user_id,
          displayName: r.display_name,
          registeredAt: r.registered_at,
          isGuest: r.is_guest === 1,
          guestReporter: r.guest_reporter || '',
          payment: paymentMap[`${r.line_user_id}__${r.display_name}`] || { paymentMethod: '', paid: false, paidAt: '' },
        })),
        waitlist: waitResult.rows.map((w) => ({
          id: w.id,
          lineUserId: w.line_user_id,
          displayName: w.display_name,
          joinedAt: w.joined_at,
          position: w.position,
          isGuest: w.is_guest === 1,
          guestReporter: w.guest_reporter || '',
        })),
        myRegistration,
        myWaitlist,
        myPayment,
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

    const { title, gameDate, gameTime, endTime, location, notes, price, guestPrice, minPlayers, maxPlayers, status: gameStatus, paymentMethods, quitDeadline, publishMode, publishAt } = req.body;

    try {
      // 將 undefined 轉為 null（libsql 不支援 undefined）
      const safe = (v) => (v === undefined ? null : v);

      // === 人數上限變更 → 自動調整正選/候補名單 ===
      const newMaxPlayers = maxPlayers != null ? Number(maxPlayers) : null;
      let rosterAdjustMsg = '';

      if (newMaxPlayers != null) {
        // 取得原本的 max_players
        const oldGame = await db.execute({
          sql: `SELECT max_players FROM games WHERE id = ?`,
          args: [gameId],
        });
        const oldMax = oldGame.rows.length > 0 ? Number(oldGame.rows[0].max_players) : null;

        if (oldMax != null && newMaxPlayers !== oldMax) {
          // 取得目前正選名單（依報名順序）
          const regs = await db.execute({
            sql: `SELECT line_user_id, display_name, is_guest, guest_reporter FROM registrations WHERE game_id = ? ORDER BY registered_at ASC`,
            args: [gameId],
          });
          // 取得目前候補名單（依順位）
          const waits = await db.execute({
            sql: `SELECT id, line_user_id, display_name, position, is_guest, guest_reporter FROM waitlist WHERE game_id = ? ORDER BY position ASC`,
            args: [gameId],
          });

          if (newMaxPlayers > oldMax) {
            // === 上限增加 → 候補遞補為正選 ===
            const slotsAvailable = newMaxPlayers - regs.rows.length;
            if (slotsAvailable > 0 && waits.rows.length > 0) {
              const toPromote = waits.rows.slice(0, slotsAvailable);
              for (const w of toPromote) {
                // 加入正選（保留 is_guest / guest_reporter）
                await db.execute({
                  sql: `INSERT INTO registrations (game_id, line_user_id, display_name, is_guest, guest_reporter) VALUES (?, ?, ?, ?, ?)`,
                  args: [gameId, w.line_user_id, w.display_name, w.is_guest || 0, w.guest_reporter || ''],
                });
                // 建立付款紀錄
                await db.execute({
                  sql: `INSERT OR IGNORE INTO payments (game_id, line_user_id, display_name, payment_method) VALUES (?, ?, ?, '現金')`,
                  args: [gameId, w.line_user_id, w.display_name],
                });
                // 從候補刪除
                await db.execute({
                  sql: `DELETE FROM waitlist WHERE id = ?`,
                  args: [w.id],
                });
                // LINE 通知遞補者
                try {
                  const gameRow = await db.execute({ sql: `SELECT title, game_date, game_time, end_time, location FROM games WHERE id = ?`, args: [gameId] });
                  if (gameRow.rows.length > 0) {
                    const g = gameRow.rows[0];
                    const gameInfo = `${g.title || '球局'}\n📅 ${g.game_date} ${g.game_time}${g.end_time ? ` ~ ${g.end_time}` : ''}\n📍 ${g.location}`;
                    await pushMessage(w.line_user_id, `【自動遞補通知】\n因球局人數上限調整，您已由候補轉為正選：\n${gameInfo}`);
                  }
                } catch (e) { console.warn('[Games] 遞補通知失敗:', e.message); }
              }
              // 重新排列候補順位
              const remainingWaits = await db.execute({
                sql: `SELECT id FROM waitlist WHERE game_id = ? ORDER BY position ASC`,
                args: [gameId],
              });
              for (let i = 0; i < remainingWaits.rows.length; i++) {
                await db.execute({
                  sql: `UPDATE waitlist SET position = ? WHERE id = ?`,
                  args: [i + 1, remainingWaits.rows[i].id],
                });
              }
              rosterAdjustMsg = `，已自動遞補 ${toPromote.length} 位候補為正選`;
            }
          } else if (newMaxPlayers < oldMax) {
            // === 上限減少 → 超出的正選轉為候補 ===
            const toDemote = regs.rows.slice(newMaxPlayers); // 超出新上限的正選
            if (toDemote.length > 0) {
              // 取得目前最大候補順位
              const maxPosResult = await db.execute({
                sql: `SELECT COALESCE(MAX(position), 0) as max_pos FROM waitlist WHERE game_id = ?`,
                args: [gameId],
              });
              let nextPos = Number(maxPosResult.rows[0].max_pos) + 1;

              for (const r of toDemote) {
                // 從正選刪除（用 display_name 精確匹配，支援同人代報多位臨打）
                await db.execute({
                  sql: `DELETE FROM registrations WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
                  args: [gameId, r.line_user_id, r.display_name],
                });
                // 刪除付款紀錄
                await db.execute({
                  sql: `DELETE FROM payments WHERE game_id = ? AND line_user_id = ? AND display_name = ?`,
                  args: [gameId, r.line_user_id, r.display_name],
                });
                // 加入候補（保留 is_guest / guest_reporter）
                await db.execute({
                  sql: `INSERT INTO waitlist (game_id, line_user_id, display_name, position, is_guest, guest_reporter) VALUES (?, ?, ?, ?, ?, ?)`,
                  args: [gameId, r.line_user_id, r.display_name, nextPos, r.is_guest || 0, r.guest_reporter || ''],
                });
                nextPos++;
                // LINE 通知被降為候補者
                try {
                  const gameRow = await db.execute({ sql: `SELECT title, game_date, game_time, end_time, location FROM games WHERE id = ?`, args: [gameId] });
                  if (gameRow.rows.length > 0) {
                    const g = gameRow.rows[0];
                    const gameInfo = `${g.title || '球局'}\n📅 ${g.game_date} ${g.game_time}${g.end_time ? ` ~ ${g.end_time}` : ''}\n📍 ${g.location}`;
                    await pushMessage(r.line_user_id, `【候補通知】\n因球局人數上限調整，您已由正選轉為候補：\n${gameInfo}\n如有人退出，將依序自動遞補。`);
                  }
                } catch (e) { console.warn('[Games] 降候補通知失敗:', e.message); }
              }
              rosterAdjustMsg = `，已將 ${toDemote.length} 位正選轉為候補`;
            }
          }
        }
      }

      await db.execute({
        sql: `UPDATE games SET
                title = COALESCE(?, title),
                game_date = COALESCE(?, game_date),
                game_time = COALESCE(?, game_time),
                end_time = ?, /* 直接覆蓋，允許清空 */
                location = COALESCE(?, location),
                notes = ?, /* 直接覆蓋，允許清空 */
                price = COALESCE(?, price),
                guest_price = COALESCE(?, guest_price),
                min_players = COALESCE(?, min_players),
                max_players = COALESCE(?, max_players),
                status = COALESCE(?, status),
                payment_methods = ?, /* 直接覆蓋，允許清空 */
                quit_deadline = ?, /* 直接覆蓋，允許清空 */
                publish_mode = COALESCE(?, publish_mode),
                publish_at = COALESCE(?, publish_at),
                updated_at = datetime('now', '+8 hours')
              WHERE id = ?`,
        args: [
          safe(title),
          safe(gameDate),
          safe(gameTime),
          safe(endTime) != null ? safe(endTime) : '',
          safe(location),
          safe(notes) != null ? safe(notes) : '',
          price != null && price !== undefined ? Number(price) : null,
          guestPrice != null && guestPrice !== undefined ? Number(guestPrice) : null,
          minPlayers != null && minPlayers !== undefined ? Number(minPlayers) : null,
          safe(maxPlayers),
          safe(gameStatus),
          paymentMethods != null && paymentMethods !== undefined ? JSON.stringify(paymentMethods) : '',
          quitDeadline != null && quitDeadline !== undefined ? quitDeadline : '',
          safe(publishMode),
          safe(publishAt),
          gameId,
        ],
      });

      return jsonRes(res, 200, { message: '球局已更新' + rosterAdjustMsg });
    } catch (error) {
      console.error('[Games] 修改失敗:', error);
      return jsonRes(res, 500, { error: '修改球局失敗: ' + error.message });
    }
  }

  // === DELETE 刪除（軟刪除） ===
  if (req.method === 'DELETE') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    try {
      // 先取得球局資訊和所有報名者/候補者，用於 LINE 通知
      const gameResult = await db.execute({
        sql: `SELECT * FROM games WHERE id = ?`,
        args: [Number(gameId)],
      });

      if (gameResult.rows.length === 0) {
        return jsonRes(res, 404, { error: '找不到此球局' });
      }

      const game = gameResult.rows[0];
      const gameInfo = `${game.title || '球局'}\n📅 ${game.game_date} ${game.game_time}${game.end_time ? ` ~ ${game.end_time}` : ''}\n📍 ${game.location}`;

      // 取得所有報名者和候補者的 LINE User ID
      const regResult = await db.execute({
        sql: `SELECT line_user_id FROM registrations WHERE game_id = ?`,
        args: [Number(gameId)],
      });
      const waitResult = await db.execute({
        sql: `SELECT line_user_id FROM waitlist WHERE game_id = ?`,
        args: [Number(gameId)],
      });

      const notifyIds = [
        ...regResult.rows.map((r) => r.line_user_id),
        ...waitResult.rows.map((r) => r.line_user_id),
      ];

      // 軟刪除球局
      await db.execute({
        sql: `UPDATE games SET status = 'cancelled', updated_at = datetime('now', '+8 hours') WHERE id = ?`,
        args: [Number(gameId)],
      });

      // LINE 通知所有報名者/候補者
      if (notifyIds.length > 0) {
        try {
          const cancelCard = buildCancelMessage({
            title: game.title || '球局',
            gameDate: game.game_date,
            gameTime: game.game_time,
            endTime: game.end_time || '',
            location: game.location,
          });
          await broadcast(notifyIds, cancelCard);
        } catch (notifyErr) {
          console.warn('[Games] LINE 通知報名者失敗:', notifyErr.message);
        }
      }

      return jsonRes(res, 200, { message: '球局已刪除' });
    } catch (error) {
      console.error('[Games] 刪除失敗:', error);
      return jsonRes(res, 500, { error: '刪除球局失敗' });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
