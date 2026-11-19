/**
 * PUT  /api/payment-options/[id] — 修改付款方式（管理者）
 * DELETE /api/payment-options/[id] — 刪除付款方式（管理者）
 * 注意：「現金」為固定選項，不可修改、停用或刪除
 */
const { db } = require('../_lib/db');
const { requireAdmin } = require('../_lib/admin');
const { handlePreflight, jsonRes } = require('../_lib/utils');

// 固定不可改的付款方式
const FIXED_OPTIONS = ['現金'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (handlePreflight(req, res)) return;

  const { id } = req.query;

  if (!id) {
    return jsonRes(res, 400, { error: '缺少付款方式 ID' });
  }

  const numericId = Number(id);

  if (req.method === 'PUT') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    const { name, displayOrder, enabled } = req.body;

    try {
      // 檢查是否存在
      const existing = await db.execute({
        sql: `SELECT * FROM payment_options WHERE id = ?`,
        args: [numericId],
      });

      if (existing.rows.length === 0) {
        return jsonRes(res, 404, { error: '付款方式不存在' });
      }

      const currentName = existing.rows[0].name;

      // 現金固定不可改
      if (FIXED_OPTIONS.includes(currentName)) {
        return jsonRes(res, 403, { error: '「現金」為固定付款方式，不可修改、停用或刪除' });
      }

      const updates = [];
      const args = [];

      if (name !== undefined) {
        updates.push('name = ?');
        args.push(String(name).trim());
      }
      if (displayOrder !== undefined) {
        updates.push('display_order = ?');
        args.push(Number(displayOrder));
      }
      if (enabled !== undefined) {
        updates.push('enabled = ?');
        args.push(enabled ? 1 : 0);
      }

      if (updates.length === 0) {
        return jsonRes(res, 400, { error: '沒有需要更新的欄位' });
      }

      args.push(numericId);
      await db.execute({
        sql: `UPDATE payment_options SET ${updates.join(', ')} WHERE id = ?`,
        args,
      });

      return jsonRes(res, 200, { message: '付款方式已更新' });
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        return jsonRes(res, 409, { error: '此付款方式名稱已存在' });
      }
      console.error('[PaymentOptions] 修改失敗:', error);
      return jsonRes(res, 500, { error: '修改付款方式失敗: ' + error.message });
    }
  }

  if (req.method === 'DELETE') {
    const { user, error, status } = await requireAdmin(req.headers);
    if (error) return jsonRes(res, status, { error });

    try {
      // 檢查是否存在
      const existing = await db.execute({
        sql: `SELECT * FROM payment_options WHERE id = ?`,
        args: [numericId],
      });

      if (existing.rows.length === 0) {
        return jsonRes(res, 404, { error: '付款方式不存在' });
      }

      const currentName = existing.rows[0].name;

      // 現金固定不可刪
      if (FIXED_OPTIONS.includes(currentName)) {
        return jsonRes(res, 403, { error: '「現金」為固定付款方式，不可刪除' });
      }

      await db.execute({
        sql: `DELETE FROM payment_options WHERE id = ?`,
        args: [numericId],
      });

      return jsonRes(res, 200, { message: '付款方式已刪除' });
    } catch (error) {
      console.error('[PaymentOptions] 刪除失敗:', error);
      return jsonRes(res, 500, { error: '刪除付款方式失敗: ' + error.message });
    }
  }

  return jsonRes(res, 405, { error: 'Method Not Allowed' });
};
