// LocalStorage 服務 - 用於保存和恢復應用狀態

interface AppState {
  selectedFolderId: string | null
  selectedPageId: string | null
  cursorPosition: number | null
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
        return JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to get state:', error)
    }
    return {
      selectedFolderId: null,
      selectedPageId: null,
      cursorPosition: null,
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
