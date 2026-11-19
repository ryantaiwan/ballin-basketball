/**
 * LINE Messaging API 通知模組 (Vercel Serverless 版)
 *
 * 支援兩種訊息格式：
 *  - 字串 → 自動轉為 type:"text" 純文字訊息
 *  - 物件 → 直接使用（可為 Flex Message 等結構化格式）
 *
 * 推播目標：
 *  - 個人 (user ID, U 開頭)
 *  - 群組 (group ID, C 開頭) — 需設定 LINE_GROUP_ID 環境變數
 */
const axios = require('axios');

const CHANNEL_ACCESS_TOKEN = process.env.LIFF_CHANNEL_ACCESS_TOKEN;
const GROUP_ID = process.env.LINE_GROUP_ID || '';

/**
 * 送出訊息給指定目標（user ID 或 group ID）
 * @param {string} targetId - LINE user ID (U...) 或 group ID (C...)
 * @param {string|object} message - 純文字字串，或 LINE message object
 */
async function pushMessage(targetId, message) {
  if (!CHANNEL_ACCESS_TOKEN) {
    console.warn('[LINE] 未設定 CHANNEL_ACCESS_TOKEN，跳過推播');
    return;
  }
  if (!targetId) {
    console.warn('[LINE] 缺少 targetId，跳過推播');
    return;
  }

  // 字串 → 純文字；物件 → 原樣送出（Flex Message）
  const messageObject =
    typeof message === 'string' ? { type: 'text', text: message } : message;

  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: targetId,
        messages: [messageObject],
      },
      {
        headers: {
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const targetType = targetId.startsWith('C') ? '群組' : '個人';
    console.log(`[LINE] 已發送訊息給 ${targetType} ${targetId} (${messageObject.type})`);
  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error('[LINE] 推播失敗:', detail);
    // Flex Message 若因格式問題失敗，退回純文字重送一次
    if (messageObject.type === 'flex') {
      console.warn('[LINE] Flex 推播失敗，改用純文字重送');
      const fallbackText =
        messageObject.altText || '【球局通知】請開啟球局頁面查看詳情';
      try {
        await axios.post(
          'https://api.line.me/v2/bot/message/push',
          {
            to: targetId,
            messages: [{ type: 'text', text: fallbackText }],
          },
          {
            headers: {
              Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log(`[LINE] 已退回純文字發送給 ${targetId}`);
      } catch (fbErr) {
        console.error(
          '[LINE] 純文字退回發送亦失敗:',
          fbErr.response?.data || fbErr.message
        );
      }
    }
  }
}

/**
 * 發送多人推播
 * @param {string[]} userIds
 * @param {string|object} message
 */
async function pushMultiMessage(userIds, message) {
  if (!userIds || userIds.length === 0) return;
  for (const userId of userIds) {
    await pushMessage(userId, message);
  }
}

/**
 * 批次發送多人推播（去重後分批同時送出，縮短大量人數時的等待時間）
 * @param {string[]} userIds
 * @param {string|object} message
 */
async function pushMultiMessageParallel(userIds, message) {
  if (!userIds || userIds.length === 0) return;
  const unique = [...new Set(userIds.filter(Boolean))];
  const batchSize = 10;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.all(batch.map((userId) => pushMessage(userId, message)));
  }
}

/**
 * 發送訊息到聊天群組
 * 若未設定 LINE_GROUP_ID 則跳過（不影響一對一推播）
 * @param {string|object} message
 */
async function pushToGroup(message) {
  if (!GROUP_ID) {
    console.warn('[LINE] 未設定 LINE_GROUP_ID，跳過群組推播');
    return false;
  }
  await pushMessage(GROUP_ID, message);
  return true;
}

/**
 * 廣播訊息：同時發到群組 + 所有個人
 * 用於新球局通知等場景，確保每個人都能收到
 * @param {string[]} userIds - 個人 user ID 列表
 * @param {string|object} message
 * @param {object} opts - { includeGroup: boolean (預設 true) }
 */
async function broadcast(userIds, message, opts = {}) {
  const { includeGroup = true } = opts;
  const tasks = [];
  if (includeGroup && GROUP_ID) {
    tasks.push(pushToGroup(message));
  }
  if (userIds && userIds.length > 0) {
    tasks.push(pushMultiMessageParallel(userIds, message));
  }
  await Promise.all(tasks);
}

module.exports = {
  pushMessage,
  pushMultiMessage,
  pushMultiMessageParallel,
  pushToGroup,
  broadcast,
  GROUP_ID,
};
