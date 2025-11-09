/**
 * Recycle Bin (回收站) 管理工具
 * 用於管理被刪除或匯入的 folders 和 pages
 */

import { db, Folder } from './db'

export const RECYCLE_FOLDER_ID = 'recycle-bin'
export const RECYCLE_FOLDER_NAME = 'Recycle'

/**
 * 確保 Recycle folder 存在
 * 如果不存在則創建，如果存在則返回
 */
export const ensureRecycleFolderExists = async (): Promise<Folder> => {
  try {
    // 檢查 Recycle folder 是否存在
    const existingRecycle = await db.getFolder(RECYCLE_FOLDER_ID)

    if (existingRecycle) {
      return existingRecycle
    }

    // 創建 Recycle folder
    const recycleFolder: Folder = {
      id: RECYCLE_FOLDER_ID,
      name: RECYCLE_FOLDER_NAME,
      parentId: null, // 根目錄
      order: 9999, // 排在最後
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await db.createFolder(recycleFolder)
    console.log('✅ 創建 Recycle folder 成功')

    return recycleFolder
  } catch (error) {
    console.error('❌ 創建 Recycle folder 失敗:', error)
    throw error
  }
}

/**
 * 檢查 folder 是否為 Recycle 或其子 folder
 */
export const isRecycleFolderOrChild = async (folderId: string): Promise<boolean> => {
  if (folderId === RECYCLE_FOLDER_ID) {
    return true
  }

  try {
    const folder = await db.getFolder(folderId)
    if (!folder) return false

    // 遞迴檢查 parent
    if (folder.parentId === RECYCLE_FOLDER_ID) {
      return true
    }

    if (folder.parentId) {
      return await isRecycleFolderOrChild(folder.parentId)
    }

    return false
  } catch (error) {
    console.error('檢查 Recycle folder 時發生錯誤:', error)
    return false
  }
}

/**
 * 遞迴刪除 folder 及其所有子 folders 和 pages（不檢查是否為空）
 */
export const deleteFolderRecursive = async (folderId: string): Promise<void> => {
  try {
    // 獲取所有子 folders
    const childFolders = await db.getFoldersByParent(folderId)

    // 遞迴刪除所有子 folders
    for (const child of childFolders) {
      await deleteFolderRecursive(child.id)
    }

    // 刪除該 folder 下的所有 pages
    await db.deletePagesByFolder(folderId)

    // 刪除 folder 本身
    await db.deleteFolder(folderId)

    console.log(`✅ 刪除 folder ${folderId} 成功`)
  } catch (error) {
    console.error(`❌ 刪除 folder ${folderId} 失敗:`, error)
    throw error
  }
}
