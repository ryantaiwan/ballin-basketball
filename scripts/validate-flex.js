/**
 * 透過 LINE Messaging API 的 validate endpoint 驗證 Flex Message 格式
 * 用法：node scripts/validate-flex.js
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.LIFF_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('✗ 缺少 LIFF_CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}

const outDir = path.join(__dirname, '..', '.flex-preview');
const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.json'));

(async () => {
  let allOk = true;

  for (const file of files) {
    const message = JSON.parse(
      fs.readFileSync(path.join(outDir, file), 'utf8')
    );

    try {
      const res = await axios.post(
        'https://api.line.me/v2/bot/message/validate/push',
        { messages: [message] },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✓ ${file} — LINE 驗證通過`, res.data);
    } catch (error) {
      allOk = false;
      const detail = error.response?.data || error.message;
      console.error(`✗ ${file} — LINE 驗證失敗:`);
      console.error(JSON.stringify(detail, null, 2));
    }
  }

  process.exit(allOk ? 0 : 1);
})();
