import { useState, useEffect } from 'react'
import { Page, db } from '../services/db'
import { ensureFolderAndPage } from '../services/pageHelper'
import { storage } from '../services/storage'

interface PageListProps {
  folderId: string | null
  onSelectPage: (page: Page) => void
  onSelectFolder?: (folderId: string) => void
  onFolderCreated?: () => void  // 當創建 folder 時的回調
  selectedPageId: string | null
  selectedPage: Page | null
  refreshKey?: number  // 當這個值改變時，重新加載數據
}

type SortBy = 'none' | 'updatedAt' | 'createdAt' | 'name'
type SortOrder = 'asc' | 'desc'

const PageList = ({ folderId, onSelectPage, onSelectFolder, onFolderCreated, selectedPageId, selectedPage, refreshKey }: PageListProps) => {
  const [pages, setPages] = useState<Page[]>([])
  // 初始化時從 localStorage 恢復排序設定，默認為字母小到大
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const savedSort = storage.getPageSort()
    return savedSort.sortBy as SortBy
  })
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const savedSort = storage.getPageSort()
    return savedSort.sortOrder as SortOrder
  })
  const [showSortMenu, setShowSortMenu] = useState(false)

  useEffect(() => {
    if (folderId) {
      loadPages()
    } else {
      setPages([])
    }
  }, [folderId])

  // 當 selectedPage 更新時，同步更新 pages 數組中的對應頁面
  useEffect(() => {
    if (selectedPage && selectedPage.id) {
      setPages(prevPages => {
        // 檢查是否需要更新（避免不必要的重新渲染）
        const existingPage = prevPages.find(p => p.id === selectedPage.id)
        if (existingPage &&
            (existingPage.name !== selectedPage.name ||
             existingPage.content !== selectedPage.content ||
             existingPage.updatedAt !== selectedPage.updatedAt)) {
          // 更新 pages 數組中的對應頁面，並重新排序
          const updatedPages = prevPages.map(p =>
            p.id === selectedPage.id ? selectedPage : p
          )
          return sortPages(updatedPages)
        }
        return prevPages
      })
    }
  }, [selectedPage])

  // 當 refreshKey 改變時，重新加載 pages
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0 && folderId) {
      loadPages()
    }
  }, [refreshKey])

  // 當排序條件改變時重新排序
  useEffect(() => {
    if (folderId && pages.length > 0) {
      loadPages()
    }
  }, [sortBy, sortOrder])

  // 點擊外部關閉排序選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showSortMenu && !target.closest('.page-sort-dropdown')) {
        setShowSortMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSortMenu])

  const loadPages = async () => {
    if (!folderId) return
    const folderPages = await db.getPagesByFolder(folderId)
    const sortedPages = sortPages(folderPages)
    setPages(sortedPages)
  }

  const sortPages = (pagesToSort: Page[]) => {
    // 如果排序方式為 'none'，不進行排序，保持原有順序
    if (sortBy === 'none') {
      return pagesToSort
    }

    const sorted = [...pagesToSort].sort((a, b) => {
      let compareResult = 0

      if (sortBy === 'updatedAt') {
        compareResult = a.updatedAt - b.updatedAt
      } else if (sortBy === 'createdAt') {
        compareResult = a.createdAt - b.createdAt
      } else if (sortBy === 'name') {
        compareResult = a.name.localeCompare(b.name, 'zh-TW')
      }

      return sortOrder === 'asc' ? compareResult : -compareResult
    })

    return sorted
  }

  const handleSortChange = (newSortBy: SortBy) => {
    // 如果選擇 'none'，直接設置並保存
    if (newSortBy === 'none') {
      setSortBy('none')
      storage.savePageSort('none', sortOrder)
      setShowSortMenu(false)
      return
    }

    let newSortOrder: SortOrder

    if (sortBy === newSortBy) {
      // 切換排序方向
      newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc'
      setSortOrder(newSortOrder)
    } else {
      setSortBy(newSortBy)
      // 字母排序默認為升序（小到大），其他排序默認為降序（新到舊）
      newSortOrder = newSortBy === 'name' ? 'asc' : 'desc'
      setSortOrder(newSortOrder)
    }

    // 保存排序設定到 localStorage
    storage.savePageSort(sortBy === newSortBy ? sortBy : newSortBy, newSortOrder)
    setShowSortMenu(false)
  }

  const handleCreatePage = async () => {
    try {
      // 場景1：folder list 為空時，使用統一邏輯創建「新資料夾」和「新頁面」
      if (!folderId) {
        const allFolders = await db.getAllFolders()

        if (allFolders.length === 0) {
          // 使用統一的邏輯：確保有 folder 和 page
          const { folder, page } = await ensureFolderAndPage()

          // 通知父組件創建了 folder
          if (onFolderCreated) {
            onFolderCreated()
          }

          // 通知父組件選擇這個新文件夾
          if (onSelectFolder) {
            onSelectFolder(folder.id)
          }

          // 重新加載頁面列表
          await loadPages()

          // 自動選擇新頁面，focus 到 editor
          onSelectPage(page)

          console.log('新增頁面：自動創建 folder 和 page:', { folder: folder.name, page: page.name })
          return
        } else {
          // 有文件夾但沒選中，選擇第一個文件夾
          const firstFolder = allFolders.sort((a, b) => a.order - b.order)[0]
          if (onSelectFolder) {
            onSelectFolder(firstFolder.id)
          }

          // 在第一個文件夾下創建新頁面
          const newPage: Page = {
            id: `page-${Date.now()}`,
            folderId: firstFolder.id,
            name: '新頁面',
            content: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }

          await db.createPage(newPage)
          await loadPages()
          onSelectPage(newPage)
          return
        }
      }

      // 場景2：有選中的 folder，直接在這個 folder 下創建新頁面
      const newPage: Page = {
        id: `page-${Date.now()}`,
        folderId: folderId,
        name: '新頁面',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await db.createPage(newPage)
      await loadPages()

      // 自動選擇新頁面，focus 到 editor
      onSelectPage(newPage)

      console.log('新增頁面：', { folderId, page: newPage.name })
    } catch (error) {
      console.error('Failed to create page:', error)
    }
  }

  const handleDeletePage = async (pageId: string) => {
    // 如果是選中的頁面，使用 selectedPage 的最新內容
    // 否則從 pages 中獲取
    let pageContent = ''
    if (selectedPageId === pageId && selectedPage) {
      pageContent = selectedPage.content
    } else {
      const page = pages.find(p => p.id === pageId)
      pageContent = page?.content || ''
    }

    const isEmpty = !pageContent.trim()

    // 如果頁面有內容，需要確認
    if (!isEmpty) {
      if (!confirm('確定要刪除此頁面嗎？')) return
    }

    // **在刪除前，記錄被刪除 page 在當前排序中的位置**
    const deletedIndex = pages.findIndex(p => p.id === pageId)

    await db.deletePage(pageId)

    // 重新加載 pages
    if (!folderId) return
    const folderPages = await db.getPagesByFolder(folderId)
    const sortedPages = sortPages(folderPages)
    setPages(sortedPages)

    // ===== 刪除後的選擇邏輯 =====

    // 只在刪除的是當前選中的頁面時才需要選擇新頁面
    if (selectedPageId !== pageId) {
      return
    }

    // **重要：先清空當前頁面，避免 onSelectPage 時保存已刪除的頁面**
    // 調用 onSelectPage 傳入空頁面，清空 MarkdownEditor 的 currentPage 和 autoSaveTimer
    onSelectPage({
      id: '',
      folderId: '',
      name: '',
      content: '',
      createdAt: 0,
      updatedAt: 0,
    })

    // 1. 如果沒有任何 page 了，保持清空狀態
    if (sortedPages.length === 0) {
      console.log('情況1: 所有 page 已刪除，清空選擇')
      return
    }

    // 延遲一下，確保清空操作完成後再選擇新頁面
    setTimeout(() => {
      // 2. 如果找不到被刪除的索引（deletedIndex === -1），選擇第一個 page
      if (deletedIndex === -1) {
        const firstPage = sortedPages[0]
        onSelectPage(firstPage)
        console.log('情況2: 找不到被刪除頁面的索引，選擇第一個 page:', firstPage.name)
        return
      }

      // 3. 如果有下一個 page（被刪除的不是最後一個），選擇下一個
      if (deletedIndex < sortedPages.length) {
        const nextPage = sortedPages[deletedIndex]
        onSelectPage(nextPage)
        console.log('情況3: 選擇下一個 page:', nextPage.name)
        return
      }

      // 4. 沒有下一個（刪除的是最後一個），選擇前一個
      const prevPage = sortedPages[sortedPages.length - 1]
      onSelectPage(prevPage)
      console.log('情況4: 刪除的是最後一個，選擇前一個 page:', prevPage.name)
    }, 50)
  }

  return (
    <div className="page-list">
      <div className="page-list-header">
        <div className="page-header-actions">
          <button
            className="page-add-btn"
            onClick={handleCreatePage}
            title="新增頁面"
          >
            新增頁面
          </button>
          <div className="page-sort-dropdown">
            <button
              className="page-sort-btn"
              onClick={() => setShowSortMenu(!showSortMenu)}
              title="排序"
            >
              ▼
            </button>
            {showSortMenu && (
              <div className="page-sort-menu">
                <button
                  className={`sort-menu-item ${sortBy === 'updatedAt' ? 'active' : ''}`}
                  onClick={() => handleSortChange('updatedAt')}
                >
                  修改日期
                  {sortBy === 'updatedAt' && (sortOrder === 'desc' ? '⬇' : '⬆')}
                </button>
                <button
                  className={`sort-menu-item ${sortBy === 'createdAt' ? 'active' : ''}`}
                  onClick={() => handleSortChange('createdAt')}
                >
                  建立日期
                  {sortBy === 'createdAt' && (sortOrder === 'desc' ? '⬇' : '⬆')}
                </button>
                <button
                  className={`sort-menu-item ${sortBy === 'name' ? 'active' : ''}`}
                  onClick={() => handleSortChange('name')}
                >
                  字母順序
                  {sortBy === 'name' && (sortOrder === 'desc' ? '⬇' : '⬆')}
                </button>

                <div className="sort-menu-divider"></div>
                <button
                       className={`sort-menu-item ${sortBy === 'none' ? 'active' : ''}`}
                       onClick={() => handleSortChange('none')}
                   >
                      無
                  {sortBy === 'none' && ' ✓'}
                </button>

              </div>
            )}
          </div>
        </div>
      </div>
      <div className="page-list-content">
        {!folderId ? (
          <div className="page-empty">
            請先選擇一個檔案夾
          </div>
        ) : pages.length === 0 ? (
          <div className="page-empty">
            此檔案夾尚無頁面<br />
            點擊上方按鈕新增
          </div>
        ) : (
          pages.map(page => {
            const isSelected = selectedPageId === page.id
            // 如果是選中的頁面，使用 selectedPage 的名稱（即時更新）
            const displayName = (isSelected && selectedPage) ? selectedPage.name : page.name

            return (
              <div
                key={page.id}
                className={`page-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectPage(page)}
              >
                <span className="page-name">
                  {displayName}
                </span>
                <div className="page-actions">
                  <button
                    className="page-action-btn page-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeletePage(page.id)
                    }}
                    title="刪除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default PageList
