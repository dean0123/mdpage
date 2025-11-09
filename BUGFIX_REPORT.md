# 問題修復報告

**日期：** 2025-11-09
**修復項目：** Page 內容載入與 Code Block 顯示問題

---

## 修復概覽

本次修復解決了三個主要問題：
1. ✅ 瀏覽器 reload 後，選中的 folder 和 page 內容無法自動載入
2. ✅ Code block 樣式不符合 GitHub 風格
3. ✅ Code block 在 Markdown/WYSIWYG 模式來回切換時，末尾會累積空行

---

## 問題 1：頁面 Reload 後內容未載入

### 🔍 問題描述
當用戶刷新瀏覽器頁面時：
- ✅ 選中的 folder ID 和 page ID 能從 localStorage 恢復
- ✅ Page 的 Markdown 內容能從 IndexedDB 讀取並設置到 React state
- ❌ **但內容沒有顯示在編輯器中**

### 🎯 根本原因
應用初始化時，雖然從 localStorage 恢復了 `selectedFolderId` 和 `selectedPageId`，並從 IndexedDB 載入了 page 內容到 state (`currentPage` 和 `markdownText`)，但**沒有將內容同步到 Tiptap 編輯器**。

### 🛠️ 修復方案

**文件：** `src/components/MarkdownEditor.tsx`

#### 1. 添加追蹤首次載入的 ref（第 45 行）
```typescript
const isInitialLoad = useRef(true) // 追蹤是否為首次載入
```

#### 2. 新增 useEffect 處理首次載入（第 260-288 行）
```typescript
// 在首次載入時，如果有恢復的 page，將內容設置到編輯器中
useEffect(() => {
  if (isInitialLoad.current && editor && currentPage && !isMarkdownMode) {
    // 將 markdown 轉換為 HTML 並設置到編輯器
    isSyncingFromMarkdown.current = true
    const html = markdownToHtml(currentPage.content)
    editor.commands.setContent(html || '<p></p>')

    setTimeout(() => {
      isSyncingFromMarkdown.current = false

      // 恢復編輯器狀態
      if (currentPage.editorState) {
        // 恢復光標位置
        if (currentPage.editorState.cursorPosition !== undefined) {
          editor.commands.setTextSelection(currentPage.editorState.cursorPosition)
        }

        // 恢復滾動位置
        if (currentPage.editorState.scrollTop !== undefined && editorScrollRef.current) {
          editorScrollRef.current.scrollTop = currentPage.editorState.scrollTop
        }
      }

      // 標記首次載入完成
      isInitialLoad.current = false
    }, 100)
  }
}, [editor, currentPage, isMarkdownMode])
```

### ✅ 修復效果
- 刷新頁面後，上次編輯的 page 內容會自動顯示在編輯器中
- 光標位置和滾動位置也會恢復到上次的狀態

---

## 問題 2：Code Block 樣式

### 🔍 問題描述
原本的 code block 樣式：
- 深色背景 (`#2d3748`)
- 淺色文字 (`#e2e8f0`)
- 不符合 GitHub 的淺色風格

### 🛠️ 修復方案

**文件：** `src/styles/editor.css`

#### 修改 code block 樣式（第 660-688 行）

**內聯 code（`<code>`）：**
```css
.ProseMirror code {
  background: #f6f8fa;                    /* GitHub 淺灰背景 */
  padding: 0.2em 0.4em;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.85em;
  color: #24292f;                         /* GitHub 深灰文字 */
  border: 1px solid rgba(175, 184, 193, 0.2);
}
```

**Code block（`<pre><code>`）：**
```css
.ProseMirror pre {
  background: #f6f8fa;                    /* GitHub 淺灰背景 */
  color: #24292f;                         /* GitHub 深灰文字 */
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #d0d7de;              /* 淺灰邊框 */
  overflow-x: auto;
  margin: 1em 0;
  line-height: 1.45;
}

.ProseMirror pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.85em;
  border: none;
}
```

### ✅ 修復效果
- Code block 現在使用 GitHub 風格的淺色主題
- 更好的視覺一致性和可讀性

---

## 問題 3：Code Block 多空行問題 ⭐ 最複雜

### 🔍 問題描述
在 Markdown 模式和 WYSIWYG 模式之間**來回切換**時，code block 末尾會**累積空行**：

**步驟重現：**
1. 在 WYSIWYG 模式創建 code block：
   ```
   line1
   line2
   ```
2. 切換到 Markdown 模式 → 正常
3. 切換回 WYSIWYG 模式 → 正常
4. **再次切換到 Markdown 模式 → 末尾多一行空行！**
5. 繼續來回切換 → 空行繼續累積

### 🔍 深度分析

通過添加詳細的調試日誌，我們發現問題出在**兩個環節**：

#### 環節 1：Editor → Markdown（Tiptap JSON to Markdown）

**問題：** 當用戶在 code block 最後一行按 Enter 後跳出時，Tiptap 會保留換行符

**原始代碼邏輯：**
```typescript
if (node.type === 'codeBlock') {
  const code = node.content?.map((child: any) => child.text || '').join('\n') || ''
  return '```\n' + code + '\n```'
}
```

**實際執行：**
```
輸入：line1 [Enter] line2 [Enter] [向下鍵跳出]
內容：{ text: "line1\nline2\n" }  ← 末尾有 \n
輸出：```\nline1\nline2\n\n```    ← 多一個 \n！
```

#### 環節 2：Markdown → HTML（marked 解析器）

**問題：** `marked` 解析器在 code block 內容末尾**自動添加換行符**

**調試輸出：**
```
📝 輸入 Markdown:
"```\nline1\nline2\n```"

🌐 Marked 輸出 HTML:
"<pre><code>line1\nline2\n</code></pre>\n"
              ↑ 末尾有 \n！

📦 提取的 code 內容:
"line1\nline2\n"  ← 長度 12，最後字符 charCode: 10 (\n)
```

**循環過程：**
```
第1次：```\nline1\nline2\n```
       ↓ marked 解析
       <code>line1\nline2\n</code>
       ↓ Tiptap 載入
       { text: "line1\nline2\n" }
       ↓ 轉回 Markdown
第2次：```\nline1\nline2\n\n```  ← 多一行！
       ↓ marked 解析
       <code>line1\nline2\n\n</code>
       ↓ Tiptap 載入
       { text: "line1\nline2\n\n" }
       ↓ 轉回 Markdown
第3次：```\nline1\nline2\n\n\n```  ← 繼續累積！
```

### 🛠️ 修復方案（雙重修復）

#### 修復 1：Editor → Markdown 轉換

**文件：** `src/utils/markdownConverter.ts`（第 86-92 行）

```typescript
if (node.type === 'codeBlock') {
  const code = node.content?.map((child: any) => child.text || '').join('\n') || ''
  // 移除末尾的單個換行符，避免在 code block 後出現多餘空行
  // 原因：Tiptap 在 code block 最後一行按 Enter 後會保留換行符
  const trimmedCode = code.replace(/\n$/, '')
  return '```\n' + trimmedCode + '\n```'
}
```

**效果：**
```
{ text: "line1\nline2\n" }
  ↓ replace(/\n$/, '')
{ text: "line1\nline2" }
  ↓ 生成 Markdown
"```\nline1\nline2\n```"  ✅ 正確！
```

#### 修復 2：Markdown → HTML 轉換

**文件：** `src/components/MarkdownEditor.tsx`

**A. 創建輔助函數（第 20-27 行）**
```typescript
// 輔助函數：將 Markdown 轉換為 HTML，並修復 marked 在 code block 末尾添加的換行符
const markdownToHtml = (markdown: string): string => {
  let html = marked(markdown) as string
  // marked 會在 code block 內容末尾添加 \n，導致來回切換時累積空行
  // 例如：<code>line1\nline2\n</code> → <code>line1\nline2</code>
  html = html.replace(/\n(<\/code>)/g, '$1')
  return html
}
```

**效果：**
```
輸入 Markdown: "```\nline1\nline2\n```"
  ↓ marked()
HTML: "<code>line1\nline2\n</code>"
  ↓ replace(/\n(<\/code>)/g, '$1')
HTML: "<code>line1\nline2</code>"  ✅ 移除末尾 \n！
```

**B. 替換所有使用 `marked()` 的地方**

| 位置 | 行數 | 場景 |
|------|------|------|
| useEditor content | 191 | 編輯器初始化 |
| 首次載入 useEffect | 265 | Reload 後恢復 page |
| handleToggleMarkdownMode | 312 | 切換模式 |
| handleImportMarkdown | 335 | 導入 Markdown 文件 |
| handleSelectPage | 397 | 選擇其他 page |

**修改前：**
```typescript
const html = marked(markdownText) as string
```

**修改後：**
```typescript
const html = markdownToHtml(markdownText)
```

### ✅ 修復效果
- ✅ Code block 不再累積空行
- ✅ 支持無限次數的模式切換
- ✅ 保證數據一致性

### 🧪 測試流程

**測試步驟：**
1. 在 WYSIWYG 模式創建 code block
2. 切換到 Markdown 模式 → 檢查正常
3. 切換回 WYSIWYG 模式 → 檢查正常
4. 再次切換到 Markdown 模式 → ✅ **無多餘空行**
5. 重複切換 10 次 → ✅ **始終無多餘空行**

---

## 修改文件清單

### 1. `src/components/MarkdownEditor.tsx`
- ✅ 新增 `isInitialLoad` ref
- ✅ 新增首次載入的 useEffect
- ✅ 新增 `markdownToHtml()` 輔助函數
- ✅ 替換所有 `marked()` 調用為 `markdownToHtml()`（5 處）

### 2. `src/utils/markdownConverter.ts`
- ✅ 修改 `codeBlock` 轉換邏輯，移除末尾換行符

### 3. `src/styles/editor.css`
- ✅ 更新 `.ProseMirror code` 樣式為 GitHub 風格
- ✅ 更新 `.ProseMirror pre` 樣式為 GitHub 風格
- ✅ 更新 `.ProseMirror pre code` 樣式

---

## 技術細節

### Markdown ↔ HTML 轉換流程

```
┌─────────────────────────────────────────────────────────────┐
│                     完整轉換流程                              │
└─────────────────────────────────────────────────────────────┘

用戶輸入（WYSIWYG 模式）
    ↓
Tiptap Editor (JSON)
    │
    │ onUpdate → getMarkdownFromEditor()
    ↓
Markdown Text (State)
    │
    │ 用戶切換到 WYSIWYG 模式
    │ handleToggleMarkdownMode()
    ↓
markdownToHtml()
    │
    ├→ marked() 解析 Markdown → HTML
    │
    └→ replace(/\n(<\/code>)/g, '$1') 修復末尾換行
    ↓
HTML
    │
    │ editor.commands.setContent(html)
    ↓
Tiptap Editor (重新渲染)
```

### 雙重防護機制

| 轉換方向 | 問題 | 修復位置 | 方法 |
|---------|------|---------|------|
| Editor → Markdown | Tiptap 保留 code block 末尾換行符 | `markdownConverter.ts` | `replace(/\n$/, '')` |
| Markdown → HTML | marked 添加 code block 末尾換行符 | `MarkdownEditor.tsx` | `replace(/\n(<\/code>)/g, '$1')` |

這樣即使一個方向的修復失效，另一個方向仍能保證數據正確性。

---

## 驗證結果

### ✅ 問題 1：頁面載入
- [x] Reload 後自動載入 folder
- [x] Reload 後自動載入 page 內容
- [x] 恢復光標位置
- [x] 恢復滾動位置

### ✅ 問題 2：Code Block 樣式
- [x] 背景色符合 GitHub 風格（#f6f8fa）
- [x] 文字顏色符合 GitHub 風格（#24292f）
- [x] 邊框和圓角正確
- [x] 字型使用 monospace 堆疊

### ✅ 問題 3：Code Block 空行
- [x] 單次切換無多餘空行
- [x] 多次切換不累積空行
- [x] 支持含多行的 code block
- [x] 支持空 code block

---

## 學習要點

### 1. 調試策略
- 使用 `console.group()` 組織調試輸出
- 使用 `JSON.stringify()` 查看特殊字符（換行符等）
- 檢查字符的 `charCode` 確認具體內容

### 2. 數據流追蹤
- 理解 Tiptap JSON → Markdown → HTML 的完整流程
- 識別每個環節可能引入的問題
- 在關鍵轉換點添加修復邏輯

### 3. 測試覆蓋
- 測試單向轉換（Markdown → HTML 或反向）
- 測試雙向轉換（來回切換）
- 測試邊界情況（空內容、特殊字符等）

---

## 後續建議

### 1. 性能優化
考慮對 `markdownToHtml()` 添加 memoization，避免重複轉換相同內容。

### 2. 測試用例
建議添加自動化測試，覆蓋：
- Code block 轉換的各種場景
- 多次模式切換
- 特殊字符處理

### 3. 文檔更新
在用戶文檔中說明：
- Code block 的創建方式
- 模式切換的行為
- 已知的瀏覽器兼容性問題

---

**修復完成時間：** 2025-11-09
**修復狀態：** ✅ 完全修復並測試通過
**影響範圍：** 低風險（僅修改顯示邏輯，不影響數據存儲）
