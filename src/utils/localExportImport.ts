/**
 * 本地完整匯出/匯入功能
 * 格式與 Google Drive 相同：ppage-app 文件夾結構
 */

import JSZip from 'jszip'
import { db } from '../services/db'
import {
  serializeFolders,
  deserializeFolders,
  serializePages,
  deserializePages,
  serializeDeletedFolders,
  deserializeDeletedFolders,
  serializeDeletedPages,
  deserializeDeletedPages,
  serializePageContent,
  deserializePageContent,
} from '../services/syncV2/serializer'

/**
 * 匯出全部到本地（ZIP 文件）
 * 格式與 Google Drive 相同
 */
export async function exportAllToLocal(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<void> {
  try {
    // 1. 獲取所有數據
    const folders = await db.getAllFolders()
    const pages = await db.getAllPages()
    const deletedFolders = await db.getAllDeletedFolders()
    const deletedPages = await db.getAllDeletedPages()

    const totalSteps = 4 + pages.length + 1
    let currentStep = 0

    // 2. 創建 ZIP 文件
    const zip = new JSZip()
    const ppageAppFolder = zip.folder('ppage-app')!
    const pagesFolder = ppageAppFolder.folder('pages')!

    // 3. 添加 folders.json
    onProgress?.(++currentStep, totalSteps, '打包 folders.json...')
    const foldersJson = serializeFolders(folders)
    ppageAppFolder.file('folders.json', JSON.stringify(foldersJson, null, 2))

    // 4. 添加 pages.json
    onProgress?.(++currentStep, totalSteps, '打包 pages.json...')
    const pagesJson = await serializePages(pages)
    ppageAppFolder.file('pages.json', JSON.stringify(pagesJson, null, 2))

    // 5. 添加 deletedFolders.json
    onProgress?.(++currentStep, totalSteps, '打包 deletedFolders.json...')
    const deletedFoldersJson = serializeDeletedFolders(deletedFolders)
    ppageAppFolder.file('deletedFolders.json', JSON.stringify(deletedFoldersJson, null, 2))

    // 6. 添加 deletedPages.json
    onProgress?.(++currentStep, totalSteps, '打包 deletedPages.json...')
    const deletedPagesJson = serializeDeletedPages(deletedPages)
    ppageAppFolder.file('deletedPages.json', JSON.stringify(deletedPagesJson, null, 2))

    // 7. 添加每個 page 的內容
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      onProgress?.(++currentStep, totalSteps, `打包 page: ${page.name} (${i + 1}/${pages.length})`)
      const content = serializePageContent(page)
      pagesFolder.file(`page-${page.id}.md`, content)
    }

    // 8. 生成 ZIP 文件
    onProgress?.(++currentStep, totalSteps, '生成 ZIP 文件...')
    const blob = await zip.generateAsync({ type: 'blob' })

    // 9. 下載文件
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ppage-backup-${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    onProgress?.(totalSteps, totalSteps, '✅ 匯出完成！')
  } catch (error) {
    console.error('Export to local failed:', error)
    throw error
  }
}

/**
 * 從本地匯入全部（ZIP 文件）
 * 格式與 Google Drive 相同
 */
export async function importAllFromLocal(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // 創建文件選擇器
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'

    input.onchange = async (e) => {
      try {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) {
          reject(new Error('未選擇文件'))
          return
        }

        onProgress?.(0, 100, '讀取 ZIP 文件...')

        // 解析 ZIP 文件
        const zip = await JSZip.loadAsync(file)

        // 檢查是否有 ppage-app 文件夾
        const ppageAppFolder = zip.folder('ppage-app')
        if (!ppageAppFolder) {
          reject(new Error('無效的備份文件：缺少 ppage-app 文件夾'))
          return
        }

        // 讀取 JSON 文件
        onProgress?.(10, 100, '讀取 metadata...')

        const foldersJsonFile = ppageAppFolder.file('folders.json')
        const pagesJsonFile = ppageAppFolder.file('pages.json')

        if (!foldersJsonFile || !pagesJsonFile) {
          reject(new Error('無效的備份文件：缺少必要的 JSON 文件'))
          return
        }

        const foldersJsonText = await foldersJsonFile.async('text')
        const pagesJsonText = await pagesJsonFile.async('text')

        const foldersFile = deserializeFolders(foldersJsonText)
        const pagesFile = deserializePages(pagesJsonText)

        const folders = foldersFile.folders
        const pages = pagesFile.pages

        // 讀取 page 內容文件
        const pagesFolder = ppageAppFolder.folder('pages')
        if (!pagesFolder) {
          reject(new Error('無效的備份文件：缺少 pages 文件夾'))
          return
        }

        // 獲取所有 page 文件
        const pageFiles: { [pageId: string]: JSZip.JSZipObject } = {}
        pagesFolder.forEach((relativePath, file) => {
          if (relativePath.endsWith('.md')) {
            const pageId = relativePath.replace('page-', '').replace('.md', '')
            pageFiles[pageId] = file
          }
        })

        // 計算總步驟數
        const totalSteps = 1 + folders.length + pages.length + 1
        let currentStep = 0

        // 清空本地數據
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

        // 匯入 folders
        for (let i = 0; i < folders.length; i++) {
          const folder = folders[i]
          onProgress?.(++currentStep, totalSteps, `匯入 folder: ${folder.name} (${i + 1}/${folders.length})`)
          await db.createFolder(folder)
        }

        // 匯入 pages
        for (let i = 0; i < pages.length; i++) {
          const pageMeta = pages[i]
          onProgress?.(++currentStep, totalSteps, `匯入 page: ${pageMeta.name} (${i + 1}/${pages.length})`)

          const pageFile = pageFiles[pageMeta.id]
          if (pageFile) {
            const content = await pageFile.async('text')
            const pageContent = deserializePageContent(content)

            await db.createPage({
              id: pageMeta.id,
              name: pageMeta.name,
              folderId: pageMeta.folderId,
              content: pageContent,
              createdAt: pageMeta.createdAt,
              updatedAt: pageMeta.updatedAt,
            })
          } else {
            console.warn(`Missing page content file for ${pageMeta.id}`)
          }
        }

        // 匯入刪除記錄
        onProgress?.(++currentStep, totalSteps, '匯入刪除記錄...')

        const deletedFoldersJsonFile = ppageAppFolder.file('deletedFolders.json')
        if (deletedFoldersJsonFile) {
          const deletedFoldersJsonText = await deletedFoldersJsonFile.async('text')
          const deletedFoldersFile = deserializeDeletedFolders(deletedFoldersJsonText)
          for (const deleted of deletedFoldersFile.deleted) {
            await db.addDeletedFolder(deleted.folderId, deleted.deletedAt)
          }
        }

        const deletedPagesJsonFile = ppageAppFolder.file('deletedPages.json')
        if (deletedPagesJsonFile) {
          const deletedPagesJsonText = await deletedPagesJsonFile.async('text')
          const deletedPagesFile = deserializeDeletedPages(deletedPagesJsonText)
          for (const deleted of deletedPagesFile.deleted) {
            await db.addDeletedPage(deleted.pageId, deleted.deletedAt)
          }
        }

        onProgress?.(totalSteps, totalSteps, '✅ 匯入完成！')
        resolve()
      } catch (error) {
        console.error('Import from local failed:', error)
        reject(error)
      }
    }

    input.click()
  })
}
