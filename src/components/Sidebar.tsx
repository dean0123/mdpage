import { useState, useEffect } from 'react'
import FolderTree from './FolderTree'
import PageList from './PageList'
import { GoogleSignInButton } from './auth/GoogleSignInButton'
import { UserProfile } from './auth/UserProfile'
import { useAuth } from '../contexts/AuthContext'
import { Page, db } from '../services/db'
import { storage } from '../services/storage'

interface SidebarProps {
  onSelectPage: (page: Page) => void
  onSelectFolder: (folderId: string) => void
  selectedFolderId: string | null  // 從 MarkdownEditor 傳入的選中 folderId
  selectedPageId: string | null
  selectedPage: Page | null
  refreshTrigger?: number  // 從 MarkdownEditor 傳入的刷新觸發器
}

type SidebarMode = 'full' | 'pageOnly' | 'hidden'

const Sidebar = ({ onSelectPage, onSelectFolder, selectedFolderId: selectedFolderIdFromParent, selectedPageId, selectedPage, refreshTrigger }: SidebarProps) => {
  const { isSignedIn } = useAuth()
  const [mode, setMode] = useState<SidebarMode>('full')
  // 內部的 selectedFolderId，用於顯示
  const [internalSelectedFolderId, setInternalSelectedFolderId] = useState<string | null>(() => {
    const savedState = storage.getState()
    return savedState.selectedFolderId
  })
  const [folderWidth, setFolderWidth] = useState(200)
  const [pageWidth, setPageWidth] = useState(200)
  const [isResizingFolder, setIsResizingFolder] = useState(false)
  const [isResizingPage, setIsResizingPage] = useState(false)

  // 刷新觸發器：當這些值改變時，FolderTree 和 PageList 會重新加載數據
  const [folderRefreshKey, setFolderRefreshKey] = useState(0)
  const [pageRefreshKey, setPageRefreshKey] = useState(0)

  // 觸發 FolderTree 刷新
  const triggerFolderRefresh = () => {
    setFolderRefreshKey(prev => prev + 1)
  }

  // 觸發 PageList 刷新
  const triggerPageRefresh = () => {
    setPageRefreshKey(prev => prev + 1)
  }

  const toggleMode = () => {
    if (mode === 'full') {
      setMode('pageOnly')
    } else if (mode === 'pageOnly') {
      setMode('hidden')
    } else {
      setMode('full')
    }
  }

  // 初始化時，如果有恢復的 folderId，通知父組件
  useEffect(() => {
    if (internalSelectedFolderId) {
      onSelectFolder(internalSelectedFolderId)
    }
  }, [])

  // 監聽來自父組件的 selectedFolderId 變化
  useEffect(() => {
    if (selectedFolderIdFromParent !== undefined && selectedFolderIdFromParent !== internalSelectedFolderId) {
      setInternalSelectedFolderId(selectedFolderIdFromParent)
      console.log('Sidebar 收到來自父組件的 selectedFolderId:', selectedFolderIdFromParent)

      // 當 selectedFolderId 變化時，也觸發 PageList 刷新
      // 延遲一下，確保 internalSelectedFolderId 已經更新
      setTimeout(() => {
        triggerPageRefresh()
      }, 50)
    }
  }, [selectedFolderIdFromParent])

  // 監聽來自 MarkdownEditor 的刷新觸發
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      // 同時刷新 FolderTree 和 PageList
      triggerFolderRefresh()
      triggerPageRefresh()
      console.log('收到刷新觸發，刷新 Sidebar')
    }
  }, [refreshTrigger])

  const handleSelectFolder = async (folderId: string) => {
    setInternalSelectedFolderId(folderId)
    onSelectFolder(folderId)

    // 自動載入該文件夾最後更新的頁面
    try {
      const pages = await db.getPagesByFolder(folderId)
      if (pages.length > 0) {
        // 按更新時間排序，取最後更新的頁面
        const sortedPages = pages.sort((a, b) => b.updatedAt - a.updatedAt)
        const latestPage = sortedPages[0]
        onSelectPage(latestPage)
      } else {
        // 如果沒有頁面，清空編輯器
        onSelectPage({
          id: '',
          folderId: '',
          name: '',
          content: '',
          createdAt: 0,
          updatedAt: 0,
        })
      }
    } catch (error) {
      console.error('Failed to load folder pages:', error)
    }
  }

  // 處理調整寬度
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingFolder) {
        const newWidth = e.clientX - 50 // 減去控制欄寬度
        if (newWidth >= 150 && newWidth <= 400) {
          setFolderWidth(newWidth)
        }
      } else if (isResizingPage) {
        const folderTotalWidth = mode === 'full' ? folderWidth + 50 : 50
        const newWidth = e.clientX - folderTotalWidth
        if (newWidth >= 150 && newWidth <= 400) {
          setPageWidth(newWidth)
        }
      }
    }

    const handleMouseUp = () => {
      setIsResizingFolder(false)
      setIsResizingPage(false)
    }

    if (isResizingFolder || isResizingPage) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingFolder, isResizingPage, folderWidth, mode])

  return (
    <div className={`sidebar sidebar-${mode}`}>
      {/* 控制區 */}
      <div className="sidebar-control">
        <button
          className="sidebar-toggle-btn"
          onClick={toggleMode}
          title={
            mode === 'full' ? '隱藏檔案夾區' :
            mode === 'pageOnly' ? '全部隱藏' :
            '顯示全部'
          }
        >
          ✏️
        </button>

        {/* Google 認證按鈕 - 固定在控制區底部 */}
        <div style={{ marginTop: 'auto' }}>
          {isSignedIn ? <UserProfile /> : <GoogleSignInButton />}
        </div>
      </div>

      {/* Folder 區塊 */}
      {mode === 'full' && (
        <>
          <div className="sidebar-folder" style={{ width: `${folderWidth}px` }}>
            <FolderTree
              onSelectFolder={handleSelectFolder}
              onFolderDeleted={triggerFolderRefresh}
              selectedFolderId={internalSelectedFolderId}
              refreshKey={folderRefreshKey}
            />
          </div>
          <div
            className="sidebar-resizer"
            onMouseDown={() => setIsResizingFolder(true)}
          />
        </>
      )}

      {/* Page 區塊 */}
      {(mode === 'full' || mode === 'pageOnly') && (
        <>
          <div className="sidebar-page" style={{ width: `${pageWidth}px` }}>
            <PageList
              folderId={internalSelectedFolderId}
              onSelectPage={onSelectPage}
              onSelectFolder={handleSelectFolder}
              onFolderCreated={triggerFolderRefresh}
              selectedPageId={selectedPageId}
              selectedPage={selectedPage}
              refreshKey={pageRefreshKey}
            />
          </div>
          <div
            className="sidebar-resizer"
            onMouseDown={() => setIsResizingPage(true)}
          />
        </>
      )}
    </div>
  )
}

export default Sidebar
