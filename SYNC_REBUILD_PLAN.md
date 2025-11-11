# 🔄 Google Drive 同步系統重建計劃

## 目標
從頭重建一個正確、可靠、易於理解的同步系統。

---

## 📋 階段 0：診斷當前問題（進行中）

### 目標
理解當前數據狀態，找出問題根源。

### 操作步驟

#### 步驟 0.1：執行診斷
1. 刷新頁面
2. 查看右上角的「數據庫診斷工具」
3. 點擊「執行診斷」
4. 查看報告內容

#### 步驟 0.2：確認問題
需要確認：
- [ ] 有多少個 folders？
- [ ] 哪些是根目錄（parentId: null）？
- [ ] 哪些 folders 有 driveFileId？
- [ ] MD Editor 和 SQL Tool 的 parentId 是否正確？

#### 步驟 0.3：清理狀態
1. 點擊「清除 driveFileId」
2. 手動刪除 Google Drive 上的所有 .ppage 文件
3. 登出並重新登入

### 預期結果
- 本地：3 個 folders（Dean 資料、MD Editor、SQL Tool）
- Dean 資料 的 parentId: null（根目錄）
- MD Editor 和 SQL Tool 的 parentId: folder-1762315628465（Dean 資料的 ID）
- 所有 folders 的 driveFileId: undefined

### 檢查點
✅ 診斷報告顯示正確的層級結構
✅ 只有 1 個根目錄（Dean 資料）
✅ 所有 driveFileId 已清除
✅ Google Drive 上沒有任何 .ppage 文件

---

## 📋 階段 1：修復基礎數據結構

### 目標
確保 folder 數據結構和查詢邏輯正確。

### 文件修改

#### 1.1 修復 getAllRootFolders()
**文件**：`src/utils/folderUtils.ts`

**檢查邏輯**：
```typescript
export async function getAllRootFolders(): Promise<Folder[]> {
  const folders = await db.getFoldersByParent(null)
  console.log('getAllRootFolders:', folders.map(f => f.name))
  return folders
}
```

**測試**：
```javascript
// 在瀏覽器 console 執行
import { getAllRootFolders } from './utils/folderUtils'
const roots = await getAllRootFolders()
console.log('Root folders:', roots.map(f => f.name))
// 應該只輸出：["Dean 資料"]
```

#### 1.2 確保 syncLocalToDrive 只處理根目錄
**文件**：`src/services/syncManager.ts`

**修改邏輯**：
```typescript
private async syncLocalToDrive(...) {
  // 獲取根目錄
  const localFolders = await getAllRootFolders()

  // 驗證：全部都應該是 parentId === null
  const nonRoots = localFolders.filter(f => f.parentId !== null)
  if (nonRoots.length > 0) {
    console.error('❌ getAllRootFolders returned non-root folders:', nonRoots)
    throw new Error('Invalid root folders detected')
  }

  console.log(`✅ Processing ${localFolders.length} root folders`)

  // 只上傳根目錄
  for (const folder of localFolders) {
    // ... 上傳邏輯
  }
}
```

### 檢查點
✅ getAllRootFolders() 只返回 parentId === null 的 folders
✅ syncLocalToDrive 有驗證邏輯
✅ 控制台日誌清晰顯示處理的 folder

---

## 📋 階段 2：本地操作（不涉及雲端）

### 目標
確保序列化/反序列化/本地匯出匯入完全正確。

### 2.1 測試序列化（folder → .ppage）

**操作**：
```javascript
// 在瀏覽器 console
import { serializeFolderToPpage } from './utils/ppageFormat'
import { getAllRootFolders } from './utils/folderUtils'

const roots = await getAllRootFolders()
const { blob, fileName } = await serializeFolderToPpage(roots[0].id)

console.log('Serialized:', {
  fileName,
  size: blob.size,
  type: blob.type,
})
```

**預期**：
- fileName: "Dean 資料.ppage"
- size: > 0
- type: "application/zip"

### 2.2 測試反序列化（.ppage → 數據結構）

**操作**：
```javascript
import { deserializePpage } from './utils/ppageFormat'

const content = await deserializePpage(blob)

console.log('Deserialized:', {
  folderName: content.metadata.folderName,
  subfoldersCount: content.data.subfolders.length,
  pagesCount: content.data.pages.length,
})
```

**預期**：
- folderName: "Dean 資料"
- subfoldersCount: 2（MD Editor、SQL Tool）
- pagesCount: 所有 pages 數量

### 2.3 測試保留時間戳

**操作**：
```javascript
// 檢查序列化的數據
const originalFolder = roots[0]
const serializedFolder = content.data.folder

console.log('Time stamps preserved:', {
  original: {
    createdAt: originalFolder.createdAt,
    updatedAt: originalFolder.updatedAt,
    order: originalFolder.order,
  },
  serialized: {
    createdAt: serializedFolder.createdAt,
    updatedAt: serializedFolder.updatedAt,
    order: serializedFolder.order,
  },
  match: originalFolder.createdAt === serializedFolder.createdAt,
})
```

**預期**：
- match: true
- 所有時間戳完全相同

### 2.4 測試本地匯入

**操作**：
1. 創建一個測試 folder 和 page
2. 匯出為 .ppage
3. 刪除該 folder
4. 從 .ppage 匯入
5. 檢查時間戳是否保留

### 檢查點
✅ 序列化/反序列化成功
✅ 時間戳完全保留
✅ folder 層級結構正確
✅ 所有 pages 都包含在內

---

## 📋 階段 3：雲端基礎操作

### 目標
確保 Drive API 操作正確。

### 3.1 手動上傳單個 .ppage

**操作**：
```javascript
import { driveService } from './services/driveService'

// 上傳
const driveFileId = await driveService.uploadPpageFile({
  folderId: roots[0].id,
  fileName: 'Dean 資料.ppage',
  blob: blob,
})

console.log('Uploaded:', driveFileId)
```

**驗證**：
- 到 Google Drive 檢查文件存在
- 文件名正確
- 可以下載

### 3.2 列出 Drive 上的文件

**操作**：
```javascript
const files = await driveService.listPpageFiles()

console.log('Files on Drive:', files.map(f => ({
  name: f.name,
  id: f.id,
  folderId: f.appProperties?.folderId,
})))
```

**預期**：
- 只有一個文件
- name: "Dean 資料.ppage"
- folderId 對應本地根 folder ID

### 3.3 從 Drive 下載

**操作**：
```javascript
const downloadedBlob = await driveService.downloadPpageFile(driveFileId)
const downloadedContent = await deserializePpage(downloadedBlob)

console.log('Downloaded:', {
  folderName: downloadedContent.metadata.folderName,
  subfoldersCount: downloadedContent.data.subfolders.length,
})
```

**預期**：
- 內容與上傳的完全一致

### 檢查點
✅ 上傳成功
✅ 列出文件正確
✅ 下載內容一致
✅ appProperties.folderId 正確設置

---

## 📋 階段 4：手動同步（單向）

### 目標
實現簡單的手動上傳和手動下載。

### 4.1 手動上傳：本地 → Drive

**UI**：
- 按鈕：「上傳到 Drive」
- 只上傳根目錄
- 顯示上傳進度

**邏輯**：
```typescript
async function manualUpload() {
  const roots = await getAllRootFolders()

  for (const root of roots) {
    console.log(`Uploading ${root.name}...`)

    // 序列化
    const { blob, fileName } = await serializeFolderToPpage(root.id)

    // 上傳
    const driveFileId = await driveService.uploadPpageFile({
      folderId: root.id,
      fileName,
      blob,
    })

    // 更新本地
    await db.updateFolder({
      ...root,
      driveFileId,
      lastSyncedAt: Date.now(),
    })

    console.log(`✓ Uploaded ${root.name}`)
  }
}
```

### 4.2 手動下載：Drive → 本地

**UI**：
- 按鈕：「從 Drive 下載」
- 列出 Drive 上的所有 .ppage
- 讓用戶選擇要下載哪個
- 顯示下載進度

**邏輯**：
```typescript
async function manualDownload(driveFileId: string) {
  // 下載
  const blob = await driveService.downloadPpageFile(driveFileId)

  // 反序列化
  const content = await deserializePpage(blob)

  // 還原到數據庫
  const newFolderId = await restorePpageToDatabase(content, {
    autoRename: true,
  })

  console.log(`✓ Downloaded ${content.metadata.folderName}`)
}
```

### 檢查點
✅ 手動上傳成功
✅ Drive 上看到文件
✅ 手動下載成功
✅ 時間戳保留
✅ 層級結構正確

---

## 📋 階段 5：智能同步

### 目標
實現基於時間戳的雙向同步。

### 5.1 時間戳比較邏輯

```typescript
function shouldUpload(localFolder: Folder, driveFile: DriveFile): boolean {
  const localModified = localFolder.updatedAt
  const driveModified = new Date(driveFile.modifiedTime).getTime()

  return localModified > driveModified
}

function shouldDownload(localFolder: Folder, driveFile: DriveFile): boolean {
  const localModified = localFolder.updatedAt
  const driveModified = new Date(driveFile.modifiedTime).getTime()

  return driveModified > localModified
}
```

### 5.2 雙向同步流程

```typescript
async function smartSync() {
  // 1. 獲取本地根目錄
  const localRoots = await getAllRootFolders()

  // 2. 獲取 Drive 文件
  const driveFiles = await driveService.listPpageFiles()

  // 3. 匹配：本地 folder ↔ Drive file
  for (const local of localRoots) {
    const drive = driveFiles.find(f => f.appProperties?.folderId === local.id)

    if (!drive) {
      // 本地有，Drive 沒有 → 上傳
      await uploadFolder(local)
    } else if (shouldUpload(local, drive)) {
      // 本地較新 → 上傳更新
      await uploadFolder(local, drive.id)
    } else if (shouldDownload(local, drive)) {
      // Drive 較新 → 下載更新
      await downloadAndUpdateFolder(drive, local)
    } else {
      // 相同 → 跳過
      console.log(`✓ ${local.name} is up to date`)
    }
  }

  // 4. 檢查 Drive 上有但本地沒有的（新設備首次登入）
  for (const drive of driveFiles) {
    const folderId = drive.appProperties?.folderId
    if (!folderId) continue

    const local = localRoots.find(f => f.id === folderId)
    if (!local) {
      // Drive 有，本地沒有 → 下載
      await downloadAndCreateFolder(drive)
    }
  }
}
```

### 5.3 衝突管理

**時間戳相同**：
- 策略：建立副本（"Folder name (2)"）

**時間戳相近（< 1 秒）**：
- 策略：視為相同，跳過

### 檢查點
✅ 時間戳比較邏輯正確
✅ 本地較新時正確上傳
✅ Drive 較新時正確下載
✅ 相同時跳過
✅ 衝突時建立副本

---

## 📋 階段 6：多設備支援

### 目標
支援多設備同步。

### 6.1 首次登入（設備 B）

**情境**：
- 設備 A：已有數據，已同步到 Drive
- 設備 B：首次登入，本地無數據

**邏輯**：
```typescript
async function firstTimeSync() {
  // 1. 檢查本地是否有數據
  const localRoots = await getAllRootFolders()

  if (localRoots.length === 0) {
    // 首次登入：下載所有
    console.log('First time login, downloading all from Drive...')

    const driveFiles = await driveService.listPpageFiles()

    for (const file of driveFiles) {
      await downloadAndCreateFolder(file)
    }

    console.log('✓ First time sync completed')
  } else {
    // 正常同步
    await smartSync()
  }
}
```

### 6.2 增量同步

**情境**：
- 設備 A：新建了一個 folder
- 設備 B：登入時應該下載新的 folder

**邏輯**：
- smartSync() 已經包含此邏輯（Drive 有但本地沒有 → 下載）

### 6.3 多設備衝突

**情境**：
- 設備 A 和 B 同時編輯同一個 folder
- 兩邊都更新了 updatedAt

**策略**：
- 使用 lastSyncedAt 作為基準
- 如果 Drive 的 modifiedTime > lastSyncedAt，表示其他設備有更新

### 檢查點
✅ 首次登入正確下載所有數據
✅ 新設備看到完整的 folder 結構
✅ 增量同步正確
✅ 多設備編輯不會丟失數據

---

## 🔧 關鍵設計決策

### 1. 只同步根目錄
- ✅ **決定**：一個根目錄 = 一個 .ppage 文件
- ✅ **理由**：保持層級結構完整，避免碎片化
- ✅ **實施**：getAllRootFolders() 嚴格檢查 parentId === null

### 2. 使用 appProperties 追蹤
- ✅ **決定**：每個 .ppage 的 appProperties.folderId 記錄本地 folder ID
- ✅ **理由**：改名、移動時仍能追蹤
- ✅ **實施**：上傳時設置，查找時使用

### 3. 保留時間戳
- ✅ **決定**：createdAt、updatedAt、order 完全保留
- ✅ **理由**：保持排序和歷史記錄
- ✅ **實施**：restorePpageToDatabase 使用原始值

### 4. 同步鎖
- ✅ **決定**：使用 isSyncing 標誌防止並發
- ✅ **理由**：避免數據競爭
- ✅ **實施**：performFullSync 開始時檢查，結束時釋放

### 5. 錯誤處理
- ✅ **決定**：每個操作都有 try-catch，記錄詳細日誌
- ✅ **理由**：方便診斷問題
- ✅ **實施**：console.log 使用統一格式（✓ / ✗ / ⚠️）

---

## 📝 測試清單

### 單元測試
- [ ] getAllRootFolders() 只返回根目錄
- [ ] serializeFolderToPpage() 保留時間戳
- [ ] deserializePpage() 正確解析
- [ ] restorePpageToDatabase() 保留時間戳

### 集成測試
- [ ] 上傳 → 下載 → 數據一致
- [ ] 本地修改 → 同步 → Drive 更新
- [ ] Drive 修改 → 同步 → 本地更新
- [ ] 衝突 → 建立副本

### 端到端測試
- [ ] 設備 A 上傳 → 設備 B 首次登入 → 下載成功
- [ ] 設備 A 修改 → 設備 B 同步 → 看到最新
- [ ] 兩設備同時修改 → 衝突處理正確

---

## 🚀 實施順序

1. **階段 0**：診斷當前問題（**立即開始**）
2. **階段 1**：修復基礎數據結構
3. **階段 2**：本地操作測試
4. **階段 3**：雲端基礎操作
5. **階段 4**：手動同步
6. **階段 5**：智能同步
7. **階段 6**：多設備支援

每個階段完成後，**必須通過所有檢查點**才能進入下一階段。

---

## 📞 下一步

**請執行階段 0 的步驟：**

1. 刷新頁面
2. 查看右上角的「數據庫診斷工具」
3. 點擊「執行診斷」
4. 複製報告內容給我

我會根據報告分析問題，然後我們開始階段 1。
