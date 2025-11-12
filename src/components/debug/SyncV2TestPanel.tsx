/**
 * V2 同步測試面板
 * 測試新的 V2 同步架構
 */

import { useState } from 'react'
import { syncManagerV2 } from '../../services/syncV2/syncManagerV2'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../services/db'
import { DriveV2Service } from '../../services/syncV2/driveV2'

export function SyncV2TestPanel() {
  const { getAccessToken } = useAuth()
  const [log, setLog] = useState<string[]>([])
  const [isSyncing, setIsSyncing] = useState(false)

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'
    setLog(prev => [...prev, `${prefix} ${message}`])
    console.log(`${prefix} ${message}`)
  }

  const clearLog = () => setLog([])

  // 測試：執行完整同步
  const testFullSync = async () => {
    clearLog()
    addLog('=== V2 完整同步測試 ===')
    addLog('')

    const accessToken = getAccessToken()
    if (!accessToken) {
      addLog('未登入，請先登入 Google', 'error')
      return
    }

    setIsSyncing(true)

    try {
      const result = await syncManagerV2.performSync(accessToken)

      addLog('同步完成！', 'success')
      addLog('')
      addLog('結果統計：')
      addLog(`  📤 上傳 folders: ${result.foldersUploaded} 個`)
      addLog(`  📥 下載 folders: ${result.foldersDownloaded} 個`)
      addLog(`  🗑️  刪除 folders: ${result.foldersDeleted} 個`)
      addLog(`  📤 上傳 pages: ${result.pagesUploaded} 個`)
      addLog(`  📥 下載 pages: ${result.pagesDownloaded} 個`)
      addLog(`  🗑️  刪除 pages: ${result.pagesDeleted} 個`)
      if (result.conflicts > 0) {
        addLog(`  ⚠️  衝突: ${result.conflicts} 個（已建立副本）`, 'error')
      }

      if (result.errors.length > 0) {
        addLog('', 'error')
        addLog('錯誤：', 'error')
        result.errors.forEach(err => addLog(`  ${err}`, 'error'))
      }

    } catch (error: any) {
      addLog(`同步失敗：${error.message || error}`, 'error')
      console.error('Sync error:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  // 測試：查看本地數據
  const testViewLocalData = async () => {
    clearLog()
    addLog('=== 本地數據查看 ===')
    addLog('')

    try {
      const folders = await db.getAllFolders()
      const pages = await db.getAllPages()

      let deletedFolders: any[] = []
      let deletedPages: any[] = []

      try {
        deletedFolders = await db.getAllDeletedFolders()
        deletedPages = await db.getAllDeletedPages()
      } catch (error) {
        addLog('⚠️  無法讀取刪除記錄（數據庫未升級？）', 'error')
        addLog('請關閉所有瀏覽器標籤頁後重新打開', 'error')
      }

      addLog(`📁 Folders: ${folders.length} 個`)
      folders.forEach((f, i) => {
        addLog(`  ${i + 1}. ${f.name} (${f.id})`)
      })

      addLog('')
      addLog(`📄 Pages: ${pages.length} 個`)
      pages.forEach((p, i) => {
        addLog(`  ${i + 1}. ${p.name} (${p.id}) - ${(p.content.length / 1024).toFixed(2)} KB`)
      })

      addLog('')
      addLog(`🗑️  Deleted Folders: ${deletedFolders.length} 個`)
      deletedFolders.forEach((d, i) => {
        addLog(`  ${i + 1}. ${d.folderId} (deleted at: ${new Date(d.deletedAt).toLocaleString()})`)
      })

      addLog('')
      addLog(`🗑️  Deleted Pages: ${deletedPages.length} 個`)
      deletedPages.forEach((d, i) => {
        addLog(`  ${i + 1}. ${d.pageId} (deleted at: ${new Date(d.deletedAt).toLocaleString()})`)
      })

    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
    }
  }

  // 測試：查看 Drive 數據
  const testViewDriveData = async () => {
    clearLog()
    addLog('=== Drive 數據查看 ===')
    addLog('')

    const accessToken = getAccessToken()
    if (!accessToken) {
      addLog('未登入，請先登入 Google', 'error')
      return
    }

    try {
      const driveService = new DriveV2Service(accessToken)
      await driveService.initialize()

      // 下載並顯示 folders.json
      const foldersJson = await driveService.downloadFoldersJson()
      if (foldersJson) {
        const foldersData = JSON.parse(foldersJson)
        addLog(`📁 folders.json: ${foldersData.folders.length} 個 folders`)
      } else {
        addLog('📁 folders.json: 不存在')
      }

      // 下載並顯示 pages.json
      const pagesJson = await driveService.downloadPagesJson()
      if (pagesJson) {
        const pagesData = JSON.parse(pagesJson)
        addLog(`📄 pages.json: ${pagesData.pages.length} 個 pages`)
      } else {
        addLog('📄 pages.json: 不存在')
      }

      // 下載並顯示 deletedFolders.json
      const deletedFoldersJson = await driveService.downloadDeletedFoldersJson()
      if (deletedFoldersJson) {
        const deletedFoldersData = JSON.parse(deletedFoldersJson)
        addLog(`🗑️  deletedFolders.json: ${deletedFoldersData.deleted.length} 個記錄`)
      } else {
        addLog('🗑️  deletedFolders.json: 不存在')
      }

      // 下載並顯示 deletedPages.json
      const deletedPagesJson = await driveService.downloadDeletedPagesJson()
      if (deletedPagesJson) {
        const deletedPagesData = JSON.parse(deletedPagesJson)
        addLog(`🗑️  deletedPages.json: ${deletedPagesData.deleted.length} 個記錄`)
      } else {
        addLog('🗑️  deletedPages.json: 不存在')
      }

      // 列出 pages/ 文件夾中的文件
      const pageFiles = await driveService.listAllPageFiles()
      addLog(`📝 pages/ 文件夾: ${pageFiles.length} 個 .md 文件`)

    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
      console.error('View Drive error:', error)
    }
  }

  // 測試：模擬多設備衝突
  const testSimulateConflict = async () => {
    clearLog()
    addLog('=== 模擬多設備衝突測試 ===')
    addLog('')

    const accessToken = getAccessToken()
    if (!accessToken) {
      addLog('未登入，請先登入 Google', 'error')
      return
    }

    try {
      // 1. 獲取第一個 page
      const pages = await db.getAllPages()
      if (pages.length === 0) {
        addLog('本地沒有 pages，請先創建一些內容', 'error')
        return
      }

      const testPage = pages[0]
      addLog(`選擇測試 page: ${testPage.name}`)
      addLog('')

      // 2. 修改 Drive 上的版本（模擬其他設備修改）
      addLog('步驟 1: 修改 Drive 上的內容（模擬設備B）...')
      const driveService = new DriveV2Service(accessToken)
      await driveService.initialize()

      const simulatedContent = `${testPage.content}\n\n---\n[設備B 在 ${new Date().toLocaleString()} 修改]`
      await driveService.uploadPageContent(testPage.id, simulatedContent)
      addLog('✅ Drive 版本已修改', 'success')
      addLog('')

      // 3. 修改本地版本（模擬設備A修改）
      addLog('步驟 2: 修改本地內容（模擬設備A）...')
      const localModifiedContent = `${testPage.content}\n\n---\n[設備A 在 ${new Date().toLocaleString()} 修改]`
      await db.updatePage({
        ...testPage,
        content: localModifiedContent,
        updatedAt: Date.now()
      })
      addLog('✅ 本地版本已修改', 'success')
      addLog('')

      // 4. 同時更新 Drive 的 pages.json metadata
      addLog('步驟 3: 更新 Drive metadata...')
      const allPages = await db.getAllPages()
      const localPages = allPages.filter(p => p.id !== testPage.id)
      localPages.push({
        ...testPage,
        content: simulatedContent,
        updatedAt: Date.now() + 1000  // Drive 版本稍微新一點
      })

      // 序列化並上傳
      const { serializePages } = await import('../../services/syncV2/serializer')
      const serialized = await serializePages(localPages)
      await driveService.uploadPagesJson(JSON.stringify(serialized, null, 2))
      addLog('✅ Drive metadata 已更新', 'success')
      addLog('')

      addLog('✅ 衝突場景模擬完成！', 'success')
      addLog('')
      addLog('請點擊「執行完整同步」測試衝突處理', 'success')

    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
      console.error('Simulate conflict error:', error)
    }
  }

  // 測試：清空本地刪除記錄
  const testClearLocalDeleted = async () => {
    if (!confirm('確定要清空本地刪除記錄嗎？\n\n這會清空：\n- deletedFolders 表\n- deletedPages 表\n\n用於測試從 Drive 下載刪除記錄')) {
      return
    }

    clearLog()
    addLog('=== 清空本地刪除記錄 ===')
    addLog('')

    try {
      await db.clearDeletedFolders()
      await db.clearDeletedPages()
      addLog('本地刪除記錄已清空', 'success')
      addLog('')
      addLog('✅ 現在可以執行同步，測試從 Drive 下載刪除記錄', 'success')
    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
      console.error('Clear local deleted error:', error)
    }
  }

  // 測試：清理所有 V2 數據
  const testClearAll = async () => {
    if (!confirm('確定要清理所有 V2 數據嗎？（本地 + Drive）')) {
      return
    }

    clearLog()
    addLog('=== 清理所有 V2 數據 ===')
    addLog('')

    const accessToken = getAccessToken()
    if (!accessToken) {
      addLog('未登入，請先登入 Google', 'error')
      return
    }

    try {
      // 清理 Drive
      addLog('清理 Drive...')
      const driveService = new DriveV2Service(accessToken)
      await driveService.initialize()
      await driveService.clearAllData()
      addLog('Drive 已清理', 'success')

      // 清理本地刪除記錄
      addLog('清理本地刪除記錄...')
      try {
        await db.clearDeletedFolders()
        await db.clearDeletedPages()
        addLog('本地刪除記錄已清理', 'success')
      } catch (error) {
        addLog('本地刪除記錄清理失敗（數據庫未升級？），跳過', 'error')
      }

      addLog('')
      addLog('✅ 所有 V2 數據已清理', 'success')

    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
      console.error('Clear all error:', error)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: '#fff',
        border: '3px solid #ec4899',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        width: '600px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#fce7f3',
          borderBottom: '1px solid #f9a8d4',
          fontWeight: '600',
          color: '#9f1239',
          fontSize: '14px',
        }}
      >
        🚀 V2 同步測試面板（新架構）
      </div>

      <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={testFullSync}
          disabled={isSyncing}
          style={{
            padding: '10px 14px',
            backgroundColor: isSyncing ? '#9ca3af' : '#ec4899',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            gridColumn: 'span 2',
          }}
        >
          {isSyncing ? '同步中...' : '執行完整同步'}
        </button>

        <button
          onClick={testViewLocalData}
          style={{
            padding: '8px 12px',
            backgroundColor: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          查看本地數據
        </button>

        <button
          onClick={testViewDriveData}
          style={{
            padding: '8px 12px',
            backgroundColor: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          查看 Drive 數據
        </button>

        <button
          onClick={testClearAll}
          style={{
            padding: '8px 12px',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          🗑️ 清理所有數據
        </button>

        <button
          onClick={clearLog}
          style={{
            padding: '8px 12px',
            backgroundColor: '#6b7280',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          清除日誌
        </button>

        <button
          onClick={testClearLocalDeleted}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f59e0b',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          🧪 清空本地刪除記錄
        </button>

        <button
          onClick={testSimulateConflict}
          style={{
            padding: '8px 12px',
            backgroundColor: '#8b5cf6',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          ⚔️ 模擬衝突場景
        </button>
      </div>

      <div
        style={{
          flex: 1,
          padding: '12px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '11px',
          backgroundColor: '#fafafa',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.5',
        }}
      >
        {log.length === 0 ? '點擊按鈕開始測試 V2 同步架構...' : log.join('\n')}
      </div>

      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#fef3c7',
          borderTop: '1px solid #fbbf24',
          fontSize: '10px',
          color: '#92400e',
        }}
      >
        ⚠️ V2 架構：folders.json + pages.json + page-*.md（細粒度同步）
      </div>
    </div>
  )
}
