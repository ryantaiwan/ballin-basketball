/**
 * 首頁 — 球局列表
 * 支援列表 / 格子兩種顯示方式
 */
import React, { useState, useEffect } from 'react';
import { fetchGames } from '../api';
import GameCard from '../components/GameCard';

export default function HomePage({ onGameClick, isAdmin, onAdminClick, onMyRegistrationsClick }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    setLoading(true);
    try {
      const data = await fetchGames();
      setGames(data.games);
    } catch (err) {
      console.error('載入失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="app-header">
        <h1>
          <span className="header-icon">🏀</span>
          有Ball必In 籃球歡樂打社團
        </h1>
        <p className="subtitle">球局報名系統</p>
      </header>

      <div className="page">
        <div className="view-toggle">
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            📋 列表
          </button>
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
          >
            🔲 格子
          </button>
        </div>

        {/* 我的報名按鈕 */}
        {onMyRegistrationsClick && (
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={onMyRegistrationsClick}>
              📌 我的報名紀錄
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <p>載入球局中...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🏀</div>
            <div className="text">目前沒有球局，敬請期待！</div>
          </div>
        ) : viewMode === 'list' ? (
          <div className="game-list">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                viewMode="list"
                onClick={() => onGameClick(game.id)}
              />
            ))}
          </div>
        ) : (
          <div className="game-grid">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                viewMode="grid"
                onClick={() => onGameClick(game.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 管理者浮動按鈕 */}
      {isAdmin && (
        <button className="admin-fab" onClick={onAdminClick} title="管理後台">
          ⚙️
        </button>
      )}
    </>
  );
}
