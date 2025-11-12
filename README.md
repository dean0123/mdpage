# Markdown 編輯器

一個基於 React + TypeScript + Tiptap 的所見即所得 Markdown 編輯器，採用極少依賴的設計理念，易於擴展。

- 測試點 [直接測試](http://10.1.230.13:8080/)

## 技術棧

- **前端框架**: React 18
- **構建工具**: Vite 5
- **編輯器核心**: Tiptap 2 (基於 ProseMirror)
- **語言**: TypeScript
- **容器化**: Docker + Docker Compose
- **Web 伺服器**: Nginx (生產環境)

## 功能特點

- ✅ 👍 🐶 所見即所得的 Markdown 編輯體驗
- ✅ 支持基本 Markdown 語法（標題、粗體、斜體、列表、代碼等）
- ✅ 工具欄快捷操作
- ✅ 鍵盤快捷鍵支持
- ✅ 響應式設計
- ✅ 極少的依賴（僅 5 個核心依賴）
- ✅ 易於擴展的架構
- ✅ Docker 一鍵部署

## 專案結構

```
ppage-markdown-editor/
├── src/
│   ├── components/
│   │   └── MarkdownEditor.tsx    # 編輯器主組件
│   ├── styles/
│   │   ├── global.css            # 全局樣式
│   │   └── editor.css            # 編輯器樣式
│   ├── App.tsx                   # 應用根組件
│   ├── main.tsx                  # 入口文件
│   └── vite-env.d.ts            # TypeScript 類型定義
├── public/                       # 靜態資源
├── Dockerfile                    # Docker 構建文件
├── docker-compose.yml            # Docker Compose 配置
├── nginx.conf                    # Nginx 配置
├── vite.config.ts               # Vite 配置
├── tsconfig.json                # TypeScript 配置
└── package.json                 # 專案依賴
```
:smile
## 快速開始

### 本地開發

1. **安裝依賴**
```bash
npm install
```

2. **啟動開發伺服器**
```bash
npm run dev
```

應用將在 http://localhost:8080 啟動

3. **構建生產版本**
```bash
npm run build
```

4. **預覽生產構建**
```bash
npm run preview
```

### Docker 部署

1. **構建並啟動容器**
```bash
docker-compose up --build
```

或使用 npm 腳本：
```bash
npm run docker:up
```

2. **訪問應用**

打開瀏覽器訪問 http://localhost:8080

3. **停止容器**
```bash
docker-compose down
```

或使用 npm 腳本：
```bash
npm run docker:down
```

## 支持的 Markdown 語法

- **標題**: H1, H2, H3
- **文本格式**: 粗體、斜體、行內代碼
- **列表**: 無序列表、有序列表
- **代碼塊**: 語法高亮的代碼塊
- **引用**: 塊引用
- **分隔線**: 水平分隔線
- **撤銷/重做**: 完整的編輯歷史支持

## 鍵盤快捷鍵

- `Cmd/Ctrl + B`: 粗體
- `Cmd/Ctrl + I`: 斜體
- `Cmd/Ctrl + E`: 行內代碼
- `Cmd/Ctrl + Z`: 撤銷
- `Cmd/Ctrl + Shift + Z`: 重做

## 未來計劃

### 第二階段功能
- [ ] 圖片上傳與插入
- [ ] 表格支持
- [ ] 任務列表（Todo list）
- [ ] 代碼語法高亮
- [ ] 導入/導出 .md 文件
- [ ] 本地存儲自動保存
- [ ] 深色模式

### 第三階段功能
- [ ] 雲端同步
- [ ] 協作編輯
- [ ] 移動端 APP（React Native / Capacitor）
- [ ] PWA 支持
- [ ] 插件系統

## 依賴說明

### 生產依賴
- `react` & `react-dom`: React 核心庫
- `@tiptap/react`: Tiptap React 適配器
- `@tiptap/starter-kit`: Tiptap 基礎擴展包
- `@tiptap/extension-placeholder`: 佔位符擴展

### 開發依賴
- `vite`: 快速的構建工具
- `typescript`: TypeScript 編譯器
- `@vitejs/plugin-react`: Vite 的 React 插件
- `@types/react` & `@types/react-dom`: React 類型定義

## 自定義擴展

要添加新的編輯器功能，請參考 Tiptap 的[官方文檔](https://tiptap.dev/)。

示例：添加表格支持
```typescript
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

const editor = useEditor({
  extensions: [
    StarterKit,
    Table,
    TableRow,
    TableCell,
    TableHeader,
    // ... 其他擴展
  ],
})
```

## 性能優化

- ✅ 多階段 Docker 構建
- ✅ Nginx Gzip 壓縮
- ✅ 靜態資源緩存
- ✅ 按需加載組件
- ✅ 生產構建優化

## License

MIT

## 貢獻

歡迎提交 Issue 和 Pull Request！

## 技術支持

如有問題或建議，請提交 Issue。
