/**
 * 管理者頁面 — 球局新增、編輯、刪除
 */
import React, { useState, useEffect } from 'react';
import { fetchGames, createGame, updateGame, deleteGame } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const EMPTY_FORM = {
  title: '',
  gameDate: '',
  gameTime: '19:00',
  location: '',
  notes: '',
  price: 100,
  maxPlayers: 20,
};

export default function AdminPage({ onBack, showToast }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    setLoading(true);
    try {
      const data = await fetchGames();
      setGames(data.games);
    } catch (err) {
      showToast('載入失敗', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (game) => {
    setForm({
      title: game.title || '',
      gameDate: game.gameDate,
      gameTime: game.gameTime,
      location: game.location,
      notes: game.notes,
      price: game.price,
      maxPlayers: game.maxPlayers,
    });
    setEditingId(game.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.gameDate || !form.gameTime || !form.location) {
      showToast('日期、時間、地點為必填', 'error');
      return;
    }

    try {
      if (editingId) {
        await updateGame(editingId, form);
        showToast('球局已更新', 'success');
      } else {
        await createGame(form);
        showToast('球局已建立', 'success');
      }
      setShowForm(false);
      loadGames();
    } catch (err) {
      const msg = err.response?.data?.error || '操作失敗';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteGame(deleteTarget.id);
      showToast('球局已刪除', 'success');
      setDeleteTarget(null);
      loadGames();
    } catch (err) {
      showToast('刪除失敗', 'error');
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <button className="back-btn" onClick={onBack}>← 返回列表</button>

      <div className="admin-page">
        <h2>⚙️ 管理後台</h2>

        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={handleOpenCreate}>
          ➕ 新增球局
        </button>

        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <p>載入中...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🏀</div>
            <div className="text">尚無球局，點上方按鈕新增</div>
          </div>
        ) : (
          <div className="game-list">
            {games.map((game) => (
              <div key={game.id} className="game-card" style={{ cursor: 'default' }}>
                <div className="game-card-header">
                  <span className="game-card-title">{game.title || '球局'}</span>
                  <span className="game-card-date">{game.gameDate} {game.gameTime}</span>
                </div>
                <div className="game-card-info">
                  <div className="info-row"><span className="info-label">📍</span><span>{game.location}</span></div>
                  <div className="info-row"><span className="info-label">👥</span><span>{game.registeredCount}/{game.maxPlayers} · 候補 {game.waitlistCount}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => handleOpenEdit(game)}>
                    ✏️ 編輯
                  </button>
                  <button className="btn btn-danger" onClick={() => setDeleteTarget(game)}>
                    🗑️ 刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增/編輯表單 Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? '編輯球局' : '新增球局'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>標題</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="例：週末歡樂打"
                  maxLength={30}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>日期 *</label>
                  <input
                    type="date"
                    value={form.gameDate}
                    onChange={(e) => setForm({ ...form, gameDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>時間 *</label>
                  <input
                    type="time"
                    value={form.gameTime}
                    onChange={(e) => setForm({ ...form, gameTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>地點 *</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="例：台北市中正運動中心 B1"
                  required
                />
              </div>

              <div className="form-group">
                <label>備註</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="詳細備註說明..."
                  maxLength={500}
                  rows={4}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>價格 (NT$)</label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label>人數上限</label>
                  <input
                    type="number"
                    value={form.maxPlayers}
                    onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })}
                    min={1}
                    max={50}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
                <button type="submit" className="btn btn-primary">{editingId ? '儲存' : '建立'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 刪除確認 */}
      {deleteTarget && (
        <ConfirmDialog
          title="確認刪除"
          message={`確定要刪除「${deleteTarget.title || '球局'}」（${deleteTarget.gameDate}）嗎？`}
          hint="刪除後報名資料也會一併清除，無法復原。"
          confirmText="確認刪除"
          cancelText="取消"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
