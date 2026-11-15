# 🏀 有Ball必In 籃球歡樂打社團 — 球局報名系統

LINE LIFF 球局報名系統，支援在 LINE 群組中使用。

## 功能總覽

| 功能 | 說明 |
|------|------|
| 球局列表 | 首頁顯示所有球局，支援「列表」與「格子」兩種顯示模式 |
| 球局詳情 | 顯示日期、時間、地點、完整備註、價格、報名人數(0/上限)、候補人數 |
| 報名 | 點擊報名按鈕，透過 LINE 登入取得 ID 與名稱，可編輯名稱 |
| 候補 | 人數達上限時自動切換為「加入候補」按鈕 |
| 自動遞補 | 有人退出正式報名時，候補第 1 位自動遞補 |
| 退出球局 | 本人或管理者可退出，退出時發送 LINE 通知 |
| 報名名單 | 詳情頁顯示正式報名名單與候補名單 |
| 管理後台 | 管理者可新增、編輯、刪除球局 |

## 技術棧

- **前端**: React 18 + Vite + LINE LIFF SDK
- **後端**: Vercel Serverless Functions (Node.js)
- **資料庫**: Turso (libSQL / SQLite)
- **通知**: LINE Messaging API (Push Message)
- **部署**: 前端 + 後端統一部署到 **Vercel**（單一專案）

## 專案結構

```
ballin-app/
├── api/                        # Vercel Serverless Functions (後端 API)
│   ├── _lib/                   # 共用模組
│   │   ├── db.js               # Turso DB 連線
│   │   ├── schema.sql          # 資料庫 Schema
│   │   ├── auth.js             # LIFF Token 驗證
│   │   ├── admin.js            # 管理者權限檢查
│   │   ├── lineNotify.js       # LINE 推播通知
│   │   └── utils.js            # CORS / JSON 回應
│   ├── games/
│   │   ├── index.js            # GET/POST /api/games
│   │   └── [id].js             # GET/PUT/DELETE /api/games/:id
│   ├── registrations/
│   │   ├── me.js               # GET /api/registrations/me
│   │   └── [gameId]/
│   │       └── [action].js     # POST register/leave, PUT name
│   ├── user/
│   │   ├── me.js               # GET /api/user/me
│   │   └── check-admin.js      # GET /api/user/check-admin
│   └── health.js               # GET /api/health
├── client/                     # LIFF 前端 (React + Vite)
│   ├── src/
│   │   ├── api/                # API 客戶端
│   │   ├── components/         # 共用元件
│   │   ├── hooks/              # LIFF Hook
│   │   ├── pages/              # 頁面元件
│   │   ├── styles/             # 全域樣式
│   │   ├── App.jsx             # 主應用
│   │   └── main.jsx            # 進入點
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
├── server/                     # (備用) Express 版後端，可用於 Render 部署
├── vercel.json                 # Vercel 部署設定
├── package.json                # 根層依賴 (API 函數用)
└── DEPLOY.md                   # 本文件
```

> **兩種部署方案**：
> - **方案 A（推薦）**: 前端 + API 統一部署到 **Vercel** — `api/` + `client/` 同一個專案
> - **方案 B（備用）**: 前端 Vercel + 後端 Render — 使用 `server/` 跑 Express

---

## 部署指南 — 方案 A：全部部署到 Vercel（推薦）

### 第一步：建立 LINE Channel（必須先做）

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立 Provider → 建立 Messaging API Channel
3. 取得以下資訊：
   - **Channel ID**
   - **Channel Secret**
   - **Channel Access Token**（在 Messaging API 設定頁取得）
4. 在同一個 Provider 下建立 **LIFF App**：
   - 進入 LIFF Channel 設定頁
   - 點擊「Add」建立 LIFF
   - Endpoint URL: 先填 `https://placeholder.vercel.app`（第三步完成後回來更新）
   - View type: `Full`
   - Scope: `profile` + `openid`
   - 記下 **LIFF ID**（格式如 `1234567890-AbCdEfGh`）

### 第二步：建立 Turso 資料庫

1. 前往 [Turso](https://turso.tech/) 註冊（可用 GitHub 登入）
2. 建立資料庫：
   ```bash
   # 安裝 Turso CLI
   curl -sSfL https://get.tur.so/install.sh | bash

   # 登入
   turso auth login

   # 建立資料庫
   turso db create ballin-db

   # 取得連線 URL
   turso db show ballin-db --url
   # → libsql://ballin-db-xxxx.turso.io

   # 建立 Auth Token
   turso db tokens create ballin-db
   # → eyJhbGciOi...
   ```
3. 記下：
   - **Database URL**: `libsql://ballin-db-xxxx.turso.io`
   - **Auth Token**: `eyJhbGciOi...`

### 第三步：部署到 Vercel（前端 + API 一次搞定）

1. 將整個 `ballin-app` 推送到 GitHub 倉庫
2. 前往 [Vercel](https://vercel.com/) → New Project → 匯入 GitHub 倉庫
3. Vercel 會自動讀取 `vercel.json` 設定，**無需手動設定** Build Command
4. 設定環境變數（在 Vercel 專案設定 → Environment Variables）：

   | Key | Value |
   |-----|-------|
   | `TURSO_DATABASE_URL` | `libsql://ballin-db-xxxx.turso.io` |
   | `TURSO_AUTH_TOKEN` | `eyJhbGciOi...` |
   | `LIFF_CHANNEL_ACCESS_TOKEN` | LINE Channel Access Token |
   | `LIFF_CHANNEL_SECRET` | LINE Channel Secret |
   | `VITE_LIFF_ID` | `1234567890-AbCdEfGh` |
   | `VITE_API_BASE_URL` | （留空，使用相對路徑） |

5. 點擊 Deploy
6. 部署完成後取得網址，如 `https://ballin-app.vercel.app`

### 第四步：初始化資料庫

部署成功後，第一次呼叫任何 API 會自動建立資料表（`CREATE TABLE IF NOT EXISTS`）。

你也可以手動初始化：

**方法 1 — 用 Turso CLI 直接跑 Schema**：
```bash
turso db shell ballin-db < api/_lib/schema.sql
```

**方法 2 — 加入初始管理者**：
```bash
turso db shell ballin-db
# 進入 SQL shell 後執行：
INSERT OR IGNORE INTO admins (line_user_id, display_name) VALUES ('你的LINE_USER_ID', '管理員');
.exit
```

#### 如何取得你的 LINE User ID？

1. 打開你部署好的 LIFF 頁面
2. 登入後在瀏覽器 DevTools Console 執行：
   ```js
   liff.getProfile().then(p => console.log(p.userId))
   ```
3. 或加 LINE Bot 為好友後發訊息，在 Webhook 中查看 `events[0].source.userId`

### 第五步：回到 LINE Developers Console 更新

1. **更新 LIFF Endpoint URL**：改為你的 Vercel 網址（如 `https://ballin-app.vercel.app`）
2. 確認 LIFF 的 Scope 包含 `profile` + `openid`

### 第六步：在 LINE 群組中使用

1. 在 LINE 群組中分享 LIFF 連結（或 LIFF 分享短網址）
2. 群組成員點擊即可開啟報名系統
3. 系統會自動透過 LIFF 登入取得 LINE 身份

---

## 本地開發

### 前端

```bash
cd ballin-app/client
cp .env.example .env
# 編輯 .env 填入 VITE_LIFF_ID
npm install
npm run dev       # http://localhost:5173
```

### API（使用 Vercel CLI 本地測試）

```bash
# 安裝 Vercel CLI
npm i -g vercel

# 在專案根目錄執行
cd ballin-app
cp server/.env.example .env.local  # 在根目錄建立環境變數
# 編輯 .env.local 填入 TURSO_DATABASE_URL 等

vercel dev         # 啟動本地 Vercel 環境 (http://localhost:3000)
```

> `vercel dev` 會同時啟動前端 + API Functions，完美模擬線上環境。

---

## 方案 B：前端 Vercel + 後端 Render（備用）

如果你偏好用 Express 常駐伺服器，可使用 `server/` 資料夾：

1. **後端**：將 `ballin-app/server` 推到 GitHub → Render 建立 Web Service
   - Build: `npm install` / Start: `npm start` / 環境變數如 `server/.env.example`
   - 部署後執行 `npm run db:init` 初始化
2. **前端**：Vercel 部署 `ballin-app/client`，設 `VITE_API_BASE_URL=https://你的後端.onrender.com`

---

## 資料庫結構

### games（球局）
| 欄位 | 型態 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| title | TEXT | 球局標題 |
| game_date | TEXT | 日期 YYYY-MM-DD |
| game_time | TEXT | 時間 HH:MM |
| location | TEXT | 地點 |
| notes | TEXT | 備註（列表截前 200 字） |
| price | INTEGER | 價格 NT$ |
| max_players | INTEGER | 人數上限 |
| status | TEXT | open / closed / cancelled |
| created_at | TEXT | 建立時間 |
| updated_at | TEXT | 更新時間 |

### registrations（正式報名）
| 欄位 | 型態 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| game_id | INTEGER | 球局 ID (FK) |
| line_user_id | TEXT | LINE User ID |
| display_name | TEXT | 顯示名稱 |
| registered_at | TEXT | 報名時間 |

### waitlist（候補）
| 欄位 | 型態 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| game_id | INTEGER | 球局 ID (FK) |
| line_user_id | TEXT | LINE User ID |
| display_name | TEXT | 顯示名稱 |
| joined_at | TEXT | 加入時間 |
| position | INTEGER | 候補順位 |

### admins（管理者白名單）
| 欄位 | 型態 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵 |
| line_user_id | TEXT | LINE User ID (UNIQUE) |
| display_name | TEXT | 管理者名稱 |

---

## API 路由

### 球局
| Method | Path | 說明 | 認證 |
|--------|------|------|------|
| GET | `/api/games` | 取得所有球局列表 | 公開 |
| GET | `/api/games/:id` | 取得球局詳情 | 可選認證 |
| POST | `/api/games` | 新增球局 | 管理者 |
| PUT | `/api/games/:id` | 修改球局 | 管理者 |
| DELETE | `/api/games/:id` | 刪除球局 | 管理者 |

### 報名
| Method | Path | 說明 | 認證 |
|--------|------|------|------|
| POST | `/api/registrations/:gameId/register` | 報名/加入候補 | LIFF 認證 |
| POST | `/api/registrations/:gameId/leave` | 退出球局 | LIFF 認證 |
| PUT | `/api/registrations/:gameId/name` | 更新顯示名稱 | LIFF 認證 |
| GET | `/api/registrations/me` | 取得我的報名紀錄 | LIFF 認證 |

### 使用者
| Method | Path | 說明 | 認證 |
|--------|------|------|------|
| GET | `/api/user/me` | 取得使用者資訊 + 是否管理者 | LIFF 認證 |
| GET | `/api/user/check-admin` | 檢查管理員狀態 | LIFF 認證 |

---

## LINE 通知機制

退出球局時，系統會透過 LINE Messaging API 發送推播：

1. **退出者**收到退出確認通知
2. **候補第一位**收到自動遞補通知
3. **其他候補者**收到順位更新通知

> 需確保使用者已加 LINE Bot 為好友，否則推播訊息無法送達。

---

## 常見問題

### Q: Vercel Serverless 有什麼限制？
A: 免費方案每個函數最多執行 30 秒（已在 `vercel.json` 中設定），每月 100GB 流量。球局報名系統的每個 API 請求都在秒級完成，完全足夠。

### Q: Vercel Serverless 是無狀態的，資料庫連線怎麼辦？
A: Turso 的 libSQL 驅動是 HTTP 協議，每次查詢都是獨立的 HTTP 請求，不需要保持長連線，完美適配 Serverless 環境。

### Q: 如何新增管理者？
A: 用 Turso CLI 直接寫入：
```bash
turso db shell ballin-db
INSERT OR IGNORE INTO admins (line_user_id, display_name) VALUES ('Uxxxxxxxx', '管理者名稱');
```

### Q: LIFF 頁面在手機上打不開？
A: 確認 LIFF Endpoint URL 已更新為正式部署網址，且 LIFF 的 View type 設為 `Full`。

### Q: 候補者沒收到通知？
A: 確認使用者已加 LINE Bot 為好友。Messaging API 的 Push Message 只能發送給好友。

### Q: server/ 資料夾還需要嗎？
A: 如果你用方案 A（Vercel 同站部署），`server/` 只是備用。用方案 B（Render）時才會用到。留著不影響 Vercel 部署。
