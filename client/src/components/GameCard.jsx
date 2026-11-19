/**
 * 球局卡片元件 — 列表模式與格子模式共用
 */
import React from 'react';

export default function GameCard({ game, onClick, viewMode = 'list' }) {
  const isFull = game.isFull;
  const remaining = game.maxPlayers - game.registeredCount;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${year}/${month}/${day}(${weekday})`;
  };

  const statusInfo = (() => {
    switch (game.status) {
      case 'in_progress': return { label: '進行中', cls: 'in_progress' };
      case 'ended': return { label: '已結束', cls: 'ended' };
      case 'cancelled': return { label: '已取消', cls: 'cancelled' };
      default: return null;
    }
  })();

  return (
    <div className="game-card" onClick={onClick}>
      <div className="game-card-header">
        <span className="game-card-title">{game.title || '球局'}</span>
        {statusInfo && (
          <span className={`status-tag ${statusInfo.cls}`}>{statusInfo.label}</span>
        )}
      </div>

      <div className="game-card-info">
        <div className="info-row">
          <span className="info-label">📅</span>
          <span>{formatDate(game.gameDate)}　{game.gameTime}{game.endTime ? ` ~ ${game.endTime}` : ''}</span>
        </div>
        <div className="info-row">
          <span className="info-label">📍</span>
          <span>{game.location}</span>
        </div>
        <div className="info-row">
          <span className="info-label">💰</span>
          <span>
            {game.price === 0 ? '免費' : `NT$${game.price}`}
            {game.guestPrice > 0 && `（臨打 NT$${game.guestPrice}）`}
          </span>
        </div>
        {game.paymentMethods && game.paymentMethods.length > 0 && (
          <div className="info-row">
            <span className="info-label">💳</span>
            <span style={{ fontSize: 13 }}>{game.paymentMethods.join(' / ')}</span>
          </div>
        )}
      </div>

      {viewMode === 'list' && (
        <div className="game-card-notes">{game.notesShort || '無備註'}</div>
      )}

      <div className="game-card-footer">
        <span className="game-card-price">
          {game.price === 0 ? '免費' : `NT$${game.price}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`player-badge ${isFull ? 'full' : 'available'}`}>
            👥 {game.registeredCount}/{game.maxPlayers}
            {!isFull && ` (剩${remaining})`}
          </span>
          {game.waitlistCount > 0 && (
            <span className="waitlist-badge">⏳ {game.waitlistCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}
