/**
 * LIFF 身份驗證中介軟體
 * 透過 LINE Profile API 驗證前端傳來的 access token
 */
const axios = require('axios');

/**
 * 驗證 LIFF access token 並取得使用者資訊
 * 前端透過 liff.getAccessToken() 取得 token 後傳至後端
 */
async function verifyLiffToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供授權 token' });
  }

  const accessToken = authHeader.split(' ')[1];

  try {
    // 透過 LINE Profile API 驗證 token
    const response = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const { userId, displayName } = response.data;

    if (!userId) {
      return res.status(401).json({ error: '無法取得使用者 ID' });
    }

    req.user = {
      lineUserId: userId,
      displayName: displayName,
    };

    next();
  } catch (error) {
    console.error('[Auth] Token 驗證失敗:', error.response?.status, error.message);
    return res.status(401).json({ error: 'Token 驗證失敗，請重新登入' });
  }
}

/**
 * 可選驗證 — 有 token 就驗證，沒有就放行（用於公開 API）
 */
async function optionalVerifyLiffToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  return verifyLiffToken(req, res, next);
}

module.exports = { verifyLiffToken, optionalVerifyLiffToken };
