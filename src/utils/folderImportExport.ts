/**
 * Folder 匯出/匯入工具
 * 支持將 folder tree 及其所有 pages 匯出為 JSON 文件
 * 並支持從 JSON 文件匯入到指定 folder
 */

import { db, Folder, Page } from '../services/db'

/**
 * 匯出數據格式
 */
export interface FolderExportData {
  version: string
  exportDate: number
  folderName: string
  rootFolderId: string
  folders: Folder[]
  pages: Page[]
}

/**
 * 遞迴收集指定 folder 及其所有子 folders
 */
const collectFoldersRecursive = async (
  folderId: string,
  allFolders: Folder[]
): Promise<Folder[]> => {
  const result: Folder[] = []

  // 找到當前 folder 的所有子 folders
  const childFolders = allFolders.filter(f => f.parentId === folderId)

  for (const folder of childFolders) {
    result.push(folder)
    // 遞迴收集子 folder 的子 folders
    const subFolders = await collectFoldersRecursive(folder.id, allFolders)
    result.push(...subFolders)
  }

  return result
}

/**
 * 匯出指定 folder 及其所有子 folders 和 pages
 */
export const exportFolder = async (folderId: string): Promise<void> => {
  try {
    // 獲取目標 folder
    const targetFolder = await db.getFolder(folderId)
    if (!targetFolder) {
      throw new Error('找不到指定的 folder')
    }

    // 獲取所有 folders（用於遞迴查找）
    const allFolders = await db.getAllFolders()

    // 收集目標 folder 及其所有子 folders
    const folders: Folder[] = [targetFolder]
    const subFolders = await collectFoldersRecursive(folderId, allFolders)
    folders.push(...subFolders)

    // 收集所有 folder IDs
    const folderIds = folders.map(f => f.id)

    // 收集所有相關的 pages
    const allPages = await db.getAllPages()
    const pages = allPages.filter(p => folderIds.includes(p.folderId))

    // 創建匯出數據
    const exportData: FolderExportData = {
      version: '1.0',
      exportDate: Date.now(),
      folderName: targetFolder.name,
      rootFolderId: folderId,
      folders,
      pages,
    }

    // 生成文件名（使用 folder 名稱 + 時間戳）
    const timestamp = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const fileName = `${targetFolder.name}_${timestamp}.json`

    // 創建 Blob 並下載
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('匯出失敗:', error)
    throw error
  }
}

/**
 * 匯入 folder 數據到指定的 parent folder
 * @param file 匯入的 JSON 文件
 * @param parentFolderId 目標 parent folder ID（通常是 Recycle）
 */
export const importFolder = async (
  file: File,
  parentFolderId: string
): Promise<void> => {
  try {
    // 讀取文件內容
    const content = await file.text()
    const data: FolderExportData = JSON.parse(content)

    // 驗證格式
    if (!data.version || !data.folders || !data.pages) {
      throw new Error('文件格式不正確')
    }

    if (data.version !== '1.0') {
      throw new Error(`不支持的版本: ${data.version}`)
    }

    // 創建 ID 映射（舊 ID -> 新 ID）
    const folderIdMap = new Map<string, string>()
    const pageIdMap = new Map<string, string>()

    // 匯入 folders（按層級順序）
    // 構建層級結構並排序
    const buildHierarchy = (folderId: string): Folder[] => {
      const result: Folder[] = []
      const folder = data.folders.find(f => f.id === folderId)
      if (folder) {
        result.push(folder)
        // 找到所有直接子 folders
        const children = data.folders.filter(f => f.parentId === folderId)
        // 遞迴處理每個子 folder
        for (const child of children) {
          result.push(...buildHierarchy(child.id))
        }
      }
      return result
    }

    // 從根 folder 開始構建層級排序
    const sortedFolders = buildHierarchy(data.rootFolderId)

    // 創建 folders
    for (const folder of sortedFolders) {
      const newId = `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      folderIdMap.set(folder.id, newId)

      // 確定新的 parent ID
      let newParentId: string | null
      if (folder.id === data.rootFolderId) {
        // 根 folder 的 parent 是目標 parent folder
        newParentId = parentFolderId
      } else if (folder.parentId === data.rootFolderId) {
        // 原本是根 folder 的直接子 folder
        newParentId = folderIdMap.get(data.rootFolderId) || null
      } else {
        // 使用映射的新 parent ID
        newParentId = folder.parentId ? (folderIdMap.get(folder.parentId) || null) : null
      }

      const newFolder: Folder = {
        ...folder,
        id: newId,
        parentId: newParentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await db.createFolder(newFolder)
    }

    // 匯入 pages
    for (const page of data.pages) {
      const newId = `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      pageIdMap.set(page.id, newId)

      const newFolderId = folderIdMap.get(page.folderId)
      if (!newFolderId) {
        console.warn(`跳過 page ${page.name}：找不到對應的 folder`)
        continue
      }

      const newPage: Page = {
        ...page,
        id: newId,
        folderId: newFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await db.createPage(newPage)
    }
  } catch (error) {
    console.error('匯入失敗:', error)
    throw error
  }
}

/**
 * 選擇文件並匯入
 */
export const selectAndImportFolder = (
  parentFolderId: string,
  onSuccess?: () => void,
  onError?: (error: Error) => void
): void => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      await importFolder(file, parentFolderId)
      if (onSuccess) onSuccess()
    } catch (error) {
      if (onError) onError(error as Error)
    }
  }
  input.click()
}
