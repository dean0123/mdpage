/**
 * Google Drive V2 API 操作
 * 處理 folders.json, pages.json, page-*.md 等文件
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'

// V2 使用固定的應用文件夾名稱
const APP_FOLDER_NAME = 'ppage-app'

/**
 * Drive 文件元數據
 */
export interface DriveFileMetadata {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
}

/**
 * 獲取或創建應用文件夾
 */
async function getOrCreateAppFolder(accessToken: string): Promise<string> {
  // 搜索是否已存在
  const searchUrl = `${DRIVE_API_BASE}/files?q=name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const searchResponse = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!searchResponse.ok) {
    throw new Error(`Failed to search app folder: ${searchResponse.statusText}`)
  }

  const searchData = await searchResponse.json()

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id
  }

  // 不存在，創建
  const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })

  if (!createResponse.ok) {
    throw new Error(`Failed to create app folder: ${createResponse.statusText}`)
  }

  const createData = await createResponse.json()
  return createData.id
}

/**
 * 獲取或創建 pages 子文件夾
 */
async function getOrCreatePagesFolder(accessToken: string, appFolderId: string): Promise<string> {
  // 搜索是否已存在
  const searchUrl = `${DRIVE_API_BASE}/files?q=name='pages' and '${appFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const searchResponse = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!searchResponse.ok) {
    throw new Error(`Failed to search pages folder: ${searchResponse.statusText}`)
  }

  const searchData = await searchResponse.json()

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id
  }

  // 不存在，創建
  const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'pages',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [appFolderId],
    }),
  })

  if (!createResponse.ok) {
    throw new Error(`Failed to create pages folder: ${createResponse.statusText}`)
  }

  const createData = await createResponse.json()
  return createData.id
}

/**
 * 上傳或更新文件
 */
async function uploadOrUpdateFile(
  accessToken: string,
  fileName: string,
  content: string,
  parentFolderId: string,
  mimeType: string = 'application/json'
): Promise<string> {
  // 先檢查文件是否存在
  const searchUrl = `${DRIVE_API_BASE}/files?q=name='${fileName}' and '${parentFolderId}' in parents and trashed=false`

  const searchResponse = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!searchResponse.ok) {
    throw new Error(`Failed to search file ${fileName}: ${searchResponse.statusText}`)
  }

  const searchData = await searchResponse.json()
  const existingFileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null

  const blob = new Blob([content], { type: mimeType })

  if (existingFileId) {
    // 更新現有文件
    const updateUrl = `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=media`

    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: blob,
    })

    if (!updateResponse.ok) {
      throw new Error(`Failed to update file ${fileName}: ${updateResponse.statusText}`)
    }

    return existingFileId
  } else {
    // 創建新文件（multipart upload）
    const metadata = {
      name: fileName,
      parents: [parentFolderId],
    }

    const boundary = '-------314159265358979323846'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter

    const createUrl = `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`

    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(`Failed to create file ${fileName}: ${createResponse.statusText} - ${errorText}`)
    }

    const createData = await createResponse.json()
    return createData.id
  }
}

/**
 * 下載文件內容
 */
async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const downloadUrl = `${DRIVE_API_BASE}/files/${fileId}?alt=media`

  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download file ${fileId}: ${response.statusText}`)
  }

  return await response.text()
}

/**
 * 列出文件夾中的所有文件
 */
async function listFilesInFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFileMetadata[]> {
  const listUrl = `${DRIVE_API_BASE}/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime)`

  const response = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to list files in folder ${folderId}: ${response.statusText}`)
  }

  const data = await response.json()
  return data.files || []
}

/**
 * 刪除文件
 */
async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const deleteUrl = `${DRIVE_API_BASE}/files/${fileId}`

  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to delete file ${fileId}: ${response.statusText}`)
  }
}

// ==================== 導出的公共 API ====================

/**
 * DriveV2 服務類
 */
export class DriveV2Service {
  private accessToken: string
  private appFolderId: string | null = null
  private pagesFolderId: string | null = null

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  /**
   * 初始化（獲取或創建文件夾）
   */
  async initialize(): Promise<void> {
    this.appFolderId = await getOrCreateAppFolder(this.accessToken)
    this.pagesFolderId = await getOrCreatePagesFolder(this.accessToken, this.appFolderId)
  }

  private ensureInitialized(): void {
    if (!this.appFolderId || !this.pagesFolderId) {
      throw new Error('DriveV2Service not initialized. Call initialize() first.')
    }
  }

  // ==================== Folders 操作 ====================

  async uploadFoldersJson(content: string): Promise<void> {
    this.ensureInitialized()
    await uploadOrUpdateFile(
      this.accessToken,
      'folders.json',
      content,
      this.appFolderId!,
      'application/json'
    )
  }

  async downloadFoldersJson(): Promise<string | null> {
    this.ensureInitialized()
    try {
      const files = await listFilesInFolder(this.accessToken, this.appFolderId!)
      const foldersFile = files.find(f => f.name === 'folders.json')
      if (!foldersFile) return null
      return await downloadFile(this.accessToken, foldersFile.id)
    } catch (error) {
      console.error('Failed to download folders.json:', error)
      return null
    }
  }

  // ==================== DeletedFolders 操作 ====================

  async uploadDeletedFoldersJson(content: string): Promise<void> {
    this.ensureInitialized()
    await uploadOrUpdateFile(
      this.accessToken,
      'deletedFolders.json',
      content,
      this.appFolderId!,
      'application/json'
    )
  }

  async downloadDeletedFoldersJson(): Promise<string | null> {
    this.ensureInitialized()
    try {
      const files = await listFilesInFolder(this.accessToken, this.appFolderId!)
      const file = files.find(f => f.name === 'deletedFolders.json')
      if (!file) return null
      return await downloadFile(this.accessToken, file.id)
    } catch (error) {
      console.error('Failed to download deletedFolders.json:', error)
      return null
    }
  }

  // ==================== Pages 操作 ====================

  async uploadPagesJson(content: string): Promise<void> {
    this.ensureInitialized()
    await uploadOrUpdateFile(
      this.accessToken,
      'pages.json',
      content,
      this.appFolderId!,
      'application/json'
    )
  }

  async downloadPagesJson(): Promise<string | null> {
    this.ensureInitialized()
    try {
      const files = await listFilesInFolder(this.accessToken, this.appFolderId!)
      const pagesFile = files.find(f => f.name === 'pages.json')
      if (!pagesFile) return null
      return await downloadFile(this.accessToken, pagesFile.id)
    } catch (error) {
      console.error('Failed to download pages.json:', error)
      return null
    }
  }

  // ==================== DeletedPages 操作 ====================

  async uploadDeletedPagesJson(content: string): Promise<void> {
    this.ensureInitialized()
    await uploadOrUpdateFile(
      this.accessToken,
      'deletedPages.json',
      content,
      this.appFolderId!,
      'application/json'
    )
  }

  async downloadDeletedPagesJson(): Promise<string | null> {
    this.ensureInitialized()
    try {
      const files = await listFilesInFolder(this.accessToken, this.appFolderId!)
      const file = files.find(f => f.name === 'deletedPages.json')
      if (!file) return null
      return await downloadFile(this.accessToken, file.id)
    } catch (error) {
      console.error('Failed to download deletedPages.json:', error)
      return null
    }
  }

  // ==================== Page Content 操作 ====================

  async uploadPageContent(pageId: string, content: string): Promise<void> {
    this.ensureInitialized()
    const fileName = `page-${pageId}.md`
    await uploadOrUpdateFile(
      this.accessToken,
      fileName,
      content,
      this.pagesFolderId!,
      'text/markdown'
    )
  }

  async downloadPageContent(pageId: string): Promise<string | null> {
    this.ensureInitialized()
    try {
      const files = await listFilesInFolder(this.accessToken, this.pagesFolderId!)
      const fileName = `page-${pageId}.md`
      const pageFile = files.find(f => f.name === fileName)
      if (!pageFile) return null
      return await downloadFile(this.accessToken, pageFile.id)
    } catch (error) {
      console.error(`Failed to download page ${pageId}:`, error)
      return null
    }
  }

  async deletePageContent(pageId: string): Promise<void> {
    this.ensureInitialized()
    try {
      const files = await listFilesInFolder(this.accessToken, this.pagesFolderId!)
      const fileName = `page-${pageId}.md`
      const pageFile = files.find(f => f.name === fileName)
      if (pageFile) {
        await deleteFile(this.accessToken, pageFile.id)
      }
    } catch (error) {
      console.error(`Failed to delete page ${pageId}:`, error)
    }
  }

  // ==================== 批量操作 ====================

  async listAllPageFiles(): Promise<DriveFileMetadata[]> {
    this.ensureInitialized()
    return await listFilesInFolder(this.accessToken, this.pagesFolderId!)
  }

  /**
   * 清理所有 V2 數據（用於測試）
   */
  async clearAllData(): Promise<void> {
    this.ensureInitialized()

    console.log('🗑️  開始清理所有 V2 數據...')

    // 刪除所有 JSON 文件
    console.log('刪除 JSON 文件...')
    const appFiles = await listFilesInFolder(this.accessToken, this.appFolderId!)
    console.log(`  找到 ${appFiles.length} 個文件在 app 文件夾中`)

    for (const file of appFiles) {
      if (file.name.endsWith('.json')) {
        console.log(`  刪除: ${file.name}`)
        try {
          await deleteFile(this.accessToken, file.id)
        } catch (error) {
          console.error(`  刪除失敗: ${file.name}`, error)
          throw error
        }
      }
    }

    // 刪除所有 page 文件
    console.log('刪除 pages/ 文件夾中的文件...')
    const pageFiles = await listFilesInFolder(this.accessToken, this.pagesFolderId!)
    console.log(`  找到 ${pageFiles.length} 個文件在 pages/ 文件夾中`)

    for (const file of pageFiles) {
      console.log(`  刪除: ${file.name}`)
      try {
        await deleteFile(this.accessToken, file.id)
      } catch (error) {
        console.error(`  刪除失敗: ${file.name}`, error)
        throw error
      }
    }

    console.log('✅ 清理完成')
  }
}
