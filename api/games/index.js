/**
 * GET /api/games       — 取得所有球局列表（含進行中/已結束分類）
 * POST /api/games      — 新增球局（管理者）+ LINE 通知管理者
 */
const { db } = require('../_lib/db');
const { requireAdmin, isAdmin } = require('../_lib/admin');
const { pushMessage, pushMultiMessage, pushToGroup, broadcast } = require('../_lib/lineNotify');
const { handlePreflight, jsonRes } = require('../_lib/utils');
const { buildGameCarouselMessage, buildCancelMessage, buildReminderMessage } = require('../_lib/flexMessage');
const { getGameWithRoster, getGameUrl } = require('../_lib/gameData');

/**
 * 根據當前時間更新球局狀態 + 自動取消 + LINE 提醒通知
 * - 開始前96小時，若報名人數 < min_players → 自動取消 + LINE 通知
 * - 開始前24小時 → LINE 提醒正選名單
 * - 開始前12小時 → LINE 通知球局資訊 + 報名清單
 * - 開始前2小時 → LINE 提醒
 * - 開始前30分鐘 → LINE 提醒
 * - 開始45分鐘後 → in_progress
 * - 超過結束時間 → ended
 */
async function autoUpdateGameStatus() {
  try {
    const now = new Date();

    // ===== 0. 排程中球局：檢查是否到達發佈時間 → 自動發佈 =====
    const scheduledResult = await db.execute({
      sql: `SELECT id, title, game_date, game_time, end_time, location, notes,
                   price, guest_price, min_players, max_players, publish_at
            FROM games WHERE status = 'scheduled' AND publish_mode = 'scheduled'
            AND publish_at != ''`,
    });

    for (const game of scheduledResult.rows) {
      const publishTime = new Date(String(game.publish_at).replace(' ', 'T'));
      if (now >= publishTime) {
        // 時間到 → 發佈球局（改為 open + 發 LINE 通知）
        await db.execute({
          sql: `UPDATE games SET status = 'open', published_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE id = ?`,
          args: [game.id],
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
          console.warn('[Games] 排程發佈 LINE 通知失敗:', notifyErr.message);
        }
      }
    }

    // 取得所有 open / in_progress 的球局（含完整資訊）
    const result = await db.execute(`
      SELECT g.id, g.title, g.game_date, g.game_time, g.end_time, g.status,
             g.min_players, g.max_players, g.location, g.price, g.guest_price,
             (SELECT COUNT(*) FROM registrations r WHERE r.game_id = g.id) AS reg_count,
             (SELECT COUNT(*) FROM waitlist w WHERE w.game_id = g.id) AS wait_count
      FROM games g
      WHERE g.status IN ('open', 'in_progress')
    `);

    for (const game of result.rows) {
      const gameStartStr = `${game.game_date} ${game.game_time}`;
      const gameStart = new Date(gameStartStr.replace(' ', 'T'));
      const endTime = game.end_time || '';
      const gameEndStr = endTime
        ? `${game.game_date} ${endTime}`
        : `${game.game_date} ${(parseInt(game.game_time.split(':')[0]) + 2).toString().padStart(2, '0')}:${game.game_time.split(':')[1]}`;
      const gameEnd = new Date(gameEndStr.replace(' ', 'T'));
      const start45Min = new Date(gameStart.getTime() + 45 * 60000);

      const gameId = game.id;
      const gameInfo = `${game.title || '球局'}\n📅 ${game.game_date} ${game.game_time}${endTime ? ` ~ ${endTime}` : ''}\n📍 ${game.location}`;
      const priceText = game.price > 0 ? `NT$${game.price}` : '免費';

      // ===== 1. 最少人數檢查：開始前96小時，若報名 < min_players → 自動取消 =====
      if (game.status === 'open' && game.min_players > 0) {
        const checkTime = new Date(gameStart.getTime() - 96 * 60 * 60000); // 96小時前
        if (now >= checkTime && game.reg_count < game.min_players) {
          // 檢查是否已通知過
          const notifCheck = await db.execute({
            sql: `SELECT 1 FROM game_notifications WHERE game_id = ? AND notification_type = 'cancel_low'`,
            args: [gameId],
          });
          if (notifCheck.rows.length === 0) {
            // 自動取消球局
            await db.execute({
              sql: `UPDATE games SET status = 'cancelled', updated_at = datetime('now', '+8 hours') WHERE id = ?`,
              args: [gameId],
            });
            await db.execute({
              sql: `INSERT OR IGNORE INTO game_notifications (game_id, notification_type) VALUES (?, 'cancel_low')`,
              args: [gameId],
            });

            // LINE 通知所有報名者 + 候補者 + 管理者
            const regResult = await db.execute({
              sql: `SELECT line_user_id FROM registrations WHERE game_id = ?`,
              args: [gameId],
            });
            const waitResult = await db.execute({
              sql: `SELECT line_user_id FROM waitlist WHERE game_id = ?`,
              args: [gameId],
            });
            const adminResult = await db.execute(`SELECT line_user_id FROM admins`);
            const notifyIds = [
              ...regResult.rows.map((r) => r.line_user_id),
              ...waitResult.rows.map((r) => r.line_user_id),
              ...adminResult.rows.map((r) => r.line_user_id),
            ];
            // Flex Message 取消卡片 — 發到群組 + 個人
            const cancelCard = buildCancelMessage({
              title: game.title || '球局',
              gameDate: game.game_date,
              gameTime: game.game_time,
              endTime: endTime,
              location: game.location,
            });
            await broadcast(notifyIds, cancelCard);
            continue; // 已取消，跳過後續檢查
          }
        }
      }

      // ===== 2. LINE 提醒通知（僅 open 狀態，且未取消）=====
      if (game.status === 'open') {
        const reminders = [
          { type: 'reminder_24h', msBefore: 24 * 60 * 60000, label: '⏰ 24小時後開始', note: '您已在正選名單中，請準時出席！' },
          { type: 'reminder_2h', msBefore: 2 * 60 * 60000, label: '⏰ 2小時後開始', note: '請記得準時到場！' },
          { type: 'reminder_30m', msBefore: 30 * 60000, label: '🔥 半小時後開始', note: '即將開始，請盡快前往球場！' },
        ];

        for (const reminder of reminders) {
          const triggerTime = new Date(gameStart.getTime() - reminder.msBefore);
          if (now >= triggerTime) {
            // 檢查是否已發送
            const notifCheck = await db.execute({
              sql: `SELECT 1 FROM game_notifications WHERE game_id = ? AND notification_type = ?`,
              args: [gameId, reminder.type],
            });
            if (notifCheck.rows.length === 0) {
              // 取得正選名單
              const regResult = await db.execute({
                sql: `SELECT line_user_id, display_name FROM registrations WHERE game_id = ? ORDER BY registered_at ASC`,
                args: [gameId],
              });
              const regIds = regResult.rows.map((r) => r.line_user_id);
              if (regIds.length > 0) {
                // Flex Message 單張球局資訊卡
                const card = buildReminderMessage(
                  {
                    title: game.title || '球局',
                    gameDate: game.game_date,
                    gameTime: game.game_time,
                    endTime: endTime,
                    location: game.location,
                    notes: '',
                    price: game.price || 0,
                    guestPrice: game.guest_price || 0,
                    minPlayers: game.min_players || 0,
                    maxPlayers: game.max_players || 20,
                    registeredCount: game.reg_count || 0,
                    waitlistCount: game.wait_count || 0,
                  },
                  { statusLabel: reminder.label, extraNote: reminder.note }
                );
                await pushMultiMessage(regIds, card);
              }
              await db.execute({
                sql: `INSERT OR IGNORE INTO game_notifications (game_id, notification_type) VALUES (?, ?)`,
                args: [gameId, reminder.type],
              });
            }
          }
        }

        // ===== 3. 開始前12小時 — 通知球局資訊 + 報名清單（卡片） =====
        const trigger12h = new Date(gameStart.getTime() - 12 * 60 * 60000);
        if (now >= trigger12h) {
          const notifCheck = await db.execute({
            sql: `SELECT 1 FROM game_notifications WHERE game_id = ? AND notification_type = 'reminder_12h'`,
            args: [gameId],
          });
          if (notifCheck.rows.length === 0) {
            const regResult = await db.execute({
              sql: `SELECT line_user_id, display_name FROM registrations WHERE game_id = ? ORDER BY registered_at ASC`,
              args: [gameId],
            });
            const adminResult = await db.execute(`SELECT line_user_id FROM admins`);
            const allIds = [
              ...regResult.rows.map((r) => r.line_user_id),
              ...adminResult.rows.map((r) => r.line_user_id),
            ];

            if (regResult.rows.length > 0) {
              // Flex Message carousel 卡片：資訊 + 正選 + 候補 — 發到群組 + 個人
              const roster = await getGameWithRoster(gameId);
              const card = buildGameCarouselMessage(
                roster.game,
                {
                  registrations: roster.registrations,
                  waitlist: roster.waitlist,
                  gameUrl: getGameUrl(gameId),
                  statusLabel: '⏰ 12小時後開始',
                  showRegisterButton: false,
                }
              );
              await broadcast(allIds, card);
            }
            await db.execute({
              sql: `INSERT OR IGNORE INTO game_notifications (game_id, notification_type) VALUES (?, 'reminder_12h')`,
              args: [gameId],
            });
          }
        }
      }

      // ===== 4. 狀態自動更新 =====
      if (now > gameEnd) {
        // 已超過結束時間 → ended
        if (game.status !== 'ended') {
          await db.execute({
            sql: `UPDATE games SET status = 'ended', updated_at = datetime('now', '+8 hours') WHERE id = ?`,
            args: [gameId],
          });
        }
      } else if (now >= start45Min) {
        // 開始30分鐘後但未超過結束 → in_progress
        if (game.status !== 'in_progress') {
          await db.execute({
            sql: `UPDATE games SET status = 'in_progress', updated_at = datetime('now', '+8 hours') WHERE id = ?`,
            args: [gameId],
          });
        }
      }
    }
  } catch (e) {
    console.warn('[Games] 自動狀態更新失敗:', e.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') {
    try {
      // 自動更新球局狀態
      await autoUpdateGameStatus();

      // 後台管理員可帶 ?includeAll=true 取得所有球局（含已結束/已取消）
      const includeAll = req.query.includeAll === 'true';

      const whereClause = includeAll
        ? '1=1'
        : "g.status NOT IN ('cancelled', 'ended', 'scheduled')";

      const result = await db.execute(`
        SELECT
          g.*,
          (SELECT COUNT(*) FROM registrations r WHERE r.game_id = g.id) AS reg_count,
          (SELECT COUNT(*) FROM waitlist w WHERE w.game_id = g.id) AS wait_count
        FROM games g
        WHERE ${whereClause}
        ORDER BY g.game_date DESC, g.game_time DESC
      `);

      const games = result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        gameDate: row.game_date,
        gameTime: row.game_time,
        endTime: row.end_time || '',
        quitDeadline: row.quit_deadline || '',
        location: row.location,
        notes: row.notes,
        notesShort: (row.notes || '').substring(0, 200),
        price: row.price,
        guestPrice: row.guest_price || 0,
        minPlayers: row.min_players || 0,
        maxPlayers: row.max_players,
        status: row.status,
        publishMode: row.publish_mode || 'immediate',
        publishAt: row.publish_at || '',
        publishedAt: row.published_at || '',
        paymentMethods: row.payment_methods ? JSON.parse(row.payment_methods) : [],
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
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    const { title, gameDate, gameTime, endTime, location, notes, price, guestPrice, minPlayers, maxPlayers, paymentMethods, quitDeadline, publishMode, publishAt } = req.body;

    if (!gameDate || !gameTime || !location) {
      return jsonRes(res, 400, { error: '日期、開始時間、地點為必填' });
    }

    if (!endTime) {
      return jsonRes(res, 400, { error: '結束時間為必填' });
    }

    // 發佈模式：immediate → 直接 open；scheduled → scheduled 狀態
    const mode = publishMode === 'scheduled' ? 'scheduled' : 'immediate';
    const gameStatus = mode === 'scheduled' ? 'scheduled' : 'open';
    const publishAtValue = mode === 'scheduled' ? (publishAt || '') : '';
    const publishedAtValue = mode === 'immediate' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : '';

    try {
      const result = await db.execute({
        sql: `INSERT INTO games (title, game_date, game_time, end_time, location, notes, price, guest_price, min_players, max_players, payment_methods, quit_deadline, status, publish_mode, publish_at, published_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          title || '球局',
          gameDate,
          gameTime,
          endTime || '',
          location,
          notes || '',
          price != null ? Number(price) : 0,
          guestPrice != null ? Number(guestPrice) : 0,
          minPlayers != null ? Number(minPlayers) : 0,
          maxPlayers || 20,
          paymentMethods && paymentMethods.length > 0 ? JSON.stringify(paymentMethods) : '',
          quitDeadline || '',
          gameStatus,
          mode,
          publishAtValue,
          publishedAtValue,
        ],
      });

      const newGameId = Number(result.lastInsertRowid);

      // LINE 通知：只有立即發佈才推播（排程中等到時間到才推播）
      if (mode === 'immediate') {
        try {
          const adminResult = await db.execute(`SELECT line_user_id FROM admins`);
          const adminIds = adminResult.rows.map((r) => r.line_user_id);

          const card = buildGameCarouselMessage(
            {
              id: newGameId,
              title: title || '球局',
              gameDate,
              gameTime,
              endTime: endTime || '',
              location,
              notes: notes || '',
              price: price != null ? Number(price) : 0,
              guestPrice: guestPrice != null ? Number(guestPrice) : 0,
              minPlayers: minPlayers != null ? Number(minPlayers) : 0,
              maxPlayers: maxPlayers || 20,
              registeredCount: 0,
              waitlistCount: 0,
            },
            {
              registrations: [],
              waitlist: [],
              gameUrl: getGameUrl(newGameId),
              statusLabel: '🏀 球局開放報名',
              showRegisterButton: true,
            }
          );
          // 廣播：群組 + 管理者個人
          await broadcast(adminIds, card);
        } catch (notifyErr) {
          console.warn('[Games] LINE 通知失敗:', notifyErr.message);
        }
      }

      return jsonRes(res, 201, {
        id: newGameId,
        message: mode === 'scheduled'
          ? `球局已建立（排程中），將於 ${publishAtValue} 自動發佈`
          : '球局已建立並發佈',
      });
    } catch (error) {
      console.error('[Games] 新增失敗:', error);
      return jsonRes(res, 500, { error: '新增球局失敗: ' + error.message });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
