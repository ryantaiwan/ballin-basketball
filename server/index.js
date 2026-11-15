/**
 * 有Ball必In 籃球歡樂打社團 - 球局報名系統 API Server
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./db');

const app = express();

// 中介軟體
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);
app.use(express.json());

// 請求日誌
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'BallIn API' });
});

// 路由
app.use('/api/games', require('./routes/games'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/user', require('./routes/user'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: '找不到此路由' });
});

// 錯誤處理
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

const PORT = process.env.PORT || 3000;

// 啟動時初始化資料庫
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  有Ball必In 籃球歡樂打社團`);
      console.log(`  球局報名系統 API 已啟動`);
      console.log(`  Port: ${PORT}`);
      console.log(`========================================\n`);
    });
  })
  .catch((err) => {
    console.error('啟動失敗:', err);
    process.exit(1);
  });
