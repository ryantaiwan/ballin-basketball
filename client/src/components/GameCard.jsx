/**
 * 球局卡片元件 — 列表模式與格子模式共用
 */
import React from 'react';

export default function GameCard({ game, onClick, viewMode = 'list' }) {
  const isFull = game.isFull;
  const remaining = game.maxPlayers - game.registeredCount;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${month}/${day}(${weekday})`;
  };

  return (
    <div className="game-card" onClick={onClick}>
      <div className="game-card-header">
        <span className="game-card-title">{game.title || '球局'}</span>
        <span className="game-card-date">
          {formatDate(game.gameDate)} {game.gameTime}
        </span>
      </div>

      <div className="game-card-info">
        <div className="info-row">
          <span className="info-label">📍</span>
          <span>{game.location}</span>
        </div>
        <div className="info-row">
          <span className="info-label">💰</span>
          <span>{game.price === 0 ? '免費' : `NT$${game.price}`}</span>
        </div>
      </div>

      <div className="game-card-notes">{game.notesShort || '無備註'}</div>

      <div className="game-card-footer">
        <span className="game-card-price">
          {game.price === 0 ? '免費' : `NT$${game.price}`}
        </span>
        <div>
          <span className={`player-badge ${isFull ? 'full' : 'available'}`}>
            👥 {game.registeredCount}/{game.maxPlayers}
            {!isFull && ` (剩${remaining})`}
          </span>
          {game.waitlistCount > 0 && (
            <span className="waitlist-badge">候補 {game.waitlistCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}
