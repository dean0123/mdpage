/**
 * 數據檢查面板
 * 檢查 DB 中的所有數據，找出隱藏/孤立的 folders 和 pages
 */

import { useState } from 'react'
import { db } from '../../services/db'

export function DataInspectorPanel() {
  const [log, setLog] = useState<string[]>([])

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const prefix =
      type === 'success' ? '✅' :
      type === 'error' ? '❌' :
      type === 'warn' ? '⚠️' : 'ℹ️'
    setLog(prev => [...prev, `${prefix} ${message}`])
  }

  const clearLog = () => setLog([])

  const inspectData = async () => {
    clearLog()
    addLog('=== 數據庫檢查 ===')
    addLog('')

    try {
      const allFolders = await db.getAllFolders()
      const allPages = await db.getAllPages()

      addLog(`📊 總計：${allFolders.length} 個 folders，${allPages.length} 個 pages`)
      addLog('')

      // 分析 Folders
      addLog('📁 Folders 分析：')
      const rootFolders = allFolders.filter(f => f.parentId === null)
      const subFolders = allFolders.filter(f => f.parentId !== null)

      addLog(`  根 folders: ${rootFolders.length} 個`)
      rootFolders.forEach(f => {
        addLog(`    - ${f.name} (${f.id})`)
      })

      addLog('')
      addLog(`  子 folders: ${subFolders.length} 個`)

      // 檢查孤立的子 folders（parentId 指向不存在的 folder）
      const folderIds = new Set(allFolders.map(f => f.id))
      const orphanedSubFolders = subFolders.filter(f => !folderIds.has(f.parentId!))

      if (orphanedSubFolders.length > 0) {
        addLog(`  ⚠️  孤立子 folders: ${orphanedSubFolders.length} 個`, 'warn')
        orphanedSubFolders.forEach(f => {
          addLog(`    - ${f.name} (${f.id}) → parentId: ${f.parentId}`, 'warn')
        })
      } else {
        addLog(`  ✅ 無孤立子 folders`, 'success')
      }

      // 檢查 _restored, _conflict 等測試數據
      const testFolders = allFolders.filter(f =>
        f.name.includes('_restored') ||
        f.name.includes('_conflict') ||
        f.name.includes('test') ||
        f.name.includes('Test')
      )

      if (testFolders.length > 0) {
        addLog('')
        addLog(`  ⚠️  測試 folders: ${testFolders.length} 個`, 'warn')
        testFolders.forEach(f => {
          addLog(`    - ${f.name} (${f.id})`, 'warn')
        })
      }

      // 分析 Pages
      addLog('')
      addLog('📄 Pages 分析：')

      // 按 folder 分組
      const pagesByFolder = new Map<string, number>()
      for (const page of allPages) {
        pagesByFolder.set(page.folderId, (pagesByFolder.get(page.folderId) || 0) + 1)
      }

      addLog(`  分布在 ${pagesByFolder.size} 個 folders 中`)

      // 檢查孤立的 pages（folderId 指向不存在的 folder）
      const orphanedPages = allPages.filter(p => !folderIds.has(p.folderId))

      if (orphanedPages.length > 0) {
        addLog('')
        addLog(`  ⚠️  孤立 pages: ${orphanedPages.length} 個`, 'warn')
        addLog(`  （這些 pages 的 folder 已被刪除）`, 'warn')

        // 統計孤立 pages 的 folderId
        const orphanedByFolder = new Map<string, number>()
        for (const page of orphanedPages) {
          orphanedByFolder.set(page.folderId, (orphanedByFolder.get(page.folderId) || 0) + 1)
        }

        orphanedByFolder.forEach((count, folderId) => {
          addLog(`    - folderId: ${folderId} → ${count} 個 pages`, 'warn')
        })
      } else {
        addLog(`  ✅ 無孤立 pages`, 'success')
      }

      // 顯示每個 folder 的 page 數量
      addLog('')
      addLog('每個 folder 的 page 數量：')
      for (const folder of allFolders) {
        const count = pagesByFolder.get(folder.id) || 0
        if (count > 0) {
          addLog(`  ${folder.name}: ${count} 個 pages`)
        }
      }

      // 總結
      addLog('')
      addLog('=== 總結 ===')
      if (orphanedSubFolders.length > 0 || orphanedPages.length > 0 || testFolders.length > 0) {
        addLog('發現異常數據：', 'warn')
        if (testFolders.length > 0) {
          addLog(`  - ${testFolders.length} 個測試 folders`, 'warn')
        }
        if (orphanedSubFolders.length > 0) {
          addLog(`  - ${orphanedSubFolders.length} 個孤立子 folders`, 'warn')
        }
        if (orphanedPages.length > 0) {
          addLog(`  - ${orphanedPages.length} 個孤立 pages`, 'warn')
        }
        addLog('建議清理這些數據', 'warn')
      } else {
        addLog('✅ 數據結構正常', 'success')
      }

    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
    }
  }

  const cleanupOrphanedData = async () => {
    if (!confirm('確定要清理孤立數據嗎？\n\n這會刪除：\n1. 孤立的子 folders\n2. 孤立的 pages\n3. 測試 folders (_restored, _conflict 等)')) {
      return
    }

    clearLog()
    addLog('=== 清理孤立數據 ===')
    addLog('')

    try {
      const allFolders = await db.getAllFolders()
      const allPages = await db.getAllPages()
      const folderIds = new Set(allFolders.map(f => f.id))

      let deletedFolders = 0
      let deletedPages = 0

      // 1. 刪除孤立的子 folders
      addLog('清理孤立子 folders...')
      const orphanedSubFolders = allFolders.filter(
        f => f.parentId !== null && !folderIds.has(f.parentId!)
      )
      for (const folder of orphanedSubFolders) {
        await db.deleteFolder(folder.id)
        addLog(`  刪除: ${folder.name}`)
        deletedFolders++
      }

      // 2. 刪除測試 folders
      addLog('清理測試 folders...')
      const testFolders = allFolders.filter(f =>
        f.name.includes('_restored') ||
        f.name.includes('_conflict') ||
        f.name.includes('test') ||
        f.name.includes('Test')
      )
      for (const folder of testFolders) {
        await db.deleteFolder(folder.id)
        addLog(`  刪除: ${folder.name}`)
        deletedFolders++
      }

      // 3. 刪除孤立的 pages
      addLog('清理孤立 pages...')
      const orphanedPages = allPages.filter(p => !folderIds.has(p.folderId))
      for (const page of orphanedPages) {
        await db.deletePage(page.id)
        addLog(`  刪除: ${page.name} (folderId: ${page.folderId})`)
        deletedPages++
      }

      addLog('')
      addLog(`✅ 清理完成`, 'success')
      addLog(`  刪除 ${deletedFolders} 個 folders`)
      addLog(`  刪除 ${deletedPages} 個 pages`)
      addLog('')
      addLog('請刷新頁面查看結果')

    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '550px',
        backgroundColor: '#fff',
        border: '2px solid #f59e0b',
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
          backgroundColor: '#fef3c7',
          borderBottom: '1px solid #fbbf24',
          fontWeight: '600',
          color: '#92400e',
        }}
      >
        🔍 數據檢查工具
      </div>

      <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={inspectData}
          style={{
            padding: '10px 14px',
            backgroundColor: '#f59e0b',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          檢查數據
        </button>

        <button
          onClick={cleanupOrphanedData}
          style={{
            padding: '10px 14px',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          清理孤立數據
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
            gridColumn: 'span 2',
          }}
        >
          清除日誌
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
        {log.length === 0 ? '點擊「檢查數據」開始分析...' : log.join('\n')}
      </div>
    </div>
  )
}
