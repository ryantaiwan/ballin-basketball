/**
 * 以資料庫真實資料產生球局卡片並推播
 * 用法：node scripts/push-real-flex.js <gameId> <lineUserId>
 */
require('dotenv').config();
const axios = require('axios');
const { getGameWithRoster, getGameUrl } = require('../api/_lib/gameData');
const { buildGameCarouselMessage } = require('../api/_lib/flexMessage');

const TOKEN = process.env.LIFF_CHANNEL_ACCESS_TOKEN;
const gameId = process.argv[2];
const targetId = process.argv[3];

if (!TOKEN || !gameId || !targetId) {
  console.error('用法：node scripts/push-real-flex.js <gameId> <lineUserId>');
  process.exit(1);
}

(async () => {
  const data = await getGameWithRoster(gameId);
  if (!data) {
    console.error('✗ 找不到球局');
    process.exit(1);
  }

  console.log('=== 球局 ===');
  console.log(JSON.stringify(data.game, null, 2));
  console.log('=== 正選 ===');
  console.log(data.registrations.map((r) => r.displayName).join(', ') || '(無)');
  console.log('=== 候補 ===');
  console.log(data.waitlist.map((w) => w.displayName).join(', ') || '(無)');

  const card = buildGameCarouselMessage(data.game, {
    registrations: data.registrations,
    waitlist: data.waitlist,
    gameUrl: getGameUrl(gameId),
    statusLabel: '🏀 球局開放報名',
    showRegisterButton: true,
  });

  const res = await axios.post(
    'https://api.line.me/v2/bot/message/push',
    { to: targetId, messages: [card] },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  console.log('✓ 已推播真實資料卡片', res.data.sentMessages?.[0]?.id);
})().catch((e) => {
  console.error('✗ 失敗:', e.response?.data || e.message);
  process.exit(1);
});
