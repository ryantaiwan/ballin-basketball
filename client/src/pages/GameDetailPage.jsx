/**
 * 球局詳情頁
 * - 顯示完整球局資訊（含結束時間、付款方式）
 * - 報名 / 加入候補按鈕
 * - 正式報名名單 + 候補名單
 * - 退出球局功能（本人或管理者）
 * - 編輯名稱
 * - 選擇/修改付款方式（本人，單選）
 * - 管理者標記已收款 / 未收款
 */
import React, { useState, useEffect } from 'react';
import {
  fetchGameDetail,
  fetchGameFlex,
  registerGame,
  leaveGame,
  guestRegister,
  updateName,
  updatePaymentMethod,
  markPaid,
} from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function GameDetailPage({ gameId, userProfile, isAdmin, onBack, showToast, sendMessages }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(null);
  const [editingPayment, setEditingPayment] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');

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

  const handleLeave = async (targetUserId, targetDisplayName) => {
    try {
      const result = await leaveGame(gameId, targetUserId, targetDisplayName);
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

  const handleUpdatePayment = async (method) => {
    try {
      await updatePaymentMethod(gameId, method);
      showToast('付款方式已更新', 'success');
      setEditingPayment(false);
      loadDetail();
    } catch (err) {
      const msg = err.response?.data?.error || '更新失敗';
      showToast(msg, 'error');
    }
  };

  const handleMarkPaid = async (targetUserId, paid, targetDisplayName) => {
    try {
      await markPaid(gameId, targetUserId, paid, targetDisplayName);
      showToast(paid ? '已標記為已收款' : '已標記為未收款', 'success');
      loadDetail();
    } catch (err) {
      const msg = err.response?.data?.error || '操作失敗';
      showToast(msg, 'error');
    }
  };

  const handleShareToChat = async () => {
    if (!sendMessages) {
      showToast('LIFF 功能未初始化', 'error');
      return;
    }
    setSharing(true);
    try {
      const flexMessage = await fetchGameFlex(gameId);
      const ok = await sendMessages(flexMessage);
      if (ok) {
        showToast('已分享球局卡片到聊天室', 'success');
      } else {
        showToast('分享失敗，請在 LINE 內開啟此頁面', 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.error || '取得卡片失敗';
      showToast(msg, 'error');
    } finally {
      setSharing(false);
    }
  };

  const handleGuestRegister = async () => {
    if (!guestName.trim()) {
      showToast('請輸入臨打人員名稱', 'error');
      return;
    }
    try {
      const result = await guestRegister(gameId, guestName.trim());
      showToast(result.message, result.type === 'waitlist' ? 'warning' : 'success');
      setShowGuestForm(false);
      setGuestName('');
      loadDetail();
    } catch (err) {
      const msg = err.response?.data?.error || '臨打代報失敗';
      showToast(msg, 'error');
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

  const { game, registrations, waitlist, myRegistration, myWaitlist, myPayment } = detail;
  const availablePaymentMethods = game.paymentMethods || [];

  // 檢查是否超過退出截止時間
  const now = new Date();
  const gameStart = new Date(`${game.gameDate} ${game.gameTime}`.replace(' ', 'T'));
  const quitDeadlinePassed = game.quitDeadline
    ? now > new Date(game.quitDeadline.replace(' ', 'T'))
    : now >= gameStart; // 無設定截止時間則以開始時間為準
  const registerClosed = now >= gameStart; // 超過開始時間不能再報名

  // 臨打代報條件：球局發佈後24h + 使用者有報名（正選或候補）
  const publishedAt = game.publishedAt || '';
  const publishedTime = publishedAt ? new Date(publishedAt.replace(' ', 'T')) : null;
  const hoursSincePublished = publishedTime ? (now.getTime() - publishedTime.getTime()) / (60 * 60 * 1000) : 0;
  const canGuestRegister = publishedTime && hoursSincePublished >= 24 && (myRegistration || myWaitlist);

  return (
    <>
      <button className="back-btn" onClick={onBack}>← 返回列表</button>

      <div className="detail-page">
        {/* 球局資訊卡 */}
        <div className="detail-card">
          {/* 標題列：球局標題 + 分享到群組按鈕 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 className="detail-title" style={{ marginBottom: 0 }}>{game.title || '球局'}</h2>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleShareToChat}
              disabled={sharing}
              style={{ whiteSpace: 'nowrap' }}
            >
              {sharing ? '分享中...' : '📢 分享到群組'}
            </button>
          </div>

          <div className="detail-row">
            <span className="icon">📅</span>
            <div style={{ flex: 1 }}>
              <div className="label">日期 / 時間</div>
              <div className="value">
                {game.gameDate}（{['日','一','二','三','四','五','六'][new Date(game.gameDate).getDay()]}）
                <span style={{ marginLeft: 8 }}>
                  {game.gameTime}
                  {game.endTime ? ` ~ ${game.endTime}` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="detail-row">
            <span className="icon">📍</span>
            <div>
              <div className="label">地點</div>
              <div className="value">{game.location}</div>
            </div>
          </div>

          {availablePaymentMethods.length > 0 && (
            <div className="detail-row">
              <span className="icon">💳</span>
              <div>
                <div className="label">付款方式</div>
                <div className="value">{availablePaymentMethods.join(' / ')}</div>
              </div>
            </div>
          )}

          <div className="detail-row">
            <span className="icon">📝</span>
            <div style={{ flex: 1 }}>
              <div className="label">詳細備註</div>
              <div className="detail-notes">{game.notes || '無備註'}</div>
            </div>
          </div>

          <div className="detail-price-row">
            <span className="detail-price" style={{ fontSize: '18px' }}>
              {game.price === 0 ? '免費' : `NT$${game.price}`}{game.guestPrice > 0 && `（臨打 NT$${game.guestPrice}）`}
            </span>
            <span className="detail-player-count">
              👥 {game.registeredCount}/{game.maxPlayers}
              {game.minPlayers > 0 && ` · 最少 ${game.minPlayers} 人`}
              {game.waitlistCount > 0 && ` · ⏳ ${game.waitlistCount}`}
            </span>
          </div>
        </div>

        {/* 報名/候補按鈕 */}
        <div className="action-section">
          {!myRegistration && !myWaitlist ? (
            game.status === 'open' && !registerClosed ? (
              game.isFull ? (
                <button className="btn btn-warning" onClick={handleRegister}>
                  ⏳ 加入候補（目前候補第 {game.waitlistCount + 1} 位）
                </button>
              ) : (
                <button className="btn btn-success" onClick={handleRegister}>
                  ✅ 立即報名（剩 {game.maxPlayers - game.registeredCount} 名額）
                </button>
              )
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: 12 }}>
                {registerClosed ? '報名已截止' : `此球局目前狀態為「${game.status === 'in_progress' ? '進行中' : '已結束'}」，無法報名`}
              </div>
            )
          ) : myRegistration ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, color: 'var(--success)', fontWeight: 700 }}>
                ✅ 已報名：{myRegistration.displayName}
              </span>
              {!quitDeadlinePassed && (
                <button className="btn-danger" onClick={() => setConfirmLeave({ targetUserId: userProfile.userId, targetName: myRegistration.displayName })}>
                  退出球局
                </button>
              )}
              {quitDeadlinePassed && !isAdmin && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>退出已截止</span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, color: 'var(--warning)', fontWeight: 700 }}>
                ⏳ 候補中（第 {myWaitlist.position} 位）：{myWaitlist.displayName}
              </span>
              {!quitDeadlinePassed && (
                <button className="btn-danger" onClick={() => setConfirmLeave({ targetUserId: userProfile.userId, targetName: myWaitlist.displayName })}>
                  退出候補
                </button>
              )}
              {quitDeadlinePassed && !isAdmin && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>退出已截止</span>
              )}
            </div>
          )}

          {/* 臨打代報按鈕（球局發佈後24h + 有報名的人） */}
          {canGuestRegister && !showGuestForm && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setShowGuestForm(true)}
            >
              🏀 臨打代報
            </button>
          )}

          {showGuestForm && (
            <div style={{ marginTop: 8 }}>
              <div className="name-edit-row">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={20}
                  placeholder="輸入臨打人員名稱"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGuestRegister(); } }}
                />
                <button className="name-edit-btn" onClick={handleGuestRegister}>儲存</button>
                <button className="name-edit-btn" onClick={() => { setShowGuestForm(false); setGuestName(''); }}>取消</button>
              </div>
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

          {/* 付款方式選擇/修改（本人已報名時） */}
          {myRegistration && availablePaymentMethods.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>💳 付款方式</span>
                {!editingPayment && (
                  <button className="name-edit-btn" style={{ fontSize: 12 }} onClick={() => setEditingPayment(true)}>
                    修改
                  </button>
                )}
              </div>
              {editingPayment ? (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {availablePaymentMethods.map((method) => (
                      <button
                        key={method}
                        className={`payment-chip ${(myPayment?.paymentMethod || '現金') === method ? 'active' : ''}`}
                        style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                        onClick={() => handleUpdatePayment(method)}
                      >
                        {(myPayment?.paymentMethod || '現金') === method ? '✓ ' : ''}{method}
                      </button>
                    ))}
                  </div>
                  <button className="name-edit-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setEditingPayment(false)}>
                    取消
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                  {myPayment?.paymentMethod || '現金'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 正選名單 */}
        <div className="roster-section">
          <h3>📋 正選名單（{registrations.length}/{game.maxPlayers}）</h3>
          {registrations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>尚無人報名</p>
          ) : (
            <div className="roster-list">
              {(() => {
                // 先渲染一般報名，再渲染臨打代報
                const normalRegs = registrations.filter(r => !r.isGuest);
                const guestRegs = registrations.filter(r => r.isGuest);
                const allRegs = [...normalRegs, ...guestRegs];
                let numberCounter = 0;
                return allRegs.map((reg) => {
                  const isMe = reg.lineUserId === userProfile?.userId;
                  const payment = reg.payment || {};
                  const isGuest = reg.isGuest;
                  if (!isGuest) numberCounter++;
                  return (
                    <div
                      key={reg.id}
                      className={`roster-item ${isMe ? 'me' : ''} ${isGuest ? 'guest-item' : ''}`}
                      style={isGuest ? { background: 'var(--bg-card-hover)', borderLeft: '3px solid var(--text-muted)' } : {}}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="name">
                          <span className="number">{isGuest ? '🏀' : numberCounter}</span>
                          <span>{reg.displayName}</span>
                          {isMe && !isGuest && <span style={{ fontSize: 12, color: 'var(--accent)' }}>（我）</span>}
                        </div>
                        {/* 付款資訊 */}
                        {(payment.paymentMethod || (isAdmin && game.price > 0) || game.price > 0) && (
                          <div style={{ marginLeft: 34, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              💳 {isGuest ? '不限定' : (payment.paymentMethod || '現金')}
                            </span>
                            {game.price > 0 && (
                              isAdmin ? (
                                <button
                                  className={`status-tag ${payment.paid ? 'paid' : 'unpaid'} toggle-paid-btn`}
                                  onClick={() => handleMarkPaid(reg.lineUserId, !payment.paid, isGuest ? reg.displayName : undefined)}
                                >
                                  {payment.paid ? '✅ 已收款（點擊取消）' : '⏳ 未收款（點擊標記）'}
                                </button>
                              ) : (
                                <span className={`status-tag ${payment.paid ? 'paid' : 'unpaid'}`}>
                                  {payment.paid ? '✅ 已收款' : '⏳ 未收款'}
                                </span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* 退出按鈕：臨打只有管理者和代報人可以退出 */}
                        {isGuest ? (
                          (isAdmin || isMe) && (
                            <button
                              className="btn-danger"
                              onClick={() => setConfirmLeave({ targetUserId: reg.lineUserId, targetName: reg.displayName, targetDisplayName: reg.displayName })}
                            >
                              退出
                            </button>
                          )
                        ) : (
                          /* 一般報名：管理者可退出他人 */
                          isAdmin && !isMe && (
                            <button
                              className="btn-danger"
                              onClick={() => setConfirmLeave({ targetUserId: reg.lineUserId, targetName: reg.displayName })}
                            >
                              退出
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
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
                const isGuest = w.isGuest;
                return (
                  <div
                    key={w.id}
                    className={`roster-item waitlist ${isMe ? 'me' : ''}`}
                    style={isGuest ? { background: 'var(--bg-card-hover)', borderLeft: '3px solid var(--text-muted)' } : {}}
                  >
                    <div className="name">
                      <span className="number waitlist-icon">⏳</span>
                      <span>{w.displayName}</span>
                      {isMe && !isGuest && <span style={{ fontSize: 12, color: 'var(--warning)' }}>（我）</span>}
                    </div>
                    {/* 退出按鈕：臨打只有管理者和代報人可以退出 */}
                    {isGuest ? (
                      (isAdmin || isMe) && (
                        <button
                          className="btn-danger"
                          onClick={() => setConfirmLeave({ targetUserId: w.lineUserId, targetName: w.displayName, targetDisplayName: w.displayName })}
                        >
                          退出
                        </button>
                      )
                    ) : (
                      /* 一般候補：管理者可退出他人 */
                      isAdmin && !isMe && (
                        <button
                          className="btn-danger"
                          onClick={() => setConfirmLeave({ targetUserId: w.lineUserId, targetName: w.displayName })}
                        >
                          退出
                        </button>
                      )
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
          onConfirm={() => handleLeave(confirmLeave.targetUserId, confirmLeave.targetDisplayName)}
          onCancel={() => setConfirmLeave(null)}
        />
      )}
    </>
  );
}
