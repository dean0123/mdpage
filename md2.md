# DB Web SQL Tool - 專案說明文件

## 專案概覽

這是一個網頁版的 SQL 查詢工具，旨在提供一個方便、跨平台的介面，讓使用者能夠連線至多種資料庫（如 Oracle），並執行**唯讀**的 SQL 查詢。

## 🚀 快速體驗

### 📺 線上演示頁面

假設你的伺服器運行在 `http://10.1.230.13:8000`，可以直接訪問以下頁面：

| 頁面 | URL | 說明 |
| --- | --- | --- |
| 📖 完整文檔 | /README.html | 說明文件 |
| 🏠 無登入頁面 | index.html | SQL 通用 DB 查詢/報表工具 |
| 👤 跨應用登入 | login.html | 加一行 oidc.js 手動登入連結 |
| ⚡ 跨應用強制登入 | login_auto.html | 加一行 oidc.js 強制登入，顯示User |
| ⚡ 零依賴 | query.html | 加一行 rsformat.js 格式轉換 |


此工具採用前後端分離的架構：

- **前端**：一個功能豐富的單頁應用程式 (`index.html`)，負責所有 UI 互動。它將複雜的連線設定檔和 SQL 語句管理功能，完全移至瀏覽器的 `localStorage` 進行儲存，讓使用者的設定可以輕鬆地在本機保留。
- **後端**：一個輕量、安全的 FastAPI 代理服務 (`main.py`)，專注於接收前端的請求、建立資料庫連線、執行 SQL 查詢，並回傳結果。

---

## 核心功能特性

### 1. 連線設定檔管理 (前端 `localStorage`)

- **新增/修改/刪除**: 提供完整的設定檔生命週期管理。
- **智慧儲存**: 整合的「儲存」按鈕，可透過輸入不同名稱來建立或覆蓋設定檔。
- **自動記憶**: 重新整理頁面後會自動載入上次使用的設定檔。
- **多資料庫支援**: 支援 DB Type (Oracle, MS-SQL等) 及對應 Port 的設定。
- **自動排序**: 下拉選單中的設定檔會依字母/筆劃順序排列。

### 2. SQL 語句管理 (前端 `localStorage`)

- **與 Profile 關聯**: 每個 SQL 都與一個連線設定檔綁定，方便管理。
- **智慧儲存**: 同樣使用整合的「儲存」按鈕進行新增與修改。
- **自動排序**: 下拉選單中的 SQL 會依字母/筆劃順序排列。

### 3. 雙查詢執行模式

- **同頁查詢**: 在當前頁面透過 AJAX 執行查詢並更新結果，適合快速驗證和迭代查詢。
- **換頁查詢**: 在同頁面發起新請求來執行查詢，保留當前頁面狀態。方便使用瀏覽器的「上一頁/下一頁」來回顧多次查詢的歷史紀錄。

### 4. 豐富的查詢結果呈現

- **多種格式**: 支援 `Row Set`, `DataTables`, `HTML Table`, `JSON` 四種格式切換。
- **Row Set 循環切換**: 在 Row Set 模式下，可循環切換「正常 → 顯示 ID → 轉置」三種狀態。
- **DataTables 整合**: 提供互動式的表格，支援客戶端排序與搜尋，並已修正預設排序問題。
- **CSV 匯出**: 可將當前查詢結果（包含 ID 與轉置後）匯出為 CSV 檔案。

### 5. 使用者體驗 (UX) 優化

- **安全參數傳遞**: 換頁查詢時，連線參數透過 `sessionStorage` 傳遞，URL 中只保留無意義的 ID，避免敏感資訊外洩。
- **查詢耗時**: 顯示每次查詢所需時間，並依秒數標示顏色。
- **本機儲存用量**: 即時顯示 `localStorage` 的使用量。
- **清除/復原**: 一鍵清除 SQL 輸入框，再按一次可復原回上次執行的 SQL。
- **自動捲動**: 查詢後自動捲動至結果區，方便查看。
- **防止跳動**: 結果區有最小高度，切換格式時畫面穩定不跳動。
- **歷史快取**: 使用瀏覽器上一頁/下一頁時，會從 `sessionStorage` 讀取快取結果，避免不必要的重複查詢。

---

## 檔案結構

```
/project-root  
├── .gitignore          # Git 忽略清單  
├── Dockerfile          # 用於建立後端服務的 Docker 映像檔  
├── docker-compose.yml  # Docker Compose 設定檔，方便一鍵啟動  
├── index.html          # 前端應用程式主體 (SPA)  
├── main.py             # 後端 FastAPI 應用程式  
└── requirements.txt    # Python 依賴套件清單  

```

---

## 安裝與啟動 (建議使用 Docker)

本專案建議使用 Docker 進行部署，可以免去在本機安裝 Python 或 Oracle Client 的複雜步驟。

### 事前準備

1. 安裝 Git
2. 安裝 Docker Desktop (已包含 Docker Compose)

### 啟動步驟

1. **複製專案** 打開您的終端機 (Terminal 或命令提示字元)，使用 git 將專案複製到您的電腦：
  ```
git clone [您的專案 Git Repository URL]
cd [專案目錄]

```
2. **建立並啟動服務** 在專案的根目錄下，執行 Docker Compose 指令。`--build` 參數會確保 Docker 使用最新的 `Dockerfile` 重新建立映像檔。  
如果是MAC 請複製 `Dockerfile_MAC` 到 `Dockerfile`, 然後再Build image, 差異只有 x64 與 arm64 Oracle Thick Client 的差別而已. 如果是 PC X86 處理器 就使用預設 `Dockerfile` ( `Dockerfile_x64` ) 的檔案。
  ```
docker-compose up --build -d

```
  - `-d` 參數會讓服務在背景執行。
- 第一次建立映像檔時，會自動下載 Oracle Client，可能需要數分鐘時間。
3. **開始使用** 啟動成功後，打開您的瀏覽器，前往以下網址即可開始使用： http://localhost:8000
4. **查看服務日誌** 如果需要查看後端服務的運行日誌，可以執行：
  ```
docker-compose logs -f

```
5. **停止服務** 若要停止服務，請在同一個專案目錄下執行：
  ```
docker-compose down

```

---

## 後端安全機制

後端 `main.py` 內建了一個重要的安全檢查機制 `validate_read_only_sql`。此函式會分析所有傳入的 SQL 請求，確保：

- SQL 指令必須以 `SELECT` 或 `WITH` 開頭。
- 任何包含 `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE` 等資料修改關鍵字的請求都會被**直接拒絕**。

這個機制確保了此工具只能被用作一個**唯讀**的查詢工具，有效防止了意外或惡意的資料庫修改操作。
