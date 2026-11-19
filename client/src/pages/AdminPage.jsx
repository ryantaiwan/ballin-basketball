/**
 * 管理者頁面 — 球局新增、編輯、刪除
 * 功能：
 *  - 日期選擇
 *  - 開始/結束時間下拉式選擇（上午/下午，每30分鐘）
 *  - 費用 + 臨打者費用 + 最少人數限制
 *  - 付款方式多選
 *  - 付款方式維護（CRUD）— 現金固定不可改
 *  - 分頁：報名中 / 進行中 / 已結束球局
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchGames, createGame, updateGame, deleteGame, publishGame,
  fetchPaymentOptions, createPaymentOption, updatePaymentOption, deletePaymentOption,
} from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * 產生開始/結束時間選項（06:00 ~ 23:30，每30分鐘，24小時制）
 */
function generateTimeOptions() {
  const options = [];
  for (let h = 6; h <= 23; h++) {
    for (let m = 0; m <= 30; m += 30) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      options.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
    }
  }
  return options;
}

/**
 * 產生退出截止時間選項（00:00 ~ 23:00，每1小時，24小時制）
 */
function generateQuitTimeOptions() {
  const options = [];
  for (let h = 0; h <= 23; h++) {
    const hh = String(h).padStart(2, '0');
    options.push({ value: `${hh}:00`, label: `${hh}:00` });
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();
const QUIT_TIME_OPTIONS = generateQuitTimeOptions();
const PRICE_OPTIONS = [0, 50, 100, 150, 200, 250, 300];

/**
 * 產生新增球局的預設表單（日期為當天+3天，退出截止為當天）
 */
function createDefaultForm() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const plus3 = new Date(today.getTime() + 3 * 24 * 60 * 60000);
  const plus3Str = plus3.toISOString().slice(0, 10);
  return {
    title: '有Ball必In 固定場',
    gameDate: plus3Str,
    gameTime: '08:00',
    endTime: '10:00',
    quitDeadlineDate: todayStr,
    quitDeadlineTime: '18:00',
    location: '台中市太平國民運動中心 3F籃球場',
    notes: '',
    price: 100,
    guestPrice: 150,
    minPlayers: 15,
    maxPlayers: 23,
    paymentMethods: [],
    publishMode: 'immediate',
    publishDate: todayStr,
    publishTime: '12:00',
  };
}

export default function AdminPage({ onBack, showToast }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createDefaultForm());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('open'); // open / in_progress / scheduled / ended
  const [paymentOptions, setPaymentOptions] = useState([]);
  const [showPaymentMgmt, setShowPaymentMgmt] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');

  useEffect(() => {
    loadGames();
    loadPaymentOptions();
  }, []);

  const loadGames = async () => {
    setLoading(true);
    try {
      const data = await fetchGames(true);
      setGames(data.games);
    } catch (err) {
      showToast('載入失敗', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentOptions = async () => {
    try {
      const data = await fetchPaymentOptions();
      setPaymentOptions(data.options);
    } catch (err) {
      console.error('付款方式載入失敗:', err);
    }
  };

  // 分類球局
  // - scheduled: 排程中（指定時間發佈，尚未到時間）
  // - open: 報名中
  // - in_progress: 開始時間 ~ 結束時間之間
  // - ended: 超過結束時間 OR 已刪除(cancelled)
  const now = new Date();
  const openGames = [];
  const inProgressGames = [];
  const scheduledGames = [];
  const endedGames = [];

  for (const g of games) {
    if (g.status === 'cancelled') {
      endedGames.push(g);
      continue;
    }
    if (g.status === 'scheduled') {
      scheduledGames.push(g);
      continue;
    }
    if (g.status === 'ended') {
      endedGames.push(g);
      continue;
    }
    if (g.status === 'in_progress') {
      inProgressGames.push(g);
      continue;
    }
    // open — 需判斷是否已在開始~結束之間
    const gameStart = new Date(`${g.gameDate} ${g.gameTime}`.replace(' ', 'T'));
    const endTimeStr = g.endTime || '';
    const gameEnd = endTimeStr
      ? new Date(`${g.gameDate} ${endTimeStr}`.replace(' ', 'T'))
      : new Date(gameStart.getTime() + 2 * 60 * 60000);
    if (now >= gameStart && now < gameEnd) {
      inProgressGames.push(g);
    } else if (now >= gameEnd) {
      endedGames.push(g);
    } else {
      openGames.push(g);
    }
  }

  // 判斷是否可編輯：已結束超過2天或已刪除的不能編輯
  const canEdit = (game) => {
    if (game.status === 'cancelled') return false;
    const endTimeStr = game.endTime || '';
    const gameEnd = endTimeStr
      ? new Date(`${game.gameDate} ${endTimeStr}`.replace(' ', 'T'))
      : new Date(`${game.gameDate} ${game.gameTime}`.replace(' ', 'T'));
    const twoDaysMs = 2 * 24 * 60 * 60000;
    if (now.getTime() - gameEnd.getTime() > twoDaysMs) return false;
    return true;
  };

  const currentTabGames =
    activeTab === 'open' ? openGames :
    activeTab === 'in_progress' ? inProgressGames :
    activeTab === 'scheduled' ? scheduledGames :
    endedGames;

  const handleOpenCreate = () => {
    const defaults = createDefaultForm();
    setForm({ ...defaults, paymentMethods: paymentOptions.filter(o => o.enabled).map(o => o.name) });
    setEditingId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (game) => {
    // 解析 quitDeadline (格式: YYYY-MM-DD HH:MM)
    let quitDate = '';
    let quitTime = '';
    if (game.quitDeadline) {
      const parts = game.quitDeadline.split(' ');
      quitDate = parts[0] || '';
      quitTime = parts[1] || '';
    }
    // 解析 publishAt (格式: YYYY-MM-DD HH:MM)
    let pubDate = '';
    let pubTime = '';
    if (game.publishAt) {
      const parts = game.publishAt.split(' ');
      pubDate = parts[0] || '';
      pubTime = parts[1] || '';
    }
    setForm({
      title: game.title || '',
      gameDate: game.gameDate,
      gameTime: game.gameTime,
      endTime: game.endTime || '',
      quitDeadlineDate: quitDate,
      quitDeadlineTime: quitTime,
      location: game.location,
      notes: game.notes,
      price: game.price,
      guestPrice: game.guestPrice || 0,
      minPlayers: game.minPlayers || 0,
      maxPlayers: game.maxPlayers,
      paymentMethods: game.paymentMethods || [],
      publishMode: game.publishMode || 'immediate',
      publishDate: pubDate,
      publishTime: pubTime || '12:00',
    });
    setEditingId(game.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.gameDate || !form.gameTime || !form.location) {
      showToast('日期、開始時間、地點為必填', 'error');
      return;
    }
    if (!form.endTime) {
      showToast('結束時間為必填', 'error');
      return;
    }

    // 組合 quitDeadline
    const quitDeadline = form.quitDeadlineDate && form.quitDeadlineTime
      ? `${form.quitDeadlineDate} ${form.quitDeadlineTime}`
      : '';

    // 組合 publishAt
    const publishAt = form.publishMode === 'scheduled' && form.publishDate && form.publishTime
      ? `${form.publishDate} ${form.publishTime}`
      : '';

    const submitData = {
      ...form,
      quitDeadline,
      publishAt,
    };
    delete submitData.quitDeadlineDate;
    delete submitData.quitDeadlineTime;
    delete submitData.publishDate;
    delete submitData.publishTime;

    try {
      if (editingId) {
        await updateGame(editingId, submitData);
        showToast('球局已更新', 'success');
      } else {
        await createGame(submitData);
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

  const handlePublishNow = async (game) => {
    try {
      await publishGame(game.id);
      showToast('球局已立即發佈', 'success');
      loadGames();
    } catch (err) {
      const msg = err.response?.data?.error || '發佈失敗';
      showToast(msg, 'error');
    }
  };

  // 付款方式多選切換
  const togglePaymentMethod = (name) => {
    setForm((prev) => {
      const methods = prev.paymentMethods || [];
      return {
        ...prev,
        paymentMethods: methods.includes(name)
          ? methods.filter((m) => m !== name)
          : [...methods, name],
      };
    });
  };

  // 付款方式維護
  const handleAddOption = async () => {
    if (!newOptionName.trim()) {
      showToast('名稱不可為空', 'error');
      return;
    }
    try {
      await createPaymentOption(newOptionName.trim());
      showToast('付款方式已新增', 'success');
      setNewOptionName('');
      loadPaymentOptions();
    } catch (err) {
      const msg = err.response?.data?.error || '新增失敗';
      showToast(msg, 'error');
    }
  };

  const handleToggleOptionEnabled = async (option) => {
    if (option.name === '現金') {
      showToast('「現金」為固定付款方式，不可停用', 'error');
      return;
    }
    try {
      await updatePaymentOption(option.id, { enabled: !option.enabled });
      showToast('已更新', 'success');
      loadPaymentOptions();
    } catch (err) {
      const msg = err.response?.data?.error || '更新失敗';
      showToast(msg, 'error');
    }
  };

  const handleDeleteOption = async (option) => {
    if (option.name === '現金') {
      showToast('「現金」為固定付款方式，不可刪除', 'error');
      return;
    }
    try {
      await deletePaymentOption(option.id);
      showToast('已刪除', 'success');
      loadPaymentOptions();
    } catch (err) {
      const msg = err.response?.data?.error || '刪除失敗';
      showToast(msg, 'error');
    }
  };

  const statusLabel = (status) => {
    switch (status) {
      case 'open': return { text: '報名中', cls: 'open' };
      case 'in_progress': return { text: '進行中', cls: 'in_progress' };
      case 'scheduled': return { text: '排程中', cls: 'scheduled' };
      case 'ended': return { text: '已結束', cls: 'ended' };
      case 'cancelled': return { text: '已刪除', cls: 'cancelled' };
      default: return { text: status, cls: '' };
    }
  };

  return (
    <>
      <button className="back-btn" onClick={onBack}>← 返回列表</button>

      <div className="admin-page">
        <h2>⚙️ 管理後台</h2>

        {/* 操作按鈕 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ width: 'auto', flex: 1, minWidth: 140 }} onClick={handleOpenCreate}>
            ➕ 新增球局
          </button>
          <button className="btn btn-secondary" style={{ width: 'auto', flex: 1, minWidth: 140 }} onClick={() => setShowPaymentMgmt(true)}>
            💳 付款方式維護
          </button>
        </div>

        {/* 分頁切換 */}
        <div className="view-toggle" style={{ marginBottom: 16 }}>
          <button className={activeTab === 'open' ? 'active' : ''} onClick={() => setActiveTab('open')}>
            報名中 ({openGames.length})
          </button>
          <button className={activeTab === 'in_progress' ? 'active' : ''} onClick={() => setActiveTab('in_progress')}>
            進行中 ({inProgressGames.length})
          </button>
          <button className={activeTab === 'scheduled' ? 'active' : ''} onClick={() => setActiveTab('scheduled')}>
            排程中 ({scheduledGames.length})
          </button>
          <button className={activeTab === 'ended' ? 'active' : ''} onClick={() => setActiveTab('ended')}>
            已結束 ({endedGames.length})
          </button>
        </div>

        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <p>載入中...</p>
          </div>
        ) : currentTabGames.length === 0 ? (
          <div className="empty-state">
            <img src="/logo.jpg" alt="logo" className="empty-logo" />
            <div className="text">此分頁尚無球局</div>
          </div>
        ) : (
          <div className="game-list">
            {currentTabGames.map((game) => {
              const sl = statusLabel(game.status);
              const editable = canEdit(game);
              return (
                <div key={game.id} className="game-card" style={{ cursor: 'default' }}>
                  <div className="game-card-header">
                    <span className="game-card-title">{game.title || '球局'}</span>
                    <span className={`status-tag ${sl.cls}`}>{sl.text}</span>
                  </div>
                  <div className="game-card-info">
                    <div className="info-row">
                      <span className="info-label">📅</span>
                      <span>{game.gameDate}　{game.gameTime}{game.endTime ? ` ~ ${game.endTime}` : ''}</span>
                    </div>
                    {game.status === 'scheduled' && game.publishAt && (
                      <div className="info-row">
                        <span className="info-label">🔔</span>
                        <span>發佈時間：{game.publishAt}</span>
                      </div>
                    )}
                    <div className="info-row"><span className="info-label">📍</span><span>{game.location}</span></div>
                    <div className="info-row">
                      <span className="info-label">💰</span>
                      <span>
                        {game.price === 0 ? '免費' : `NT$${game.price}`}
                        {game.guestPrice > 0 && `（臨打 NT$${game.guestPrice}）`}
                        {game.minPlayers > 0 && ` · 最少 ${game.minPlayers} 人`}
                      </span>
                    </div>
                    {game.paymentMethods && game.paymentMethods.length > 0 && (
                      <div className="info-row"><span className="info-label">💳</span><span>{game.paymentMethods.join(' / ')}</span></div>
                    )}
                    <div className="info-row"><span className="info-label">👥</span><span>{game.registeredCount}/{game.maxPlayers} · ⏳ {game.waitlistCount}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {game.status === 'scheduled' && (
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => handlePublishNow(game)}>
                        📢 立即發佈
                      </button>
                    )}
                    {editable ? (
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => handleOpenEdit(game)}>
                        ✏️ 編輯
                      </button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1, opacity: 0.4, cursor: 'not-allowed' }} disabled>
                        🔒 已鎖定
                      </button>
                    )}
                    {editable && (
                      <button className="btn btn-danger" onClick={() => setDeleteTarget(game)}>
                        🗑️ 刪除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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

              <div className="form-group">
                <label>日期 *</label>
                <input
                  type="date"
                  value={form.gameDate}
                  onChange={(e) => setForm({ ...form, gameDate: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>開始時間 *</label>
                  <select
                    value={form.gameTime}
                    onChange={(e) => setForm({ ...form, gameTime: e.target.value })}
                    required
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>結束時間 *</label>
                  <select
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    required
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>退出截止日期</label>
                  <input
                    type="date"
                    value={form.quitDeadlineDate}
                    onChange={(e) => setForm({ ...form, quitDeadlineDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>退出截止時間</label>
                  <select
                    value={form.quitDeadlineTime}
                    onChange={(e) => setForm({ ...form, quitDeadlineTime: e.target.value })}
                  >
                    <option value="">不限</option>
                    {QUIT_TIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
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
                  <label>費用 (NT$)</label>
                  <select
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  >
                    {PRICE_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v === 0 ? '免費' : `NT$${v}`}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>臨打費用 (NT$)</label>
                  <select
                    value={form.guestPrice}
                    onChange={(e) => setForm({ ...form, guestPrice: Number(e.target.value) })}
                  >
                    {PRICE_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v === 0 ? '免費' : `NT$${v}`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>最少人數</label>
                  <input
                    type="number"
                    value={form.minPlayers}
                    onChange={(e) => setForm({ ...form, minPlayers: Number(e.target.value) })}
                    min={0}
                    placeholder="預設 15"
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
                    placeholder="預設 23"
                  />
                </div>
              </div>

              {/* 發佈方式 */}
              <div className="form-group">
                <label>發佈方式</label>
                <select
                  value={form.publishMode || 'immediate'}
                  onChange={(e) => setForm({ ...form, publishMode: e.target.value })}
                >
                  <option value="immediate">立即發佈</option>
                  <option value="scheduled">指定時間</option>
                </select>
              </div>

              {form.publishMode === 'scheduled' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>發佈日期</label>
                    <input
                      type="date"
                      value={form.publishDate || ''}
                      onChange={(e) => setForm({ ...form, publishDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>發佈時間</label>
                    <select
                      value={form.publishTime || '12:00'}
                      onChange={(e) => setForm({ ...form, publishTime: e.target.value })}
                    >
                      {QUIT_TIME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 付款方式多選（只顯示啟用狀態） */}
              <div className="form-group">
                <label>付款方式（可多選）</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {(() => {
                    const enabledOptions = paymentOptions.filter(o => o.enabled);
                    if (enabledOptions.length === 0) {
                      return <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>尚無啟用的付款方式選項，請先至「付款方式維護」新增或啟用</span>;
                    }
                    return enabledOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`payment-chip ${(form.paymentMethods || []).includes(opt.name) ? 'active' : ''}`}
                        onClick={() => togglePaymentMethod(opt.name)}
                      >
                        {opt.name}
                      </button>
                    ));
                  })()}
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

      {/* 付款方式維護 Modal */}
      {showPaymentMgmt && (
        <div className="modal-overlay" onClick={() => setShowPaymentMgmt(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>💳 付款方式維護</h3>

            {/* 新增 */}
            <div className="name-edit-row" style={{ marginBottom: 16 }}>
              <input
                type="text"
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                placeholder="輸入新付款方式名稱"
                maxLength={20}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOption(); } }}
              />
              <button className="name-edit-btn" onClick={handleAddOption}>新增</button>
            </div>

            {/* 列表 */}
            {paymentOptions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>尚無付款方式</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {paymentOptions.map((opt) => (
                  <div key={opt.id} className="roster-item" style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{ fontWeight: 500 }}>{opt.name}</span>
                      {opt.name === '現金' ? (
                        <span className="status-tag" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>固定</span>
                      ) : !opt.enabled ? (
                        <span className="status-tag" style={{ background: 'var(--bg-card-hover)', color: 'var(--text-muted)' }}>停用</span>
                      ) : null}
                    </div>
                    {opt.name !== '現金' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="name-edit-btn"
                          onClick={() => handleToggleOptionEnabled(opt)}
                          style={{ fontSize: 12 }}
                        >
                          {opt.enabled ? '停用' : '啟用'}
                        </button>
                        <button
                          className="name-edit-btn"
                          onClick={() => handleDeleteOption(opt)}
                          style={{ color: 'var(--accent)', fontSize: 12 }}
                        >
                          刪除
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentMgmt(false)}>關閉</button>
            </div>
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
