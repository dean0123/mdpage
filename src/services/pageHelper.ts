// 页面和文件夹辅助函数

import { db, Folder, Page } from './db'

/**
 * 确保有 folder 和 page 可以编辑
 * 如果 folder list 为空，自动创建「新資料夾」和「新頁面」
 * @returns { folder, page } 创建或选择的 folder 和新创建的 page
 */
export async function ensureFolderAndPage(): Promise<{ folder: Folder; page: Page }> {
  // 1. 检查是否有任何 folder
  const allFolders = await db.getAllFolders()

  let targetFolder: Folder

  // 2. 如果没有 folder，创建「新資料夾」
  if (allFolders.length === 0) {
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: '新資料夾',
      parentId: null,
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await db.createFolder(newFolder)
    targetFolder = newFolder
  } else {
    // 如果有 folder，使用第一个
    targetFolder = allFolders.sort((a, b) => a.order - b.order)[0]
  }

  // 3. 在这个 folder 下创建「新頁面」
  const newPage: Page = {
    id: `page-${Date.now()}`,
    folderId: targetFolder.id,
    name: '新頁面',
    content: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await db.createPage(newPage)

  // 4. 返回 folder 和 page
  return { folder: targetFolder, page: newPage }
}
