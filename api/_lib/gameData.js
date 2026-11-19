/**
 * 球局卡片資料查詢輔助
 * 統一取得球局 + 正選名單 + 候補名單，供 Flex Message 卡片產生使用
 */
const { db } = require('./db');

const SITE_URL =
  process.env.SITE_URL || 'https://liff.line.me/2012621725-2Q3zK0TF';

/**
 * 取得球局（含正選/候補名單）
 * @param {number|string} gameId
 * @param {object} opts { includeCancelled: boolean }
 * @returns {Promise<{game:object, registrations:Array, waitlist:Array}|null>}
 */
async function getGameWithRoster(gameId, opts = {}) {
  const { includeCancelled = false } = opts;

  const gameResult = await db.execute({
    sql: `SELECT * FROM games WHERE id = ?${includeCancelled ? '' : " AND status != 'cancelled'"}`,
    args: [gameId],
  });
  if (gameResult.rows.length === 0) return null;

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

  const registrations = regResult.rows.map((r) => ({
    id: r.id,
    lineUserId: r.line_user_id,
    displayName: r.display_name,
    registeredAt: r.registered_at,
    isGuest: r.is_guest === 1,
    guestReporter: r.guest_reporter || '',
  }));

  const waitlist = waitResult.rows.map((w) => ({
    id: w.id,
    lineUserId: w.line_user_id,
    displayName: w.display_name,
    joinedAt: w.joined_at,
    position: w.position,
    isGuest: w.is_guest === 1,
    guestReporter: w.guest_reporter || '',
  }));

  return {
    game: {
      id: g.id,
      title: g.title,
      gameDate: g.game_date,
      gameTime: g.game_time,
      endTime: g.end_time || '',
      location: g.location,
      notes: g.notes,
      price: g.price || 0,
      guestPrice: g.guest_price || 0,
      minPlayers: g.min_players || 0,
      maxPlayers: g.max_players || 20,
      status: g.status,
      registeredCount: registrations.length,
      waitlistCount: waitlist.length,
    },
    registrations,
    waitlist,
  };
}

/**
 * 產生球局頁面連結
 * @param {number} gameId
 * @returns {string}
 */
function getGameUrl(gameId) {
  return `${SITE_URL}?game=${gameId}`;
}

module.exports = { getGameWithRoster, getGameUrl, SITE_URL };
