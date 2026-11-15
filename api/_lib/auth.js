/**
 * LIFF 身份驗證 (Vercel Serverless 版)
 * 改為函數式呼叫，回傳 { user, error } 而非 Express middleware
 */
const axios = require('axios');

/**
 * 驗證 LIFF access token 並取得使用者資訊
 * @param {object} headers - 請求 headers
 * @returns {Promise<{user: object|null, error: string|null, status: number}>}
 */
async function verifyLiffToken(headers) {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: '未提供授權 token', status: 401 };
  }

  const accessToken = authHeader.split(' ')[1];

  try {
    const response = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const { userId, displayName } = response.data;

    if (!userId) {
      return { user: null, error: '無法取得使用者 ID', status: 401 };
    }

    return {
      user: { lineUserId: userId, displayName: displayName },
      error: null,
      status: 200,
    };
  } catch (error) {
    console.error('[Auth] Token 驗證失敗:', error.response?.status, error.message);
    return { user: null, error: 'Token 驗證失敗，請重新登入', status: 401 };
  }
}

/**
 * 可選驗證 — 有 token 就驗證，沒有就回傳 null user
 */
async function optionalVerifyLiffToken(headers) {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: null, status: 200 };
  }
  return verifyLiffToken(headers);
}

module.exports = { verifyLiffToken, optionalVerifyLiffToken };
