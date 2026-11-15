/**
 * API 端點驗證腳本 — 模擬 Vercel req/res 測試所有 API
 */
require('dotenv').config();

// 模擬 Vercel res 物件
function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(data) {
      this._body = data;
      console.log(`  → Status: ${this.statusCode}`);
      console.log(`  → Body: ${JSON.stringify(data).substring(0, 200)}${JSON.stringify(data).length > 200 ? '...' : ''}`);
    },
    end() { console.log('  → (ended)'); },
  };
}

function mockReq(method = 'GET', body = {}, headers = {}) {
  return {
    method,
    body,
    headers,
    query: {},
  };
}

const path = require('path');
const apiDir = path.join(__dirname, '..', 'api');

async function runTests() {
  console.log('=== API 端點驗證 ===\n');

  // 1. Health
  console.log('📊 測試 GET /api/health');
  try {
    const healthHandler = require(path.join(apiDir, 'health.js'));
    await healthHandler(mockReq('GET'), mockRes());
  } catch (e) { console.log('  ❌', e.message); }
  console.log('');

  // 2. Games List
  console.log('📋 測試 GET /api/games');
  try {
    const gamesHandler = require(path.join(apiDir, 'games', 'index.js'));
    const req = mockReq('GET');
    await gamesHandler(req, mockRes());
  } catch (e) { console.log('  ❌', e.message); }
  console.log('');

  // 3. Game Detail (id=1)
  console.log('🔎 測試 GET /api/games/1');
  try {
    const detailHandler = require(path.join(apiDir, 'games', '[id].js'));
    const req = mockReq('GET');
    req.query = { id: '1' };
    await detailHandler(req, mockRes());
  } catch (e) { console.log('  ❌', e.message); }
  console.log('');

  console.log('=== 驗證完成 ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('驗證失敗:', err);
  process.exit(1);
});
