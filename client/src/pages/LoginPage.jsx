/**
 * 登入頁 — 未登入時顯示
 */
import React from 'react';

export default function LoginPage({ onLogin, error }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      textAlign: 'center',
    }}>
      <img
        src="/logo.jpg"
        alt="有Ball必In 籃球歡樂打社團"
        className="login-logo"
      />
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
        有Ball必In 籃球歡樂打社團
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 15 }}>
        球局報名系統
      </p>

      {error && (
        <p style={{ color: 'var(--accent)', marginBottom: 16, fontSize: 14 }}>
          {error}
        </p>
      )}

      <button className="btn btn-primary" onClick={onLogin} style={{ maxWidth: 280 }}>
        使用 LINE 登入
      </button>
    </div>
  );
}
