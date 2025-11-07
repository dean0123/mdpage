// LocalStorage 服務 - 用於保存和恢復應用狀態

interface AppState {
  selectedFolderId: string | null
  selectedPageId: string | null
  cursorPosition: number | null
  expandedFolders: string[] // 展開的文件夾 ID 列表
  pageSortBy: string // 頁面排序方式
  pageSortOrder: string // 頁面排序順序
}

const STORAGE_KEY = 'ppage-app-state'

class StorageService {
  // 保存狀態
  saveState(state: Partial<AppState>): void {
    try {
      const currentState = this.getState()
      const newState = { ...currentState, ...state }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState))
    } catch (error) {
      console.error('Failed to save state:', error)
    }
  }

  // 獲取完整狀態
  getState(): AppState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const state = JSON.parse(stored)
        // 向後兼容：如果沒有排序設定，使用默認值
        return {
          ...state,
          pageSortBy: state.pageSortBy || 'name',
          pageSortOrder: state.pageSortOrder || 'asc',
        }
      }
    } catch (error) {
      console.error('Failed to get state:', error)
    }
    return {
      selectedFolderId: null,
      selectedPageId: null,
      cursorPosition: null,
      expandedFolders: [],
      pageSortBy: 'name',
      pageSortOrder: 'asc',
    }
  }

  // 保存選中的文件夾
  saveSelectedFolder(folderId: string | null): void {
    this.saveState({ selectedFolderId: folderId })
  }

  // 保存選中的頁面
  saveSelectedPage(pageId: string | null): void {
    this.saveState({ selectedPageId: pageId })
  }

  // 保存游標位置
  saveCursorPosition(position: number | null): void {
    this.saveState({ cursorPosition: position })
  }

  // 保存展開的文件夾
  saveExpandedFolders(folderIds: string[]): void {
    this.saveState({ expandedFolders: folderIds })
  }

  // 獲取展開的文件夾
  getExpandedFolders(): string[] {
    const state = this.getState()
    return state.expandedFolders || []
  }

  // 保存頁面排序設定
  savePageSort(sortBy: string, sortOrder: string): void {
    this.saveState({ pageSortBy: sortBy, pageSortOrder: sortOrder })
  }

  // 獲取頁面排序設定
  getPageSort(): { sortBy: string; sortOrder: string } {
    const state = this.getState()
    return {
      sortBy: state.pageSortBy || 'name',
      sortOrder: state.pageSortOrder || 'asc',
    }
  }

  // 清除狀態
  clearState(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear state:', error)
    }
  }
}

// 單例模式
export const storage = new StorageService()
