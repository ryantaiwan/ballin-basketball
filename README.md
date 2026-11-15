# 🏀 有Ball必In 籃球歡樂打社團 — 球局報名系統

LINE LIFF 球局報名系統，可在 LINE 聊天群組中直接使用。

## 快速開始

### 部署到 Vercel（推薦）

1. **Fork / Clone** 此專案到你的 GitHub
2. **建立 LINE Channel** — [LINE Developers Console](https://developers.line.biz/)
   - 建立 Messaging API Channel → 取得 Channel Access Token
   - 建立 LIFF App → 取得 LIFF ID
3. **建立 Turso 資料庫** — [Turso](https://turso.tech/)
   ```bash
   turso db create ballin-db
   turso db show ballin-db --url       # 取得 URL
   turso db tokens create ballin-db    # 取得 Token
   ```
4. **匯入 Vercel** — [vercel.com](https://vercel.com/) → New Project → 選擇 GitHub 倉庫
5. **設定環境變數**：

   | Key | Value |
   |-----|-------|
   | `TURSO_DATABASE_URL` | `libsql://ballin-db-xxxx.turso.io` |
   | `TURSO_AUTH_TOKEN` | 你的 Turso Auth Token |
   | `LIFF_CHANNEL_ACCESS_TOKEN` | LINE Channel Access Token |
   | `LIFF_CHANNEL_SECRET` | LINE Channel Secret |
   | `VITE_LIFF_ID` | 你的 LIFF ID |
   | `VITE_API_BASE_URL` | （留空） |

6. **Deploy** — 前端 + API 同時上線
7. **初始化資料庫**：
   ```bash
   turso db shell ballin-db < api/_lib/schema.sql
   ```
8. **新增管理者**：
   ```bash
   turso db shell ballin-db
   INSERT OR IGNORE INTO admins (line_user_id, display_name) VALUES ('你的LINE_USER_ID', '管理員');
   ```
9. **更新 LIFF Endpoint URL** — 回 LINE Developers Console 設為你的 Vercel 網址

### 本地開發

```bash
# 安裝 Vercel CLI
npm i -g vercel

# 在專案根目錄
cp .env.example .env.local
# 編輯 .env.local 填入設定

vercel dev    # 同時啟動前端 + API
```

## 功能

- ✅ 球局列表（列表 / 格子兩種顯示模式）
- ✅ 球局詳情（日期、時間、地點、完整備註、價格、報名人數、候補人數）
- ✅ 線上報名 / 加入候補
- ✅ 人數達上限自動切換為候補按鈕
- ✅ 退出球局時候補第一位自動遞補
- ✅ LINE 通知（退出者、遞補者、候補順位變動）
- ✅ 報名後可編輯名稱
- ✅ 管理者後台（新增、編輯、刪除球局）
- ✅ 本人及管理者可退出報名

## 技術棧

| 層 | 技術 |
|----|------|
| 前端 | React 18 + Vite + LINE LIFF SDK |
| 後端 | Vercel Serverless Functions (Node.js) |
| 資料庫 | Turso (libSQL / SQLite) |
| 通知 | LINE Messaging API (Push Message) |
| 部署 | Vercel（前端 + API 同站） |

## 專案結構

```
ballin-app/
├── api/                 # Serverless Functions（後端 API）
│   ├── _lib/            # 共用模組
│   ├── games/           # 球局 CRUD API
│   ├── registrations/   # 報名/退出/候補 API
│   ├── user/            # 使用者資訊 API
│   └── health.js        # 健康檢查
├── client/              # React 前端（LIFF）
│   └── src/
│       ├── api/         # API 客戶端
│       ├── components/  # 共用元件
│       ├── hooks/       # LIFF Hook
│       ├── pages/       # 頁面元件
│       └── styles/      # 全域樣式
├── server/              # (備用) Express 版後端，用於 Render 部署
├── vercel.json          # Vercel 部署設定
├── .env.example         # 環境變數範本
└── DEPLOY.md            # 詳細部署指南
```

## 詳細文件

請參閱 [DEPLOY.md](./DEPLOY.md) 取得完整的部署指南、API 文件、資料庫結構說明。
