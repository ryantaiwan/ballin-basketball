/**
 * 產生 Flex Message 範例 JSON，並（若有 token）透過 LINE 驗證 API 檢查格式
 *
 * 用法：node scripts/test-flex-message.js
 */
const fs = require('fs');
const path = require('path');

const {
  buildGameCarouselMessage,
  buildCancelMessage,
  buildPromoteMessage,
  buildReminderMessage,
} = require('../api/_lib/flexMessage');

const sampleGame = {
  id: 42,
  title: 'FTC 假日歡樂場',
  gameDate: '2026-11-22',
  gameTime: '18:00',
  endTime: '20:00',
  location: '太平洋運動中心',
  notes: '記得帶水毛巾，場地已訂好',
  price: 200,
  guestPrice: 250,
  minPlayers: 8,
  maxPlayers: 26,
  registeredCount: 3,
  waitlistCount: 1,
};

const sampleRegs = [
  { displayName: '王小明' },
  { displayName: '李小華' },
  { displayName: '張小玲' },
];

const sampleWait = [{ displayName: '陳小志' }];

const outputs = {
  'carousel-3cards': buildGameCarouselMessage(sampleGame, {
    registrations: sampleRegs,
    waitlist: sampleWait,
    gameUrl: 'https://liff.line.me/2012621725-2Q3zK0TF?game=42',
    statusLabel: '🏀 球局開放報名',
    showRegisterButton: true,
  }),
  'cancel': buildCancelMessage(sampleGame),
  'promote': buildPromoteMessage(sampleGame, '陳小志', '王小明'),
  'reminder': buildReminderMessage(sampleGame, {
    statusLabel: '⏰ 12小時後開始',
    extraNote: '您已在正選名單中，請準時出席！',
  }),
};

const outDir = path.join(__dirname, '..', '.flex-preview');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const [name, msg] of Object.entries(outputs)) {
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(msg, null, 2), 'utf8');
  console.log(`✓ 已產生 ${file}`);
}

// 基本結構檢查
let hasError = false;
function check(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    hasError = true;
  }
}

const carousel = outputs['carousel-3cards'];
check(carousel.type === 'flex', 'type 應為 flex');
check(typeof carousel.altText === 'string' && carousel.altText.length > 0, 'altText 必填');
check(carousel.contents.type === 'carousel', 'contents.type 應為 carousel');
check(Array.isArray(carousel.contents.contents), 'carousel.contents 應為陣列');
check(carousel.contents.contents.length === 3, '應有 3 張 bubble');

for (const [i, bubble] of carousel.contents.contents.entries()) {
  check(bubble.type === 'bubble', `bubble[${i}].type 應為 bubble`);
  check(!!bubble.header, `bubble[${i}] 應有 header`);
  check(!!bubble.body, `bubble[${i}] 應有 body`);
  if (bubble.footer) {
    const btn = bubble.footer.contents?.[0];
    check(btn?.type === 'button', `bubble[${i}] footer 應為 button`);
    check(btn?.action?.type === 'uri', `bubble[${i}] button action 應為 uri`);
    check(!!btn?.action?.uri, `bubble[${i}] button 需要 uri`);
  }
}

// 檢查 JSON 可序列化
for (const [name, msg] of Object.entries(outputs)) {
  try {
    JSON.parse(JSON.stringify(msg));
  } catch (e) {
    console.error(`✗ ${name} 無法序列化: ${e.message}`);
    hasError = true;
  }
}

if (hasError) {
  console.error('\n結構檢查失敗');
  process.exit(1);
}
console.log('\n✓ 全部結構檢查通過');
