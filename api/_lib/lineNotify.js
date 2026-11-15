/**
 * LINE Messaging API 通知模組 (Vercel Serverless 版)
 */
const axios = require('axios');

const CHANNEL_ACCESS_TOKEN = process.env.LIFF_CHANNEL_ACCESS_TOKEN;

/**
 * 發送推送訊息給指定使用者
 */
async function pushMessage(lineUserId, message) {
  if (!CHANNEL_ACCESS_TOKEN) {
    console.warn('[LINE] 未設定 CHANNEL_ACCESS_TOKEN，跳過推播');
    return;
  }

  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: lineUserId,
        messages: [{ type: 'text', text: message }],
      },
      {
        headers: {
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[LINE] 已發送訊息給 ${lineUserId}`);
  } catch (error) {
    console.error('[LINE] 推播失敗:', error.response?.data || error.message);
  }
}

/**
 * 發送多人推播
 */
async function pushMultiMessage(userIds, message) {
  for (const userId of userIds) {
    await pushMessage(userId, message);
  }
}

module.exports = { pushMessage, pushMultiMessage };
