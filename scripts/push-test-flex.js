/**
 * 實際推播測試卡片到指定 LINE User ID
 * 用法：node scripts/push-test-flex.js <lineUserId> [type]
 *   type: carousel | cancel | promote | reminder  (預設 carousel)
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.LIFF_CHANNEL_ACCESS_TOKEN;
const targetId = process.argv[2];
const type = process.argv[3] || 'carousel';

if (!TOKEN) {
  console.error('✗ 缺少 LIFF_CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}
if (!targetId) {
  console.error('用法：node scripts/push-test-flex.js <lineUserId> [type]');
  process.exit(1);
}

const outDir = path.join(__dirname, '..', '.flex-preview');
const fileMap = {
  carousel: 'carousel-3cards.json',
  cancel: 'cancel.json',
  promote: 'promote.json',
  reminder: 'reminder.json',
};

(async () => {
  const file = fileMap[type] || fileMap.carousel;
  const message = JSON.parse(
    fs.readFileSync(path.join(outDir, file), 'utf8')
  );

  try {
    const res = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      { to: targetId, messages: [message] },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✓ 已推播 ${type} 卡片給 ${targetId}`, res.data);
  } catch (error) {
    console.error('✗ 推播失敗:', error.response?.data || error.message);
    process.exit(1);
  }
})();
