/**
 * GET /api/payment-options  — 取得所有啟用的付款方式（一般使用者）
 * POST /api/payment-options — 新增付款方式（管理者）
 */
const { db } = require('../_lib/db');
const { requireAdmin } = require('../_lib/admin');
const { handlePreflight, jsonRes } = require('../_lib/utils');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') {
    try {
      const result = await db.execute(`SELECT * FROM payment_options ORDER BY display_order ASC, id ASC`);

      const options = result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        displayOrder: row.display_order,
        enabled: row.enabled === 1,
      }));

      return jsonRes(res, 200, { options });
    } catch (error) {
      console.error('[PaymentOptions] 取得列表失敗:', error);
      return jsonRes(res, 500, { error: '取得付款方式失敗: ' + error.message });
    }
  }

  if (req.method === 'POST') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    const { name, displayOrder } = req.body;

    if (!name || !name.trim()) {
      return jsonRes(res, 400, { error: '付款方式名稱為必填' });
    }

    try {
      // 取得最大 display_order
      const maxOrder = await db.execute(`SELECT MAX(display_order) as max_order FROM payment_options`);
      const nextOrder = displayOrder != null ? Number(displayOrder) : (maxOrder.rows[0].max_order || 0) + 1;

      await db.execute({
        sql: `INSERT INTO payment_options (name, display_order, enabled) VALUES (?, ?, 1)`,
        args: [name.trim(), nextOrder],
      });

      return jsonRes(res, 201, { message: '付款方式已新增' });
    } catch (error) {
      // UNIQUE 衝突
      if (error.message && error.message.includes('UNIQUE')) {
        return jsonRes(res, 409, { error: '此付款方式已存在' });
      }
      console.error('[PaymentOptions] 新增失敗:', error);
      return jsonRes(res, 500, { error: '新增付款方式失敗: ' + error.message });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
