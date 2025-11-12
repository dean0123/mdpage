import { useState, useEffect, useRef } from 'react'
import { Folder, db } from '../services/db'
import { storage } from '../services/storage'
import { exportFolder, selectAndImportFolder } from '../utils/folderImportExport'
import { ensureRecycleFolderExists, RECYCLE_FOLDER_ID } from '../services/recycleBin'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../contexts/AuthContext'
import { syncManagerV2 } from '../services/syncV2/syncManagerV2'
import { exportAllToLocal, importAllFromLocal } from '../utils/localExportImport'
import ToastContainer from './ToastContainer'

interface FolderTreeProps {
  onSelectFolder: (folderId: string) => void
  onFolderDeleted?: () => void  // 當 folder 被刪除時的回調
  selectedFolderId: string | null
  refreshKey?: number  // 當這個值改變時，重新加載數據
}

const FolderTree = ({ onSelectFolder, onFolderDeleted, selectedFolderId, refreshKey }: FolderTreeProps) => {
  const [folders, setFolders] = useState<Folder[]>([])
  // 初始化時從 localStorage 恢復展開狀態
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const savedExpandedFolders = storage.getExpandedFolders()
    return new Set(savedExpandedFolders)
  })
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null)
  const [showArchiveMenu, setShowArchiveMenu] = useState(false)

  // 同步進度
  const [syncProgress, setSyncProgress] = useState<{
    show: boolean
    current: number
    total: number
    message: string
  } | null>(null)

  // Toast 通知 和 Auth
  const toast = useToast()
  const { getAccessToken } = useAuth()

  // Ref 用於引用 folder name 輸入框
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadFolders()
  }, [])

  // 當 refreshKey 改變時，重新加載 folders
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      loadFolders()
    }
  }, [refreshKey])

  // 當進入編輯模式時，自動全選 folder name
  useEffect(() => {
    if (editingFolderId && folderInputRef.current) {
      // 使用 setTimeout 確保輸入框已經渲染並獲得焦點
      setTimeout(() => {
        folderInputRef.current?.select()
      }, 0)
    }
  }, [editingFolderId])

  // 點擊外部關閉存檔選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showArchiveMenu && !target.closest('.archive-dropdown')) {
        setShowArchiveMenu(false)
      }
    }

    if (showArchiveMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showArchiveMenu])

  const loadFolders = async () => {
    const allFolders = await db.getAllFolders()
    setFolders(allFolders)
  }

  const handleCreateFolder = async (parentId: string | null = null) => {
    // 計算同級文件夾的最大 order
    const siblings = folders.filter(f => f.parentId === parentId)
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(f => f.order)) : -1

    // 掃描同級文件夾，找出所有 "新檔案夾" 開頭的名稱，並提取最大數字
    const newFolderPattern = /^新檔案夾(\d+)$/
    let maxNumber = 0

    siblings.forEach(folder => {
      const match = folder.name.match(newFolderPattern)
      if (match) {
        const number = parseInt(match[1], 10)
        if (number > maxNumber) {
          maxNumber = number
        }
      }
    })

    // 新文件夾名稱為最大數字 + 1
    const newFolderName = `新檔案夾${maxNumber + 1}`

    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: newFolderName,
      parentId,
      order: maxOrder + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await db.createFolder(newFolder)

    // 如果有 ParentID 展開父文件夾
    if (parentId) {
      const newExpanded = new Set([...expandedFolders, parentId])
      setExpandedFolders(newExpanded)
      // 保存展開狀態到 localStorage
      storage.saveExpandedFolders(Array.from(newExpanded))
    }

    // 重新加載文件夾列表
    await loadFolders()


    // 直接進入文件夾編輯模式，不創建頁面，不選擇文件夾
    // 1. 先選擇這個新文件夾                                                                                                         ╎│
    onSelectFolder(newFolder.id) 
    setEditingFolderId(newFolder.id)
    setEditingName(newFolder.name)
  }

  const handleUpdateFolder = async (folder: Folder, newName: string) => {
    const updated = { ...folder, name: newName, updatedAt: Date.now() }
    await db.updateFolder(updated)
    await loadFolders()
    setEditingFolderId(null)
  }

  const handleExportFolder = async () => {
    setShowArchiveMenu(false)

    if (!selectedFolderId) {
      toast.warning('請先選擇要匯出的檔案夾')
      return
    }

    try {
      await exportFolder(selectedFolderId)
      toast.success('匯出成功！')
    } catch (error) {
      toast.error(`匯出失敗：${(error as Error).message}`)
    }
  }

  const handleImportFolder = async () => {
    setShowArchiveMenu(false)

    try {
      // 確保 Recycle folder 存在
      const recycleFolder = await ensureRecycleFolderExists()

      selectAndImportFolder(
        recycleFolder.id,
        () => {
          // 成功回調
          toast.success('匯入成功！已導入到 Recycle 檔案夾')
          loadFolders()

          // 展開 Recycle folder
          const newExpanded = new Set([...expandedFolders, RECYCLE_FOLDER_ID])
          setExpandedFolders(newExpanded)
          storage.saveExpandedFolders(Array.from(newExpanded))

          // 選擇 Recycle folder
          onSelectFolder(RECYCLE_FOLDER_ID)
        },
        (error) => {
          // 錯誤回調
          toast.error(`匯入失敗：${error.message}`)
        }
      )
    } catch (error) {
      toast.error(`匯入失敗：${(error as Error).message}`)
    }
  }

  // 匯出全部到雲端（全部取代 Drive）
  const handleForceUploadAll = async () => {
    setShowArchiveMenu(false)

    const accessToken = getAccessToken()
    if (!accessToken) {
      toast.error('請先登入 Google Drive')
      return
    }

    if (!confirm('確定要將本地所有數據上傳到雲端嗎？\n\n⚠️ 這會完全覆蓋 Drive 上的數據！')) {
      return
    }

    try {
      setSyncProgress({ show: true, current: 0, total: 100, message: '準備上傳...' })

      const result = await syncManagerV2.forceUploadAll(accessToken, (current, total, message) => {
        setSyncProgress({ show: true, current, total, message })
      })

      setSyncProgress(null)

      if (result.success) {
        toast.success('✅ 上傳完成！所有數據已同步到雲端')
      } else {
        toast.error(`上傳失敗：${result.errors.join(', ')}`)
      }
    } catch (error) {
      setSyncProgress(null)
      toast.error(`上傳失敗：${(error as Error).message}`)
    }
  }

  // 從雲端全部匯入（全部取代本地）
  const handleForceDownloadAll = async () => {
    setShowArchiveMenu(false)

    const accessToken = getAccessToken()
    if (!accessToken) {
      toast.error('請先登入 Google Drive')
      return
    }

    if (!confirm('確定要從雲端下載所有數據嗎？\n\n⚠️ 這會完全覆蓋本地數據！')) {
      return
    }

    try {
      setSyncProgress({ show: true, current: 0, total: 100, message: '準備下載...' })

      const result = await syncManagerV2.forceDownloadAll(accessToken, (current, total, message) => {
        setSyncProgress({ show: true, current, total, message })
      })

      setSyncProgress(null)

      if (result.success) {
        toast.success('✅ 下載完成！所有數據已從雲端同步')
        await loadFolders()
        // 刷新整個頁面以確保 UI 更新
        window.location.reload()
      } else {
        toast.error(`下載失敗：${result.errors.join(', ')}`)
      }
    } catch (error) {
      setSyncProgress(null)
      toast.error(`下載失敗：${(error as Error).message}`)
    }
  }

  // 匯出全部到本地（ZIP 文件）
  const handleExportAllToLocal = async () => {
    setShowArchiveMenu(false)

    try {
      setSyncProgress({ show: true, current: 0, total: 100, message: '準備匯出...' })

      await exportAllToLocal((current, total, message) => {
        setSyncProgress({ show: true, current, total, message })
      })

      setSyncProgress(null)
      toast.success('✅ 匯出完成！文件已下載到預設下載目錄')
    } catch (error) {
      setSyncProgress(null)
      toast.error(`匯出失敗：${(error as Error).message}`)
    }
  }

  // 從本地匯入全部（ZIP 文件）
  const handleImportAllFromLocal = async () => {
    setShowArchiveMenu(false)

    if (!confirm('確定要從本地文件匯入所有數據嗎？\n\n⚠️ 這會完全覆蓋本地數據！')) {
      return
    }

    try {
      setSyncProgress({ show: true, current: 0, total: 100, message: '準備匯入...' })

      await importAllFromLocal((current, total, message) => {
        setSyncProgress({ show: true, current, total, message })
      })

      setSyncProgress(null)
      toast.success('✅ 匯入完成！所有數據已從文件恢復')
      await loadFolders()
      // 刷新整個頁面以確保 UI 更新
      window.location.reload()
    } catch (error) {
      setSyncProgress(null)
      toast.error(`匯入失敗：${(error as Error).message}`)
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    // **特殊處理：檢查是否為 Recycle folder 或其子 folder**
    const { isRecycleFolderOrChild } = await import('../services/recycleBin')
    const isRecycle = await isRecycleFolderOrChild(folderId)

    if (!isRecycle) {
      // 非 Recycle folder：檢查是否有非空白頁面
      const checkNonEmptyPages = async (id: string): Promise<boolean> => {
        // 檢查當前文件夾的頁面
        const pages = await db.getPagesByFolder(id)
        const hasNonEmptyPage = pages.some(page => page.content.trim() !== '')

        if (hasNonEmptyPage) {
          return true
        }

        // 遞迴檢查子文件夾
        const children = folders.filter(f => f.parentId === id)
        for (const child of children) {
          const childHasNonEmpty = await checkNonEmptyPages(child.id)
          if (childHasNonEmpty) {
            return true
          }
        }

        return false
      }

      // 檢查是否有非空白頁面
      const hasNonEmptyPages = await checkNonEmptyPages(folderId)

      if (hasNonEmptyPages) {
        toast.warning('此檔案夾或其子檔案夾中包含非空白頁面，無法刪除。請先刪除或清空這些頁面。')
        return
      }
    } else {
      // Recycle folder 或其子 folder：直接刪除，需要確認
      const folder = folders.find(f => f.id === folderId)
      const folderName = folder?.name || '此檔案夾'
      if (!confirm(`確定要刪除 "${folderName}" 及其所有內容嗎？\n（Recycle 檔案夾可直接刪除，不檢查內容）`)) {
        return
      }
    }

    // 可以刪除了

    // **在刪除前，記錄被刪除 folder 的信息**
    const deletedFolder = folders.find(f => f.id === folderId)
    if (!deletedFolder) return

    const parentId = deletedFolder.parentId
    const deletedOrder = deletedFolder.order

    // 遞迴刪除子文件夾
    const deleteRecursive = async (id: string) => {
      const children = folders.filter(f => f.parentId === id)
      for (const child of children) {
        await deleteRecursive(child.id)
      }
      await db.deletePagesByFolder(id)
      await db.deleteFolder(id)
    }

    await deleteRecursive(folderId)

    // 重新加載 folders
    const allFolders = await db.getAllFolders()
    await loadFolders()

    // ===== 刪除後的選擇邏輯 =====

    // 1. 如果沒有任何 folder 了，回到初始化狀態
    if (allFolders.length === 0) {
      onSelectFolder('')  // 傳空字符串表示沒有選中的 folder
      console.log('情況1: 所有 folder 已刪除，回到初始化狀態')
      if (onFolderDeleted) {
        onFolderDeleted()
      }
      return
    }

    // 獲取同層的 folders（與被刪除的 folder 同一個 parent）
    const sameLevelFolders = allFolders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.order - b.order)

    // 2. 如果該層沒有 folder 了（這是該層的最後一個），選擇 parent folder
    if (sameLevelFolders.length === 0) {
      if (parentId !== null) {
        // 有 parent，選擇 parent
        onSelectFolder(parentId)
        console.log('情況2: 該層已無 folder，選擇 parent folder')
      } else {
        // 這是根層且已經沒有了，但總體還有 folder，選擇所有 folders 的最後一個
        const allSorted = allFolders.sort((a, b) => a.order - b.order)
        onSelectFolder(allSorted[allSorted.length - 1].id)
        console.log('情況5: 根層已無 folder，選擇所有 folders 的最後一個')
      }
      if (onFolderDeleted) {
        onFolderDeleted()
      }
      return
    }

    // 3 & 4: 在同層中，找到被刪除 folder 的位置
    // 找第一個 order 大於被刪除 folder 的 folder（下一個）
    const nextFolder = sameLevelFolders.find(f => f.order > deletedOrder)

    if (nextFolder) {
      // 3. 有下一個 folder，選擇下一個
      onSelectFolder(nextFolder.id)
      console.log('情況3: 選擇下一個 folder:', nextFolder.name)
    } else {
      // 4. 沒有下一個（刪除的是該層最後一個），選擇前一個
      const prevFolder = sameLevelFolders[sameLevelFolders.length - 1]
      onSelectFolder(prevFolder.id)
      console.log('情況4: 刪除的是該層最後一個，選擇前一個 folder:', prevFolder.name)
    }

    // 通知父組件 folder 已刪除
    if (onFolderDeleted) {
      onFolderDeleted()
    }
  }

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)

    // 保存展開狀態到 localStorage
    storage.saveExpandedFolders(Array.from(newExpanded))
  }

  const handleDragStart = (e: React.DragEvent, folderId: string) => {
    setDraggingFolderId(folderId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('folderId', folderId)
  }

  const handleDragOver = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // 不能拖放到自己身上
    if (draggingFolderId === targetFolderId) {
      setDragOverFolderId(null)
      setDropPosition(null)
      return
    }

    // 不能拖放到自己的子孫文件夾
    if (isDescendant(targetFolderId, draggingFolderId)) {
      setDragOverFolderId(null)
      setDropPosition(null)
      return
    }

    // 計算鼠標在元素中的位置
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mouseY = e.clientY - rect.top
    const height = rect.height
    const position = mouseY / height

    let newPosition: 'before' | 'after' | 'inside'

    if (position < 0.25) {
      // 上方 25%：插入到前面
      newPosition = 'before'
    } else if (position > 0.75) {
      // 下方 25%：插入到後面
      newPosition = 'after'
    } else {
      // 中間 50%：成為子文件夾
      newPosition = 'inside'
    }

    setDragOverFolderId(targetFolderId)
    setDropPosition(newPosition)
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragOverRoot = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId('root')
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggingFolderId) return

    const draggingFolder = folders.find(f => f.id === draggingFolderId)
    if (!draggingFolder) return

    // 不能拖放到自己或自己的子孫
    if (targetFolderId === draggingFolderId) return
    if (targetFolderId && isDescendant(targetFolderId, draggingFolderId)) return

    if (targetFolderId && dropPosition && dropPosition !== 'inside') {
      // 插入到目標文件夾的前面或後面（重排序）
      const targetFolder = folders.find(f => f.id === targetFolderId)
      if (!targetFolder) return

      const newParentId = targetFolder.parentId
      const siblings = folders
        .filter(f => f.parentId === newParentId && f.id !== draggingFolderId)
        .sort((a, b) => a.order - b.order)

      // 找到目標文件夾在同級中的索引
      const targetIndex = siblings.findIndex(f => f.id === targetFolderId)
      const insertIndex = dropPosition === 'before' ? targetIndex : targetIndex + 1

      // 重新計算 order
      const updatedFolders: Folder[] = []

      // 將拖動的文件夾插入到新位置
      siblings.splice(insertIndex, 0, { ...draggingFolder, parentId: newParentId })

      // 重新分配 order 值
      siblings.forEach((folder, index) => {
        updatedFolders.push({
          ...folder,
          order: index,
          updatedAt: Date.now(),
        })
      })

      // 批量更新所有受影響的文件夾
      await Promise.all(updatedFolders.map(f => db.updateFolder(f)))
    } else {
      // 移動到目標文件夾內部（成為子文件夾）
      const targetChildren = folders
        .filter(f => f.parentId === targetFolderId)
        .sort((a, b) => a.order - b.order)

      const updatedFolder = {
        ...draggingFolder,
        parentId: targetFolderId,
        order: targetChildren.length, // 放在最後
        updatedAt: Date.now(),
      }

      await db.updateFolder(updatedFolder)
    }

    await loadFolders()

    setDraggingFolderId(null)
    setDragOverFolderId(null)
    setDropPosition(null)
  }

  const handleDragEnd = () => {
    setDraggingFolderId(null)
    setDragOverFolderId(null)
    setDropPosition(null)
  }

  // 檢查 targetId 是否是 folderId 的子孫
  const isDescendant = (targetId: string, folderId: string | null): boolean => {
    if (!folderId) return false

    let current = folders.find(f => f.id === targetId)
    while (current) {
      if (current.parentId === folderId) return true
      current = folders.find(f => f.id === current?.parentId)
    }
    return false
  }

  const renderFolder = (folder: Folder, level: number = 0) => {
    const children = folders
      .filter(f => f.parentId === folder.id)
      .sort((a, b) => a.order - b.order)
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const isEditing = editingFolderId === folder.id
    const isDragging = draggingFolderId === folder.id
    const isDragOver = dragOverFolderId === folder.id
    const showInsertBefore = isDragOver && dropPosition === 'before'
    const showInsertAfter = isDragOver && dropPosition === 'after'
    const showInsertInside = isDragOver && dropPosition === 'inside'

    return (
      <div key={folder.id} className="folder-wrapper">
        {showInsertBefore && (
          <div className="folder-insert-line" style={{ marginLeft: `${level * 16 + 8}px` }} />
        )}
        <div
          className={`folder-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${showInsertInside ? 'drag-over-inside' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, folder.id)}
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDrop={(e) => handleDrop(e, folder.id)}
          onDragEnd={handleDragEnd}
        >
          <span
            className="folder-toggle"
            onClick={() => toggleFolder(folder.id)}
          >
            {children.length > 0 ? (isExpanded ? '▼' : '▶') : '　'}
          </span>

          {isEditing ? (
            <input
              ref={folderInputRef}
              type="text"
              className="folder-name-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => {
                if (editingName.trim()) {
                  handleUpdateFolder(folder, editingName.trim())
                } else {
                  setEditingFolderId(null)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (editingName.trim()) {
                    handleUpdateFolder(folder, editingName.trim())
                  }
                } else if (e.key === 'Escape') {
                  setEditingFolderId(null)
                }
              }}
              autoFocus
            />
          ) : (
            <>
              <span className="folder-icon">📁</span>
              <span
                className="folder-name"
                onClick={() => onSelectFolder(folder.id)}
              >
                {folder.name}
              </span>
              <div className="folder-actions">
                <button
                  className="folder-action-btn"
                  onClick={() => handleCreateFolder(folder.id)}
                  title="新增子檔案夾"
                >
                  +
                </button>
                <button
                  className="folder-action-btn"
                  onClick={() => {
                    setEditingFolderId(folder.id)
                    setEditingName(folder.name)
                  }}
                  title="重命名"
                >
                  ✎
                </button>
                <button
                  className="folder-action-btn folder-delete-btn"
                  onClick={() => handleDeleteFolder(folder.id)}
                  title="刪除"
                >
                  ✕
                </button>
              </div>
            </>
          )}
        </div>

        {isExpanded && children.length > 0 && (
          <div className="folder-children">
            {children.map(child => renderFolder(child, level + 1))}
          </div>
        )}
        {showInsertAfter && (
          <div className="folder-insert-line" style={{ marginLeft: `${level * 16 + 8}px` }} />
        )}
      </div>
    )
  }

  const rootFolders = folders
    .filter(f => f.parentId === null)
    .sort((a, b) => a.order - b.order)

  return (
    <div className="folder-tree">
      <div className="folder-tree-header">
        <button
          className="folder-add-btn"
          onClick={() => handleCreateFolder(null)}
          title="新增根檔案夾"
        >
          新增檔案夾
        </button>

        {/* 存檔按鈕和下拉選單 */}
        <div className="archive-dropdown" style={{ marginLeft: 'auto' }}>
          <button
            className="folder-archive-btn"
            onClick={() => setShowArchiveMenu(!showArchiveMenu)}
            title="匯出/匯入檔案夾"
          >
            💾
          </button>

          {showArchiveMenu && (
            <div className="archive-menu">
              <button
                className="archive-menu-item"
                onClick={handleExportFolder}
                disabled={!selectedFolderId}
              >
                📤 匯出檔案夾
              </button>
              <button
                className="archive-menu-item"
                onClick={handleImportFolder}
              >
                📥 匯入檔案夾
              </button>
              <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }} />
              <button
                className="archive-menu-item"
                onClick={handleExportAllToLocal}
                style={{ color: '#10b981' }}
              >
                💾 匯出全部到本地
              </button>
              <button
                className="archive-menu-item"
                onClick={handleImportAllFromLocal}
                style={{ color: '#10b981' }}
              >
                📂 從本地匯入全部
              </button>
              <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }} />
              <button
                className="archive-menu-item"
                onClick={handleForceUploadAll}
                style={{ color: '#ef4444' }}
              >
                ☁️ 匯出全部到雲端
              </button>
              <button
                className="archive-menu-item"
                onClick={handleForceDownloadAll}
                style={{ color: '#3b82f6' }}
              >
                📲 從雲端全部匯入
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        className={`folder-tree-content ${dragOverFolderId === 'root' ? 'drag-over-root' : ''}`}
        onDragOver={handleDragOverRoot}
        onDrop={(e) => handleDrop(e, null)}
      >
        {rootFolders.length === 0 ? (
          <div className="folder-empty">
            點擊上方按鈕新增第一個檔案夾
          </div>
        ) : (
          rootFolders.map(folder => renderFolder(folder))
        )}
      </div>

      {/* Toast 通知容器 */}
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* 同步進度對話框 */}
      {syncProgress && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
              同步進度
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  width: '100%',
                  height: '24px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(syncProgress.current / syncProgress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
              {syncProgress.current} / {syncProgress.total}
            </div>

            <div style={{ fontSize: '14px', color: '#374151' }}>
              {syncProgress.message}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FolderTree
