// IndexedDB 服務

export interface Folder {
  id: string
  name: string
  parentId: string | null // null 表示根目錄
  order: number // 用於排序
  createdAt: number
  updatedAt: number
  // Google Drive 同步欄位（可選，向後兼容）
  driveFileId?: string // Drive 上對應的文件 ID
  lastSyncedAt?: number // 上次同步時間戳
}

export interface Page {
  id: string
  folderId: string
  name: string
  content: string // Markdown 內容
  createdAt: number
  updatedAt: number
  // 編輯狀態（可選，向後兼容舊數據）
  editorState?: {
    cursorPosition: number  // 光標位置
    scrollTop: number       // 滾動位置
  }
}

export interface DeletedFolder {
  folderId: string
  deletedAt: number
}

export interface DeletedPage {
  pageId: string
  deletedAt: number
}

const DB_NAME = 'MarkdownEditorDB'
const DB_VERSION = 2  // V2: 添加刪除追蹤
const FOLDER_STORE = 'folders'
const PAGE_STORE = 'pages'
const DELETED_FOLDERS_STORE = 'deletedFolders'
const DELETED_PAGES_STORE = 'deletedPages'

class DatabaseService {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 創建 Folder 存儲
        if (!db.objectStoreNames.contains(FOLDER_STORE)) {
          const folderStore = db.createObjectStore(FOLDER_STORE, { keyPath: 'id' })
          folderStore.createIndex('parentId', 'parentId', { unique: false })
        }

        // 創建 Page 存儲
        if (!db.objectStoreNames.contains(PAGE_STORE)) {
          const pageStore = db.createObjectStore(PAGE_STORE, { keyPath: 'id' })
          pageStore.createIndex('folderId', 'folderId', { unique: false })
        }

        // V2: 創建刪除追蹤存儲
        if (!db.objectStoreNames.contains(DELETED_FOLDERS_STORE)) {
          db.createObjectStore(DELETED_FOLDERS_STORE, { keyPath: 'folderId' })
        }

        if (!db.objectStoreNames.contains(DELETED_PAGES_STORE)) {
          db.createObjectStore(DELETED_PAGES_STORE, { keyPath: 'pageId' })
        }
      }
    })
  }

  // ===== Folder 操作 =====

  async createFolder(folder: Folder): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([FOLDER_STORE], 'readwrite')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.add(folder)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async updateFolder(folder: Folder): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([FOLDER_STORE], 'readwrite')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.put(folder)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteFolder(id: string): Promise<void> {
    // 先記錄刪除（如果失敗，跳過）
    try {
      await this.addDeletedFolder(id)
    } catch (error) {
      console.warn('Failed to record deleted folder (DB not upgraded?), continuing with delete:', error)
    }

    // 再刪除 folder
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([FOLDER_STORE], 'readwrite')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 靜默刪除 folder（不記錄刪除記錄）
   * 用於同步邏輯：從 Drive 下載刪除記錄後執行刪除
   */
  async silentDeleteFolder(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([FOLDER_STORE], 'readwrite')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([FOLDER_STORE], 'readonly')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllFolders(): Promise<Folder[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([FOLDER_STORE], 'readonly')
      const store = transaction.objectStore(FOLDER_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getFoldersByParent(parentId: string | null): Promise<Folder[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([FOLDER_STORE], 'readonly')
      const store = transaction.objectStore(FOLDER_STORE)
      const index = store.index('parentId')
      const request = index.getAll(parentId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // ===== Page 操作 =====

  async createPage(page: Page): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([PAGE_STORE], 'readwrite')
      const store = transaction.objectStore(PAGE_STORE)
      const request = store.add(page)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async updatePage(page: Page): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([PAGE_STORE], 'readwrite')
      const store = transaction.objectStore(PAGE_STORE)
      const request = store.put(page)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deletePage(id: string): Promise<void> {
    // 先記錄刪除（如果失敗，跳過）
    try {
      await this.addDeletedPage(id)
    } catch (error) {
      console.warn('Failed to record deleted page (DB not upgraded?), continuing with delete:', error)
    }

    // 再刪除 page
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([PAGE_STORE], 'readwrite')
      const store = transaction.objectStore(PAGE_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 靜默刪除 page（不記錄刪除記錄）
   * 用於同步邏輯：從 Drive 下載刪除記錄後執行刪除
   */
  async silentDeletePage(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([PAGE_STORE], 'readwrite')
      const store = transaction.objectStore(PAGE_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getPage(id: string): Promise<Page | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([PAGE_STORE], 'readonly')
      const store = transaction.objectStore(PAGE_STORE)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getPagesByFolder(folderId: string): Promise<Page[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([PAGE_STORE], 'readonly')
      const store = transaction.objectStore(PAGE_STORE)
      const index = store.index('folderId')
      const request = index.getAll(folderId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllPages(): Promise<Page[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([PAGE_STORE], 'readonly')
      const store = transaction.objectStore(PAGE_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async deletePagesByFolder(folderId: string): Promise<void> {
    const pages = await this.getPagesByFolder(folderId)
    const deletePromises = pages.map(page => this.deletePage(page.id))
    await Promise.all(deletePromises)
  }

  // ===== DeletedFolder 操作 =====

  async addDeletedFolder(folderId: string, deletedAt?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_FOLDERS_STORE], 'readwrite')
      const store = transaction.objectStore(DELETED_FOLDERS_STORE)
      const deletedFolder: DeletedFolder = {
        folderId,
        deletedAt: deletedAt ?? Date.now()
      }
      const request = store.put(deletedFolder)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async removeDeletedFolder(folderId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_FOLDERS_STORE], 'readwrite')
      const store = transaction.objectStore(DELETED_FOLDERS_STORE)
      const request = store.delete(folderId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getAllDeletedFolders(): Promise<DeletedFolder[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_FOLDERS_STORE], 'readonly')
      const store = transaction.objectStore(DELETED_FOLDERS_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async clearDeletedFolders(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_FOLDERS_STORE], 'readwrite')
      const store = transaction.objectStore(DELETED_FOLDERS_STORE)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // ===== DeletedPage 操作 =====

  async addDeletedPage(pageId: string, deletedAt?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_PAGES_STORE], 'readwrite')
      const store = transaction.objectStore(DELETED_PAGES_STORE)
      const deletedPage: DeletedPage = {
        pageId,
        deletedAt: deletedAt ?? Date.now()
      }
      const request = store.put(deletedPage)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async removeDeletedPage(pageId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_PAGES_STORE], 'readwrite')
      const store = transaction.objectStore(DELETED_PAGES_STORE)
      const request = store.delete(pageId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getAllDeletedPages(): Promise<DeletedPage[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_PAGES_STORE], 'readonly')
      const store = transaction.objectStore(DELETED_PAGES_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async clearDeletedPages(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'))

      const transaction = this.db.transaction([DELETED_PAGES_STORE], 'readwrite')
      const store = transaction.objectStore(DELETED_PAGES_STORE)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

// 單例模式
export const db = new DatabaseService()
