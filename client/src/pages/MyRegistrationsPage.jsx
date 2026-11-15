/**
 * 我的報名紀錄頁
 */
import React, { useState, useEffect } from 'react';
import { fetchMyRegistrations } from '../api';

export default function MyRegistrationsPage({ onBack, onGameClick }) {
  const [data, setData] = useState({ registrations: [], waitlist: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const result = await fetchMyRegistrations();
      setData(result);
    } catch (err) {
      console.error('載入失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}（${['日','一','二','三','四','五','六'][d.getDay()]}）`;
  };

  return (
    <>
      <button className="back-btn" onClick={onBack}>← 返回列表</button>

      <div className="page">
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>📌 我的報名紀錄</h2>

        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <p>載入中...</p>
          </div>
        ) : (
          <>
            {/* 正式報名 */}
            <div className="roster-section">
              <h3>✅ 正式報名（{data.registrations.length}）</h3>
              {data.registrations.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>尚無正式報名</p>
              ) : (
                <div className="roster-list">
                  {data.registrations.map((r, idx) => (
                    <div
                      key={r.id}
                      className="roster-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onGameClick(r.gameId)}
                    >
                      <div className="name">
                        <span className="number">{idx + 1}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.title}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {formatDate(r.gameDate)} {r.gameTime} · {r.location}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--success)' }}>已報名</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 候補 */}
            <div className="roster-section">
              <h3>⏳ 候補中（{data.waitlist.length}）</h3>
              {data.waitlist.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>尚無候補</p>
              ) : (
                <div className="roster-list">
                  {data.waitlist.map((w) => (
                    <div
                      key={w.id}
                      className="roster-item waitlist"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onGameClick(w.gameId)}
                    >
                      <div className="name">
                        <span className="number">{w.position}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{w.title}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {formatDate(w.gameDate)} {w.gameTime} · {w.location}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--warning)' }}>候補第{w.position}位</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
