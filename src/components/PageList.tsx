import { useState, useEffect } from 'react'
import { Page, Folder, db } from '../services/db'
import { ensureFolderAndPage } from '../services/pageHelper'

interface PageListProps {
  folderId: string | null
  onSelectPage: (page: Page) => void
  onSelectFolder?: (folderId: string) => void
  onFolderCreated?: () => void  // 當創建 folder 時的回調
  onPageCreated?: () => void  // 當創建 page 時的回調
  selectedPageId: string | null
  selectedPage: Page | null
  refreshKey?: number  // 當這個值改變時，重新加載數據
}

type SortBy = 'none' | 'updatedAt' | 'createdAt' | 'name'
type SortOrder = 'asc' | 'desc'

const PageList = ({ folderId, onSelectPage, onSelectFolder, onFolderCreated, onPageCreated, selectedPageId, selectedPage, refreshKey }: PageListProps) => {
  const [pages, setPages] = useState<Page[]>([])
  const [sortBy, setSortBy] = useState<SortBy>('none')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showSortMenu, setShowSortMenu] = useState(false)

  useEffect(() => {
    if (folderId) {
      loadPages()
    } else {
      setPages([])
    }
  }, [folderId, selectedPageId])

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
        compareResult = a.name.localeCompare(b.name)
      }

      return sortOrder === 'asc' ? compareResult : -compareResult
    })

    return sorted
  }

  const handleSortChange = (newSortBy: SortBy) => {
    if (newSortBy === 'none') {
      setSortBy('none')
      setShowSortMenu(false)
      return
    }

    if (sortBy === newSortBy) {
      // 切換排序方向
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(newSortBy)
      setSortOrder('desc')
    }
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

    await db.deletePage(pageId)
    await loadPages()

    // 如果刪除的是當前頁面，清空選擇
    if (selectedPageId === pageId) {
      onSelectPage({
        id: '',
        folderId: '',
        name: '',
        content: '',
        createdAt: 0,
        updatedAt: 0,
      })
    }
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
              >
                <span
                  className="page-name"
                  onClick={() => onSelectPage(page)}
                >
                  📄 {displayName}
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
