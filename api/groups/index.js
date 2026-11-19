/**
 * GET  /api/groups — 取得已知的 LINE 群組列表 + 目前環境變數設定
 * POST /api/groups — 手動設定群組 ID（管理者）或發送測試訊息
 *
 * 用法：
 *   GET  /api/groups              → 查看目前設定的 group ID
 *   POST /api/groups { action: "test" }                       → 發測試卡片到群組
 *   POST /api/groups { action: "set", groupId: "Cxxxxx" }     → 手動設定 group ID（存資料庫）
 */
const { db } = require('../_lib/db');
const { requireAdmin } = require('../_lib/admin');
const { handlePreflight, jsonRes } = require('../_lib/utils');
const { pushToGroup, pushMessage } = require('../_lib/lineNotify');
const { buildGameCarouselMessage } = require('../_lib/flexMessage');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  // === GET ===
  if (req.method === 'GET') {
    const envGroupId = process.env.LINE_GROUP_ID || '';
    let dbGroups = [];

    try {
      const result = await db.execute(
        `SELECT group_id, group_type, created_at, updated_at FROM line_groups ORDER BY updated_at DESC`
      );
      dbGroups = result.rows;
    } catch (e) {
      // table 不存在
    }

    return jsonRes(res, 200, {
      envGroupId,
      envGroupIdSet: envGroupId.length > 0,
      dbGroups,
      instructions: !envGroupId
        ? '尚未設定群組 ID。請將 LINE Bot 加入群組（webhook 會自動捕捉），或在 LINE Developers Console 設定 webhook 後將 Bot 拉進群組。'
        : '群組 ID 已設定，新球局通知會自動發到群組。',
    });
  }

  // === POST ===
  if (req.method === 'POST') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    const { action, groupId } = req.body || {};

    // 發測試卡片到群組
    if (action === 'test') {
      const targetGroupId = groupId || process.env.LINE_GROUP_ID;
      if (!targetGroupId) {
        return jsonRes(res, 400, { error: '尚未設定群組 ID，無法測試' });
      }

      const testCard = buildGameCarouselMessage(
        {
          id: 0,
          title: '🎮 群組推播測試',
          gameDate: '2026-11-22',
          gameTime: '18:00',
          endTime: '20:00',
          location: '測試地點',
          notes: '這是一張測試卡片，確認群組推播功能正常運作。',
          price: 100,
          guestPrice: 150,
          minPlayers: 8,
          maxPlayers: 20,
          registeredCount: 3,
          waitlistCount: 1,
        },
        {
          registrations: [
            { displayName: '測試員A' },
            { displayName: '測試員B' },
            { displayName: '測試員C' },
          ],
          waitlist: [{ displayName: '候補測試' }],
          gameUrl: 'https://liff.line.me/2012621725-2Q3zK0TF',
          statusLabel: '🎮 群組推播測試',
          showRegisterButton: true,
        }
      );

      await pushMessage(targetGroupId, testCard);
      return jsonRes(res, 200, {
        message: '測試卡片已發送到群組',
        groupId: targetGroupId,
      });
    }

    // 手動儲存群組 ID
    if (action === 'set' && groupId) {
      try {
        await db.execute({
          sql: `INSERT OR REPLACE INTO line_groups (group_id, group_type, updated_at)
                VALUES (?, 'group', datetime('now', '+8 hours'))`,
          args: [groupId],
        });
        return jsonRes(res, 200, {
          message: '群組 ID 已儲存。請同時在 Vercel 環境變數設定 LINE_GROUP_ID。',
          groupId,
          note: 'LINE_GROUP_ID 環境變數需在 Vercel 後台手動設定，程式碼無法動態修改環境變數。',
        });
      } catch (e) {
        return jsonRes(res, 500, { error: '儲存失敗: ' + e.message });
      }
    }

    return jsonRes(res, 400, { error: '未知的 action' });
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
