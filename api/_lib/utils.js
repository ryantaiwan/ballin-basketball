/**
 * Vercel Serverless 共用工具
 */

/** CORS headers */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * 回傳 JSON 回應（含 CORS headers）
 */
function jsonRes(res, status, data) {
  return res.status(status).json(data);
}

/**
 * 處理 OPTIONS preflight 請求
 */
function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.status(200).setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = { CORS_HEADERS, jsonRes, handlePreflight };
