/**
 * GET /api/health — 健康檢查
 */
const { handlePreflight, jsonRes } = require('./_lib/utils');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (handlePreflight(req, res)) return;
  return jsonRes(res, 200, { status: 'ok', service: 'BallIn API (Vercel Serverless)' });
};
