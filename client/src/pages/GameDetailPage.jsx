/**
 * 球局詳情頁
 * - 顯示完整球局資訊
 * - 報名 / 加入候補按鈕
 * - 正式報名名單 + 候補名單
 * - 退出球局功能（本人或管理者）
 * - 編輯名稱
 */
import React, { useState, useEffect } from 'react';
import {
  fetchGameDetail,
  registerGame,
  leaveGame,
  updateName,
} from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function GameDetailPage({ gameId, userProfile, isAdmin, onBack, showToast }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(null); // { targetUserId, targetName } or null

  useEffect(() => {
    loadDetail();
  }, [gameId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await fetchGameDetail(gameId);
      setDetail(data);
    } catch (err) {
      console.error('載入詳情失敗:', err);
      showToast('載入失敗', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    try {
      const result = await registerGame(gameId, userProfile.displayName);
      showToast(result.message, result.type === 'waitlist' ? 'warning' : 'success');
      loadDetail();
    } catch (err) {
      const msg = err.response?.data?.error || '報名失敗';
      showToast(msg, 'error');
    }
  };

  const handleLeave = async (targetUserId) => {
    try {
      const result = await leaveGame(gameId, targetUserId);
      showToast(result.message, 'success');
      setConfirmLeave(null);
      loadDetail();
    } catch (err) {
      const msg = err.response?.data?.error || '退出失敗';
      showToast(msg, 'error');
      setConfirmLeave(null);
    }
  };

  const handleUpdateName = async () => {
    if (!nameInput.trim()) {
      showToast('名稱不可為空', 'error');
      return;
    }
    try {
      await updateName(gameId, nameInput.trim());
      showToast('名稱已更新', 'success');
      setEditingName(false);
      loadDetail();
    } catch (err) {
      showToast('更新失敗', 'error');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p>載入中...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="empty-state">
        <div className="icon">❓</div>
        <div className="text">找不到此球局</div>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={onBack}>
          返回列表
        </button>
      </div>
    );
  }

  const { game, registrations, waitlist, myRegistration, myWaitlist } = detail;

  return (
    <>
      <button className="back-btn" onClick={onBack}>← 返回列表</button>

      <div className="detail-page">
        {/* 球局資訊卡 */}
        <div className="detail-card">
          <h2 className="detail-title">{game.title || '球局'}</h2>

          <div className="detail-row">
            <span className="icon">📅</span>
            <div>
              <div className="label">日期</div>
              <div className="value">{game.gameDate}（{['日','一','二','三','四','五','六'][new Date(game.gameDate).getDay()]}）</div>
            </div>
          </div>

          <div className="detail-row">
            <span className="icon">🕐</span>
            <div>
              <div className="label">時間</div>
              <div className="value">{game.gameTime}</div>
            </div>
          </div>

          <div className="detail-row">
            <span className="icon">📍</span>
            <div>
              <div className="label">地點</div>
              <div className="value">{game.location}</div>
            </div>
          </div>

          <div className="detail-row">
            <span className="icon">📝</span>
            <div style={{ flex: 1 }}>
              <div className="label">詳細備註</div>
              <div className="detail-notes">{game.notes || '無備註'}</div>
            </div>
          </div>

          <div className="detail-price-row">
            <span className="detail-price">
              {game.price === 0 ? '免費' : `NT$${game.price}`}
            </span>
            <span className="detail-player-count">
              👥 {game.registeredCount}/{game.maxPlayers}
              {game.waitlistCount > 0 && ` · 候補 ${game.waitlistCount}`}
            </span>
          </div>
        </div>

        {/* 報名/候補按鈕 */}
        <div className="action-section">
          {!myRegistration && !myWaitlist ? (
            game.isFull ? (
              <button className="btn btn-warning" onClick={handleRegister}>
                📋 加入候補（目前候補第 {game.waitlistCount + 1} 位）
              </button>
            ) : (
              <button className="btn btn-success" onClick={handleRegister}>
                ✅ 立即報名（剩 {game.maxPlayers - game.registeredCount} 名額）
              </button>
            )
          ) : myRegistration ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, color: 'var(--success)', fontWeight: 700 }}>
                ✅ 已報名：{myRegistration.displayName}
              </span>
              <button className="btn-danger" onClick={() => setConfirmLeave({ targetUserId: userProfile.userId, targetName: myRegistration.displayName })}>
                退出球局
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, color: 'var(--warning)', fontWeight: 700 }}>
                ⏳ 候補中（第 {myWaitlist.position} 位）：{myWaitlist.displayName}
              </span>
              <button className="btn-danger" onClick={() => setConfirmLeave({ targetUserId: userProfile.userId, targetName: myWaitlist.displayName })}>
                退出候補
              </button>
            </div>
          )}

          {/* 編輯名稱 */}
          {(myRegistration || myWaitlist) && !editingName && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => {
                setNameInput(myRegistration?.displayName || myWaitlist?.displayName || '');
                setEditingName(true);
              }}
            >
              ✏️ 編輯報名名稱
            </button>
          )}

          {editingName && (
            <div style={{ marginTop: 8 }}>
              <div className="name-edit-row">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={20}
                  placeholder="輸入名稱"
                />
                <button className="name-edit-btn" onClick={handleUpdateName}>儲存</button>
                <button className="name-edit-btn" onClick={() => setEditingName(false)}>取消</button>
              </div>
            </div>
          )}
        </div>

        {/* 正式報名名單 */}
        <div className="roster-section">
          <h3>📋 正式報名名單（{registrations.length}/{game.maxPlayers}）</h3>
          {registrations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>尚無人報名</p>
          ) : (
            <div className="roster-list">
              {registrations.map((reg, idx) => {
                const isMe = reg.lineUserId === userProfile?.userId;
                return (
                  <div key={reg.id} className={`roster-item ${isMe ? 'me' : ''}`}>
                    <div className="name">
                      <span className="number">{idx + 1}</span>
                      <span>{reg.displayName}</span>
                      {isMe && <span style={{ fontSize: 12, color: 'var(--accent)' }}>（我）</span>}
                    </div>
                    {/* 管理者可退出他人 */}
                    {isAdmin && !isMe && (
                      <button
                        className="btn-danger"
                        onClick={() => setConfirmLeave({ targetUserId: reg.lineUserId, targetName: reg.displayName })}
                      >
                        退出
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 候補名單 */}
        {waitlist.length > 0 && (
          <div className="roster-section">
            <h3>⏳ 候補名單（{waitlist.length}）</h3>
            <div className="roster-list">
              {waitlist.map((w) => {
                const isMe = w.lineUserId === userProfile?.userId;
                return (
                  <div key={w.id} className={`roster-item waitlist ${isMe ? 'me' : ''}`}>
                    <div className="name">
                      <span className="number">{w.position}</span>
                      <span>{w.displayName}</span>
                      {isMe && <span style={{ fontSize: 12, color: 'var(--warning)' }}>（我）</span>}
                    </div>
                    {/* 管理者可退出他人候補 */}
                    {isAdmin && !isMe && (
                      <button
                        className="btn-danger"
                        onClick={() => setConfirmLeave({ targetUserId: w.lineUserId, targetName: w.displayName })}
                      >
                        退出
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 退出確認對話框 */}
      {confirmLeave && (
        <ConfirmDialog
          title="確認退出"
          message={`確定要讓「${confirmLeave.targetName}」退出此球局嗎？`}
          hint="退出後將發送 LINE 通知。若退出正式報名，候補第一位將自動遞補。"
          confirmText="確認退出"
          cancelText="取消"
          onConfirm={() => handleLeave(confirmLeave.targetUserId)}
          onCancel={() => setConfirmLeave(null)}
        />
      )}
    </>
  );
}
