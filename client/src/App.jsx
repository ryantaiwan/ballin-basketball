/**
 * 有Ball必In 籃球歡樂打社團 - 主應用元件
 * 管理 LIFF 初始化、登入狀態、頁面路由
 */
import React, { useState, useEffect } from 'react';
import { useLiff } from './hooks/useLiff';
import Toast from './components/Toast';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import GameDetailPage from './pages/GameDetailPage';
import AdminPage from './pages/AdminPage';
import MyRegistrationsPage from './pages/MyRegistrationsPage';

export default function App() {
  const { liffReady, liffError, userProfile, isLoggedIn, isAdmin, login, sendMessages } = useLiff();
  const [page, setPage] = useState('home'); // home | detail | admin | my-registrations
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'info' });

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  // 支援深層連結 ?game=<id>（LINE 卡片按鈕點擊後直接開啟該球局）
  useEffect(() => {
    if (!isLoggedIn) return;
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    if (gameId && /^\d+$/.test(gameId)) {
      setSelectedGameId(Number(gameId));
      setPage('detail');
    }
  }, [isLoggedIn]);

  // LIFF 尚未初始化
  if (!liffReady) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <p>系統載入中...</p>
      </div>
    );
  }

  // LIFF 初始化錯誤
  if (liffError) {
    return (
      <div className="empty-state">
        <div className="icon">⚠️</div>
        <div className="text">系統初始化失敗</div>
        <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-muted)' }}>{liffError}</p>
      </div>
    );
  }

  // 未登入 → 顯示登入頁
  if (!isLoggedIn) {
    return (
      <>
        <LoginPage onLogin={login} />
        <Toast {...toast} onClose={() => setToast({ message: '', type: 'info' })} />
      </>
    );
  }

  // 頁面路由
  const goToDetail = (gameId) => {
    setSelectedGameId(gameId);
    setPage('detail');
  };

  const goHome = () => {
    setPage('home');
    setSelectedGameId(null);
  };

  return (
    <>
      {page === 'home' && (
        <HomePage
          onGameClick={goToDetail}
          isAdmin={isAdmin}
          onAdminClick={() => setPage('admin')}
          onMyRegistrationsClick={() => setPage('my-registrations')}
        />
      )}

      {page === 'detail' && selectedGameId && (
        <GameDetailPage
          gameId={selectedGameId}
          userProfile={userProfile}
          isAdmin={isAdmin}
          onBack={goHome}
          showToast={showToast}
          sendMessages={sendMessages}
        />
      )}

      {page === 'admin' && (
        <AdminPage
          onBack={goHome}
          showToast={showToast}
        />
      )}

      {page === 'my-registrations' && (
        <MyRegistrationsPage
          onBack={goHome}
          onGameClick={goToDetail}
        />
      )}

      <Toast {...toast} onClose={() => setToast({ message: '', type: 'info' })} />
    </>
  );
}
