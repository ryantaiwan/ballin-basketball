/**
 * 使用者路由 — 取得個人資訊、檢查管理員狀態
 */
const express = require('express');
const router = express.Router();
const { verifyLiffToken } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const { db } = require('../db');

/**
 * GET /api/user/me
 * 取得當前使用者資訊（是否為管理員）
 */
router.get('/me', verifyLiffToken, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.lineUserId);

    // 若是管理員，取的管理員 display_name
    let adminDisplayName = null;
    if (admin) {
      const adminResult = await db.execute({
        sql: 'SELECT display_name FROM admins WHERE line_user_id = ?',
        args: [req.user.lineUserId],
      });
      if (adminResult.rows.length > 0) {
        adminDisplayName = adminResult.rows[0].display_name;
      }
    }

    res.json({
      lineUserId: req.user.lineUserId,
      displayName: req.user.displayName,
      isAdmin: admin,
      adminDisplayName,
    });
  } catch (error) {
    console.error('[User] 取得資訊失敗:', error);
    res.status(500).json({ error: '取得使用者資訊失敗' });
  }
});

/**
 * GET /api/user/check-admin
 * 檢查是否為管理員
 */
router.get('/check-admin', verifyLiffToken, async (req, res) => {
  try {
    const admin = await isAdmin(req.user.lineUserId);
    res.json({ isAdmin: admin });
  } catch (error) {
    console.error('[User] 管理員檢查失敗:', error);
    res.status(500).json({ error: '檢查失敗' });
  }
});

module.exports = router;
