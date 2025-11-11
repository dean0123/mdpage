/**
 * V2 同步管理器
 * 主要同步邏輯
 */

import { db, Folder, Page } from '../db'
import { DriveV2Service } from './driveV2'
import {
  serializeFolders,
  deserializeFolders,
  serializeDeletedFolders,
  deserializeDeletedFolders,
  serializePages,
  deserializePages,
  serializeDeletedPages,
  deserializeDeletedPages,
  serializePageContent,
  deserializePageContent,
  type PageMetadata
} from './serializer'
import { calculateContentHash } from './hashCalculator'

export interface SyncResult {
  success: boolean
  foldersUploaded: number
  foldersDownloaded: number
  foldersDeleted: number
  pagesUploaded: number
  pagesDownloaded: number
  pagesDeleted: number
  conflicts: number  // 衝突數量（已建立副本）
  errors: string[]
}

/**
 * SyncManagerV2 類
 */
export class SyncManagerV2 {
  private driveService: DriveV2Service | null = null
  private isSyncing: boolean = false

  /**
   * 初始化（設置 access token）
   */
  async initialize(accessToken: string): Promise<void> {
    this.driveService = new DriveV2Service(accessToken)
    await this.driveService.initialize()
  }

  /**
   * 主同步函數
   */
  async performSync(accessToken: string): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress')
    }

    this.isSyncing = true

    const result: SyncResult = {
      success: false,
      foldersUploaded: 0,
      foldersDownloaded: 0,
      foldersDeleted: 0,
      pagesUploaded: 0,
      pagesDownloaded: 0,
      pagesDeleted: 0,
      conflicts: 0,
      errors: []
    }

    try {
      // 初始化 Drive 服務
      await this.initialize(accessToken)

      console.log('🔄 開始 V2 同步...')

      // Step 1: 同步 folders
      console.log('📁 同步 folders...')
      await this.syncFolders(result)

      // Step 2: 同步 deletedFolders
      console.log('🗑️  同步 deletedFolders...')
      await this.syncDeletedFolders(result)

      // Step 3: 同步 pages metadata
      console.log('📄 同步 pages metadata...')
      await this.syncPages(result)

      // Step 4: 同步 deletedPages
      console.log('🗑️  同步 deletedPages...')
      await this.syncDeletedPages(result)

      // Step 5: 同步 page contents（按需）
      console.log('📝 同步 page contents...')
      await this.syncPageContents(result)

      result.success = true
      console.log('✅ V2 同步完成', result)

    } catch (error: any) {
      console.error('❌ V2 同步失敗:', error)
      result.errors.push(error.message || String(error))
      result.success = false
    } finally {
      this.isSyncing = false
    }

    return result
  }

  // ==================== Folders 同步 ====================

  private async syncFolders(result: SyncResult): Promise<void> {
    if (!this.driveService) throw new Error('DriveService not initialized')

    // 1. 獲取本地 folders
    const localFolders = await db.getAllFolders()
    console.log(`  本地 folders: ${localFolders.length} 個`)

    // 2. 下載 Drive folders
    const driveFoldersJson = await this.driveService.downloadFoldersJson()

    if (!driveFoldersJson) {
      // Drive 上沒有 folders.json，第一次同步，上傳本地數據
      console.log('  Drive 上無 folders.json，上傳本地數據')
      const serialized = serializeFolders(localFolders)
      await this.driveService.uploadFoldersJson(JSON.stringify(serialized, null, 2))
      result.foldersUploaded = localFolders.length
      return
    }

    // 3. 解析 Drive folders
    const driveFoldersFile = deserializeFolders(driveFoldersJson)
    const driveFolders = driveFoldersFile.folders
    console.log(`  Drive folders: ${driveFolders.length} 個`)

    // 4. 比對並合併
    const { toUpload, toDownload } = this.compareFolders(localFolders, driveFolders)

    console.log(`  需要上傳: ${toUpload.length} 個`)
    console.log(`  需要下載: ${toDownload.length} 個`)

    // 5. 下載新的 folders 到本地
    for (const driveFolder of toDownload) {
      await db.createFolder(driveFolder)
      result.foldersDownloaded++
    }

    // 6. 合併並上傳
    if (toUpload.length > 0 || toDownload.length > 0) {
      // 重新獲取本地所有 folders（包含剛下載的）
      const allLocalFolders = await db.getAllFolders()
      const serialized = serializeFolders(allLocalFolders)
      await this.driveService.uploadFoldersJson(JSON.stringify(serialized, null, 2))
      result.foldersUploaded = toUpload.length
    }
  }

  /**
   * 比對本地和 Drive 的 folders
   */
  private compareFolders(
    localFolders: Folder[],
    driveFolders: Folder[]
  ): { toUpload: Folder[]; toDownload: Folder[] } {
    const localMap = new Map(localFolders.map(f => [f.id, f]))
    const driveMap = new Map(driveFolders.map(f => [f.id, f]))

    const toUpload: Folder[] = []
    const toDownload: Folder[] = []

    // 檢查本地有但 Drive 沒有的
    for (const localFolder of localFolders) {
      if (!driveMap.has(localFolder.id)) {
        toUpload.push(localFolder)
      } else {
        // 兩邊都有，比對 updatedAt
        const driveFolder = driveMap.get(localFolder.id)!
        if (localFolder.updatedAt > driveFolder.updatedAt) {
          toUpload.push(localFolder)
        }
      }
    }

    // 檢查 Drive 有但本地沒有的
    for (const driveFolder of driveFolders) {
      if (!localMap.has(driveFolder.id)) {
        toDownload.push(driveFolder)
      } else {
        // 兩邊都有，比對 updatedAt
        const localFolder = localMap.get(driveFolder.id)!
        if (driveFolder.updatedAt > localFolder.updatedAt) {
          toDownload.push(driveFolder)
        }
      }
    }

    return { toUpload, toDownload }
  }

  // ==================== DeletedFolders 同步 ====================

  private async syncDeletedFolders(result: SyncResult): Promise<void> {
    if (!this.driveService) throw new Error('DriveService not initialized')

    // 1. 獲取本地刪除記錄（如果數據庫未升級，返回空數組）
    let localDeleted: Array<{ folderId: string; deletedAt: number }> = []
    try {
      localDeleted = await db.getAllDeletedFolders()
    } catch (error) {
      console.warn('Failed to get deleted folders (DB not upgraded?), skipping:', error)
      return
    }
    console.log(`  本地刪除記錄: ${localDeleted.length} 個`)

    // 2. 下載 Drive 刪除記錄
    const driveDeletedJson = await this.driveService.downloadDeletedFoldersJson()

    if (!driveDeletedJson) {
      // Drive 上沒有，上傳本地記錄
      if (localDeleted.length > 0) {
        const serialized = serializeDeletedFolders(localDeleted)
        await this.driveService.uploadDeletedFoldersJson(JSON.stringify(serialized, null, 2))
      }
      return
    }

    // 3. 解析 Drive 刪除記錄
    const driveDeletedFile = deserializeDeletedFolders(driveDeletedJson)
    const driveDeleted = driveDeletedFile.deleted
    console.log(`  Drive 刪除記錄: ${driveDeleted.length} 個`)

    // 4. 處理 Drive 的刪除記錄（靜默刪除本地對應的 folders）
    for (const deleted of driveDeleted) {
      const folder = await db.getFolder(deleted.folderId)
      if (folder) {
        await db.silentDeleteFolder(deleted.folderId)
        result.foldersDeleted++
        console.log(`  刪除本地 folder: ${deleted.folderId}`)
      }
    }

    // 5. 合併刪除記錄並上傳
    const mergedDeleted = this.mergeDeletedRecords(localDeleted, driveDeleted)
    const serialized = serializeDeletedFolders(mergedDeleted)
    await this.driveService.uploadDeletedFoldersJson(JSON.stringify(serialized, null, 2))
  }

  /**
   * 合併刪除記錄（去重）
   */
  private mergeDeletedRecords(
    local: Array<{ folderId: string; deletedAt: number }>,
    drive: Array<{ folderId: string; deletedAt: number }>
  ): Array<{ folderId: string; deletedAt: number }> {
    const map = new Map<string, number>()

    for (const item of [...local, ...drive]) {
      const existing = map.get(item.folderId)
      if (!existing || item.deletedAt > existing) {
        map.set(item.folderId, item.deletedAt)
      }
    }

    return Array.from(map.entries()).map(([folderId, deletedAt]) => ({
      folderId,
      deletedAt
    }))
  }

  // ==================== Pages 同步 ====================

  private async syncPages(result: SyncResult): Promise<void> {
    if (!this.driveService) throw new Error('DriveService not initialized')

    // 1. 獲取本地 pages
    const localPages = await db.getAllPages()
    console.log(`  本地 pages: ${localPages.length} 個`)

    // 2. 下載 Drive pages.json
    const drivePagesJson = await this.driveService.downloadPagesJson()

    if (!drivePagesJson) {
      // Drive 上沒有，上傳本地數據
      console.log('  Drive 上無 pages.json，上傳本地數據')
      const serialized = await serializePages(localPages)
      await this.driveService.uploadPagesJson(JSON.stringify(serialized, null, 2))
      result.pagesUploaded = localPages.length
      return
    }

    // 3. 解析 Drive pages
    const drivePagesFile = deserializePages(drivePagesJson)
    const drivePages = drivePagesFile.pages
    console.log(`  Drive pages: ${drivePages.length} 個`)

    // 4. 比對（這裡只比對 metadata，content 在下一步處理）
    const { toUpload, toDownload } = await this.comparePages(localPages, drivePages)

    console.log(`  需要上傳: ${toUpload.length} 個`)
    console.log(`  需要下載: ${toDownload.length} 個`)

    // 5. 記錄需要下載的 pages（在 syncPageContents 中處理）
    // 這裡先不創建 page，只記錄 metadata

    // 6. 上傳 pages.json（只上傳 metadata，不計入 pagesUploaded）
    // 實際的 page content 上傳在 syncPageContents() 中計算
    if (toUpload.length > 0 || toDownload.length > 0) {
      const serialized = await serializePages(localPages)
      await this.driveService.uploadPagesJson(JSON.stringify(serialized, null, 2))
      console.log(`  已更新 pages.json`)
    }
  }

  /**
   * 比對本地和 Drive 的 pages（基於 metadata）
   */
  private async comparePages(
    localPages: Page[],
    drivePages: PageMetadata[]
  ): Promise<{ toUpload: Page[]; toDownload: PageMetadata[] }> {
    const localMap = new Map(localPages.map(p => [p.id, p]))
    const driveMap = new Map(drivePages.map(p => [p.id, p]))

    const toUpload: Page[] = []
    const toDownload: PageMetadata[] = []

    // 檢查本地有但 Drive 沒有的
    for (const localPage of localPages) {
      if (!driveMap.has(localPage.id)) {
        toUpload.push(localPage)
      } else {
        // 兩邊都有，比對 updatedAt
        const drivePage = driveMap.get(localPage.id)!
        if (localPage.updatedAt > drivePage.updatedAt) {
          toUpload.push(localPage)
        }
      }
    }

    // 檢查 Drive 有但本地沒有的
    for (const drivePage of drivePages) {
      if (!localMap.has(drivePage.id)) {
        toDownload.push(drivePage)
      } else {
        // 兩邊都有，比對 updatedAt
        const localPage = localMap.get(drivePage.id)!
        if (drivePage.updatedAt > localPage.updatedAt) {
          toDownload.push(drivePage)
        }
      }
    }

    return { toUpload, toDownload }
  }

  // ==================== DeletedPages 同步 ====================

  private async syncDeletedPages(result: SyncResult): Promise<void> {
    if (!this.driveService) throw new Error('DriveService not initialized')

    // 1. 獲取本地刪除記錄（如果數據庫未升級，返回空數組）
    let localDeleted: Array<{ pageId: string; deletedAt: number }> = []
    try {
      localDeleted = await db.getAllDeletedPages()
    } catch (error) {
      console.warn('Failed to get deleted pages (DB not upgraded?), skipping:', error)
      return
    }
    console.log(`  本地 page 刪除記錄: ${localDeleted.length} 個`)

    // 2. 下載 Drive 刪除記錄
    const driveDeletedJson = await this.driveService.downloadDeletedPagesJson()

    if (!driveDeletedJson) {
      // Drive 上沒有，上傳本地記錄
      if (localDeleted.length > 0) {
        const serialized = serializeDeletedPages(localDeleted)
        await this.driveService.uploadDeletedPagesJson(JSON.stringify(serialized, null, 2))
      }
      return
    }

    // 3. 解析 Drive 刪除記錄
    const driveDeletedFile = deserializeDeletedPages(driveDeletedJson)
    const driveDeleted = driveDeletedFile.deleted
    console.log(`  Drive page 刪除記錄: ${driveDeleted.length} 個`)

    // 4. 處理 Drive 的刪除記錄（靜默刪除本地對應的 pages）
    for (const deleted of driveDeleted) {
      const page = await db.getPage(deleted.pageId)
      if (page) {
        await db.silentDeletePage(deleted.pageId)
        result.pagesDeleted++
        console.log(`  刪除本地 page: ${deleted.pageId}`)
      }

      // 同時刪除 Drive 上的 page content
      await this.driveService.deletePageContent(deleted.pageId)
    }

    // 5. 合併刪除記錄並上傳
    const mergedDeleted = this.mergePageDeletedRecords(localDeleted, driveDeleted)
    const serialized = serializeDeletedPages(mergedDeleted)
    await this.driveService.uploadDeletedPagesJson(JSON.stringify(serialized, null, 2))
  }

  private mergePageDeletedRecords(
    local: Array<{ pageId: string; deletedAt: number }>,
    drive: Array<{ pageId: string; deletedAt: number }>
  ): Array<{ pageId: string; deletedAt: number }> {
    const map = new Map<string, number>()

    for (const item of [...local, ...drive]) {
      const existing = map.get(item.pageId)
      if (!existing || item.deletedAt > existing) {
        map.set(item.pageId, item.deletedAt)
      }
    }

    return Array.from(map.entries()).map(([pageId, deletedAt]) => ({
      pageId,
      deletedAt
    }))
  }

  // ==================== Page Contents 同步 ====================

  private async syncPageContents(result: SyncResult): Promise<void> {
    if (!this.driveService) throw new Error('DriveService not initialized')

    // 1. 獲取本地和 Drive 的 pages metadata
    const localPages = await db.getAllPages()
    const drivePagesJson = await this.driveService.downloadPagesJson()

    if (!drivePagesJson) {
      // Drive 上沒有 pages，上傳所有本地 page contents
      console.log(`  上傳所有 page contents (第一次同步)`)
      for (const page of localPages) {
        await this.driveService.uploadPageContent(page.id, serializePageContent(page))
        result.pagesUploaded++
      }
      return
    }

    const drivePagesFile = deserializePages(drivePagesJson)
    let drivePages = drivePagesFile.pages

    // 🔧 修復數據不一致：檢查實際的 .md 文件
    const actualPageFiles = await this.driveService.listAllPageFiles()
    const actualPageIds = new Set(
      actualPageFiles.map(f => f.name.replace('page-', '').replace('.md', ''))
    )

    console.log(`  pages.json 中的 pages: ${drivePages.length} 個`)
    console.log(`  實際的 .md 文件: ${actualPageIds.size} 個`)

    // 如果數量不一致，需要修復
    if (drivePages.length !== actualPageIds.size) {
      console.warn(`  ⚠️ 檢測到數據不一致！正在修復...`)

      // 找出有 .md 文件但 pages.json 中沒有的
      const missingInMetadata: string[] = []
      for (const pageId of actualPageIds) {
        if (!drivePages.find(p => p.id === pageId)) {
          missingInMetadata.push(pageId)
        }
      }

      console.log(`  缺少 metadata 的 pages: ${missingInMetadata.length} 個`)

      // 獲取第一個根 folder 作為預設的 folderId
      const allFolders = await db.getAllFolders()
      const rootFolder = allFolders.find(f => f.parentId === null)
      const defaultFolderId = rootFolder?.id || (allFolders.length > 0 ? allFolders[0].id : 'unknown')

      if (defaultFolderId === 'unknown') {
        console.warn(`  ⚠️ 沒有可用的 folder，無法關聯 pages`)
      } else {
        console.log(`  使用預設 folder: ${rootFolder?.name || allFolders[0]?.name} (${defaultFolderId})`)
      }

      // 下載這些 pages 的內容，重建 metadata
      for (const pageId of missingInMetadata) {
        const content = await this.driveService.downloadPageContent(pageId)
        if (content) {
          const pageContent = deserializePageContent(content)
          const contentHash = await calculateContentHash(pageContent)

          // 從內容中提取標題（第一行）
          const lines = pageContent.split('\n')
          let pageName = 'Untitled'
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#')) {
              pageName = trimmed.substring(0, 50) // 取前50字符
              break
            } else if (trimmed.startsWith('# ')) {
              pageName = trimmed.substring(2).trim()
              break
            }
          }

          // 重建 metadata
          const now = Date.now()
          drivePages.push({
            id: pageId,
            name: pageName,
            folderId: defaultFolderId,
            createdAt: now,
            updatedAt: now,
            contentHash: contentHash,
            contentSize: content.length
          })

          console.log(`  ✅ 重建 metadata: ${pageName} (${pageId})`)
        }
      }

      // 更新 pages.json
      const updatedPagesFile = {
        version: '2.0' as const,
        lastModified: Date.now(),
        pages: drivePages
      }
      await this.driveService.uploadPagesJson(JSON.stringify(updatedPagesFile, null, 2))
      console.log(`  ✅ 已更新 pages.json (${drivePages.length} 個 pages)`)
    }

    const localMap = new Map(localPages.map(p => [p.id, p]))
    const driveMap = new Map(drivePages.map(p => [p.id, p]))

    // 2. 獲取 Drive 上實際存在的 page 文件列表
    const drivePageFiles = await this.driveService.listAllPageFiles()
    const drivePageFileIds = new Set(
      drivePageFiles
        .map(f => f.name.replace('page-', '').replace('.md', ''))
        .filter(id => id)
    )

    // 3. 上傳本地更新的 page contents
    for (const localPage of localPages) {
      const drivePage = driveMap.get(localPage.id)
      const localHash = await calculateContentHash(localPage.content)

      // 上傳條件：
      // 1. Drive 上沒有 metadata (新 page)
      // 2. Drive 上有 metadata 但沒有實際文件 (第一次同步後的情況)
      // 3. Hash 不同 (內容有更新)
      const needUpload =
        !drivePage ||
        !drivePageFileIds.has(localPage.id) ||
        localHash !== drivePage.contentHash

      if (needUpload) {
        await this.driveService.uploadPageContent(localPage.id, serializePageContent(localPage))
        result.pagesUploaded++
        console.log(`  上傳 page content: ${localPage.id}`)
      }
    }

    // 3. 下載 Drive 更新的 page contents
    console.log(`  開始處理 ${drivePages.length} 個 Drive pages...`)
    for (const drivePage of drivePages) {
      const localPage = localMap.get(drivePage.id)

      if (!localPage) {
        // 本地沒有，下載
        console.log(`  本地沒有 page ${drivePage.id}，開始下載...`)
        const content = await this.driveService.downloadPageContent(drivePage.id)
        if (content) {
          console.log(`  成功下載內容，大小: ${content.length} bytes`)
          const newPage: Page = {
            id: drivePage.id,
            name: drivePage.name,
            folderId: drivePage.folderId,
            content: deserializePageContent(content),
            createdAt: drivePage.createdAt,
            updatedAt: drivePage.updatedAt,
          }
          await db.createPage(newPage)
          result.pagesDownloaded++
          console.log(`  ✅ 下載並創建 page: ${drivePage.name} (${drivePage.id})`)
        } else {
          console.warn(`  ⚠️ 下載 page content 失敗: ${drivePage.id}`)
        }
      } else {
        // 本地有，比對 hash
        const localHash = await calculateContentHash(localPage.content)
        if (localHash !== drivePage.contentHash) {
          // Hash 不同，需要檢測衝突

          // 衝突檢測：本地和 Drive 都有修改
          // 如果本地 updatedAt <= Drive updatedAt，但 hash 不同，說明：
          // - 本地有未同步的修改
          // - Drive 版本更新（其他設備修改）
          // → 這是衝突！
          if (localPage.updatedAt <= drivePage.updatedAt) {
            // 可能是衝突，進一步檢查：下載 Drive 內容比對
            const driveContent = await this.driveService.downloadPageContent(drivePage.id)
            if (driveContent) {
              const driveContentText = deserializePageContent(driveContent)
              const driveHash = await calculateContentHash(driveContentText)

              // 如果本地 hash 與 Drive hash 都不同於彼此，這是真正的衝突
              if (localHash !== driveHash && localPage.content !== driveContentText) {
                // 🔥 檢測到衝突！
                console.log(`  ⚠️  檢測到衝突: ${drivePage.id}`)

                // 1. 創建衝突副本（保存本地修改）
                const conflictId = `${localPage.id}_conflict_${Date.now()}`
                const conflictPage: Page = {
                  ...localPage,
                  id: conflictId,
                  name: `${localPage.name} (衝突副本 ${new Date().toLocaleString('zh-TW', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })})`,
                }
                await db.createPage(conflictPage)
                result.conflicts++
                console.log(`  📋 建立衝突副本: ${conflictPage.name}`)

                // 2. 更新本地為 Drive 版本
                await db.updatePage({
                  ...localPage,
                  content: driveContentText,
                  name: drivePage.name,
                  updatedAt: drivePage.updatedAt,
                })
                result.pagesDownloaded++
                console.log(`  ✅ 已更新為 Drive 版本`)
              } else {
                // 不是衝突，只是 Drive 版本更新，直接下載
                await db.updatePage({
                  ...localPage,
                  content: driveContentText,
                  name: drivePage.name,
                  updatedAt: drivePage.updatedAt,
                })
                result.pagesDownloaded++
                console.log(`  更新 page content: ${drivePage.id}`)
              }
            }
          } else {
            // 本地版本更新，不需要下載（已在上傳階段處理）
            console.log(`  本地版本較新，跳過下載: ${drivePage.id}`)
          }
        }
      }
    }
  }

  // ==================== 強制上傳/下載 ====================

  /**
   * 強制上傳全部到雲端（全部取代 Drive）
   * @param accessToken Google access token
   * @param onProgress 進度回調 (current, total, message)
   */
  async forceUploadAll(
    accessToken: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    try {
      await this.initialize(accessToken)

      // 1. 獲取本地數據
      const folders = await db.getAllFolders()
      const pages = await db.getAllPages()
      const deletedFolders = await db.getAllDeletedFolders()
      const deletedPages = await db.getAllDeletedPages()

      // 正確計算總步驟數：4個JSON文件 + 每個page的內容
      const totalSteps = 4 + pages.length
      let currentStep = 0

      // 2. 上傳 folders.json
      onProgress?.(++currentStep, totalSteps, `上傳 folders.json (${folders.length} 個)`)
      const foldersJson = serializeFolders(folders)
      await this.driveService!.uploadFoldersJson(JSON.stringify(foldersJson, null, 2))

      // 3. 上傳 pages.json
      onProgress?.(++currentStep, totalSteps, `上傳 pages.json (${pages.length} 個)`)
      const pagesJson = await serializePages(pages)
      await this.driveService!.uploadPagesJson(JSON.stringify(pagesJson, null, 2))

      // 4. 上傳 deletedFolders.json
      onProgress?.(++currentStep, totalSteps, `上傳 deletedFolders.json (${deletedFolders.length} 個)`)
      const deletedFoldersJson = serializeDeletedFolders(deletedFolders)
      await this.driveService!.uploadDeletedFoldersJson(JSON.stringify(deletedFoldersJson, null, 2))

      // 5. 上傳 deletedPages.json
      onProgress?.(++currentStep, totalSteps, `上傳 deletedPages.json (${deletedPages.length} 個)`)
      const deletedPagesJson = serializeDeletedPages(deletedPages)
      await this.driveService!.uploadDeletedPagesJson(JSON.stringify(deletedPagesJson, null, 2))

      // 6. 上傳每個 page 的內容
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        onProgress?.(++currentStep, totalSteps, `上傳 page: ${page.name} (${i + 1}/${pages.length})`)
        await this.driveService!.uploadPageContent(page.id, serializePageContent(page))
      }

      onProgress?.(totalSteps, totalSteps, '✅ 上傳完成！')
      return { success: true, errors }

    } catch (error: any) {
      errors.push(error.message || String(error))
      return { success: false, errors }
    }
  }

  /**
   * 強制從雲端下載全部（全部取代本地）
   * @param accessToken Google access token
   * @param onProgress 進度回調 (current, total, message)
   */
  async forceDownloadAll(
    accessToken: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []

    try {
      await this.initialize(accessToken)

      // 先下載 metadata 以計算總步驟數
      const foldersJson = await this.driveService!.downloadFoldersJson()
      if (!foldersJson) throw new Error('Drive 上沒有 folders.json')

      const pagesJson = await this.driveService!.downloadPagesJson()
      if (!pagesJson) throw new Error('Drive 上沒有 pages.json')

      const foldersFile = deserializeFolders(foldersJson)
      const pagesFile = deserializePages(pagesJson)

      const folders = foldersFile.folders
      const pages = pagesFile.pages

      // 正確計算總步驟數：清空本地 + 下載folders + 下載pages + 下載刪除記錄
      const totalSteps = 1 + folders.length + pages.length + 1
      let currentStep = 0

      // 1. 清空本地數據
      onProgress?.(++currentStep, totalSteps, '清空本地數據...')
      const allFolders = await db.getAllFolders()
      const allPages = await db.getAllPages()

      for (const folder of allFolders) {
        await db.silentDeleteFolder(folder.id)
      }
      for (const page of allPages) {
        await db.silentDeletePage(page.id)
      }
      await db.clearDeletedFolders()
      await db.clearDeletedPages()

      // 2. 下載 folders
      for (let i = 0; i < folders.length; i++) {
        const folder = folders[i]
        onProgress?.(++currentStep, totalSteps, `下載 folder: ${folder.name} (${i + 1}/${folders.length})`)
        await db.createFolder(folder)
      }

      // 3. 下載 pages 內容
      for (let i = 0; i < pages.length; i++) {
        const pageMeta = pages[i]
        onProgress?.(++currentStep, totalSteps, `下載 page: ${pageMeta.name} (${i + 1}/${pages.length})`)

        const content = await this.driveService!.downloadPageContent(pageMeta.id)
        if (content) {
          const newPage: Page = {
            id: pageMeta.id,
            name: pageMeta.name,
            folderId: pageMeta.folderId,
            content: deserializePageContent(content),
            createdAt: pageMeta.createdAt,
            updatedAt: pageMeta.updatedAt,
          }
          await db.createPage(newPage)
        }
      }

      // 4. 下載刪除記錄
      onProgress?.(++currentStep, totalSteps, '下載刪除記錄...')

      const deletedFoldersJson = await this.driveService!.downloadDeletedFoldersJson()
      if (deletedFoldersJson) {
        const deletedFoldersFile = deserializeDeletedFolders(deletedFoldersJson)
        for (const deleted of deletedFoldersFile.deleted) {
          await db.addDeletedFolder(deleted.folderId, deleted.deletedAt)
        }
      }

      const deletedPagesJson = await this.driveService!.downloadDeletedPagesJson()
      if (deletedPagesJson) {
        const deletedPagesFile = deserializeDeletedPages(deletedPagesJson)
        for (const deleted of deletedPagesFile.deleted) {
          await db.addDeletedPage(deleted.pageId, deleted.deletedAt)
        }
      }

      onProgress?.(totalSteps, totalSteps, '✅ 下載完成！')
      return { success: true, errors }

    } catch (error: any) {
      errors.push(error.message || String(error))
      return { success: false, errors }
    }
  }
}

// 導出單例
export const syncManagerV2 = new SyncManagerV2()
