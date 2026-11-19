/**
 * API 端點驗證腳本 V2 — 模擬 Vercel req/res 測試所有 API
 * 含付款方式、收款等新功能
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
      const status = this.statusCode;
      const ok = status >= 200 && status < 300;
      console.log(`  → [${status}] ${ok ? '✅' : '❌'} ${JSON.stringify(data).substring(0, 300)}${JSON.stringify(data).length > 300 ? '...' : ''}`);
      return this;
    },
    end() {},
  };
}

function mockReq(method = 'GET', body = {}, headers = {}, query = {}) {
  return {
    method,
    body,
    headers,
    query,
  };
}

const path = require('path');
const apiDir = path.join(__dirname, '..', 'api');

async function runTests() {
  console.log('=== API 端點驗證 V2 ===\n');

  // 1. Health
  console.log('📊 GET /api/health');
  try {
    const healthHandler = require(path.join(apiDir, 'health.js'));
    await healthHandler(mockReq('GET'), mockRes());
  } catch (e) { console.log('  ❌', e.message); }
  console.log('');

  // 2. Games List
  console.log('📋 GET /api/games');
  try {
    const gamesHandler = require(path.join(apiDir, 'games', 'index.js'));
    await gamesHandler(mockReq('GET'), mockRes());
  } catch (e) { console.log('  ❌', e.message); }
  console.log('');

  // 3. Game Detail (id=1)
  console.log('🔎 GET /api/games/1');
  try {
    const detailHandler = require(path.join(apiDir, 'games', '[id].js'));
    const req = mockReq('GET');
    req.query = { id: '1' };
    await detailHandler(req, mockRes());
  } catch (e) { console.log('  ❌', e.message); }
  console.log('');

  // 4. Payment Options
  console.log('💳 GET /api/payment-options');
  try {
    const optionsHandler = require(path.join(apiDir, 'payment-options', 'index.js'));
    await optionsHandler(mockReq('GET'), mockRes());
  } catch (e) { console.log('  ❌', e.message); }
  console.log('');

  console.log('=== 驗證完成 ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('驗證失敗:', err);
  process.exit(1);
});
