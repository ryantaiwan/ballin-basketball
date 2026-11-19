/**
 * POST /api/webhook — LINE Messaging API Webhook 端點
 *
 * 功能：
 * 1. 接收 bot 被加入群組時的 join 事件 → 自動捕捉 group ID
 * 2. 接收群組內訊息事件 → 記錄 group ID（另一種取得方式）
 * 3. 接收 memberJoined 事件 → 可在群組內發送歡迎訊息
 *
 * LINE 會在 bot 被加入群組、或群組內有新訊息時，
 * POST 事件到此端點。我們從 source 物件取出 groupId。
 */
const { db } = require('./_lib/db');
const { handlePreflight, jsonRes } = require('./_lib/utils');
const { pushMessage } = require('./_lib/lineNotify');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Line-Signature');
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return jsonRes(res, 405, { error: 'Method Not Allowed' });
  }

  const body = req.body || {};
  const events = body.events || [];

  if (events.length === 0) {
    // LINE 定期發的驗證 ping
    return jsonRes(res, 200, { status: 'ok' });
  }

  for (const event of events) {
    const source = event.source || {};
    const groupId = source.groupId || source.roomId;

    if (groupId) {
      console.log(`[Webhook] 收到群組事件 type=${event.type} groupId=${groupId}`);

      // 嘗試寫入資料庫（如果 table 存在）
      try {
        await db.execute({
          sql: `INSERT OR IGNORE INTO line_groups (group_id, group_type, updated_at)
                VALUES (?, ?, datetime('now', '+8 hours'))`,
          args: [groupId, source.type || 'group'],
        });
        console.log('[Webhook] 已儲存 group ID 到資料庫');
      } catch (e) {
        // table 可能不存在，忽略
        console.warn('[Webhook] 儲存 group ID 失敗:', e.message);
      }
    }

    // bot 被加入群組 → 發歡迎訊息
    if (event.type === 'join' && groupId) {
      const welcomeMsg = {
        type: 'text',
        text: '🏀 有Ball必In 籃球歡樂打社團已加入群組！\n\n之後新球局開放報名時，會自動在這裡推送卡片通知。\n\n管理員可前往球局報名系統建立新球局：\nhttps://liff.line.me/2012621725-2Q3zK0TF',
      };
      await pushMessage(groupId, welcomeMsg);
    }

    // 有新成員加入群組
    if (event.type === 'memberJoined' && groupId) {
      const joinedMsg = {
        type: 'text',
        text: '👋 歡迎加入！請到球局報名系統查看近期球局：\nhttps://liff.line.me/2012621725-2Q3zK0TF',
      };
      await pushMessage(groupId, joinedMsg);
    }

    // 如果有人在群組內發訊息，也可以記錄 group ID
    if (event.type === 'message' && groupId) {
      console.log(`[Webhook] 群組訊息 groupId=${groupId} from=${source.userId}`);
    }
  }

  // 必須在 1 秒內回 200，否則 LINE 會重試
  return jsonRes(res, 200, { status: 'ok' });
};
