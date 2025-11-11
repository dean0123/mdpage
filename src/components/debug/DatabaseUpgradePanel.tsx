/**
 * 數據庫升級工具
 * 手動升級 IndexedDB 到 V2
 */

import React, { useState } from 'react'

export function DatabaseUpgradePanel() {
  const [log, setLog] = useState<string[]>([])

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'
    setLog(prev => [...prev, `${prefix} ${message}`])
  }

  const clearLog = () => setLog([])

  const forceUpgrade = async () => {
    if (!confirm('確定要強制升級數據庫到 V2 嗎？\n\n這會：\n1. 刪除現有數據庫\n2. 重新創建 V2 數據庫\n3. 保留所有數據\n\n⚠️ 請確保已備份重要數據！')) {
      return
    }

    clearLog()
    addLog('=== 強制升級數據庫到 V2 ===')
    addLog('')

    try {
      // 1. 讀取現有數據
      addLog('1. 讀取現有數據...')
      const dbName = 'MarkdownEditorDB'

      // 先打開當前版本（不指定版本號，自動使用現有版本）
      const openRequest = indexedDB.open(dbName)

      const oldData = await new Promise<{ folders: any[], pages: any[] }>((resolve, reject) => {
        openRequest.onsuccess = () => {
          const db = openRequest.result
          const currentVersion = db.version
          addLog(`  當前數據庫版本：${currentVersion}`)

          try {
            // 讀取 folders
            const folderTx = db.transaction(['folders'], 'readonly')
            const folderStore = folderTx.objectStore('folders')
            const foldersRequest = folderStore.getAll()

            foldersRequest.onsuccess = () => {
              const folders = foldersRequest.result

              // 讀取 pages
              const pageTx = db.transaction(['pages'], 'readonly')
              const pageStore = pageTx.objectStore('pages')
              const pagesRequest = pageStore.getAll()

              pagesRequest.onsuccess = () => {
                const pages = pagesRequest.result
                db.close()
                resolve({ folders, pages })
              }

              pagesRequest.onerror = () => {
                db.close()
                reject(pagesRequest.error)
              }
            }

            foldersRequest.onerror = () => {
              db.close()
              reject(foldersRequest.error)
            }
          } catch (error) {
            db.close()
            reject(error)
          }
        }

        openRequest.onerror = () => reject(openRequest.error)
      })

      addLog(`  讀取成功：${oldData.folders.length} 個 folders，${oldData.pages.length} 個 pages`)

      // 2. 刪除舊數據庫
      addLog('2. 刪除舊數據庫...')
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName)
        deleteRequest.onsuccess = () => resolve()
        deleteRequest.onerror = () => reject(deleteRequest.error)
      })
      addLog('  刪除成功')

      // 3. 創建 V2 數據庫
      addLog('3. 創建 V2 數據庫...')
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const openRequest = indexedDB.open(dbName, 2)

        openRequest.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result

          // 創建 folders
          if (!db.objectStoreNames.contains('folders')) {
            const folderStore = db.createObjectStore('folders', { keyPath: 'id' })
            folderStore.createIndex('parentId', 'parentId', { unique: false })
          }

          // 創建 pages
          if (!db.objectStoreNames.contains('pages')) {
            const pageStore = db.createObjectStore('pages', { keyPath: 'id' })
            pageStore.createIndex('folderId', 'folderId', { unique: false })
          }

          // V2: 創建刪除追蹤
          if (!db.objectStoreNames.contains('deletedFolders')) {
            db.createObjectStore('deletedFolders', { keyPath: 'folderId' })
          }

          if (!db.objectStoreNames.contains('deletedPages')) {
            db.createObjectStore('deletedPages', { keyPath: 'pageId' })
          }
        }

        openRequest.onsuccess = () => resolve(openRequest.result)
        openRequest.onerror = () => reject(openRequest.error)
      })

      addLog('  V2 數據庫創建成功')

      // 4. 恢復數據
      addLog('4. 恢復數據...')

      // 恢復 folders
      const folderTx = db.transaction(['folders'], 'readwrite')
      const folderStore = folderTx.objectStore('folders')
      for (const folder of oldData.folders) {
        folderStore.add(folder)
      }
      await new Promise<void>((resolve, reject) => {
        folderTx.oncomplete = () => resolve()
        folderTx.onerror = () => reject(folderTx.error)
      })
      addLog(`  恢復 ${oldData.folders.length} 個 folders`)

      // 恢復 pages
      const pageTx = db.transaction(['pages'], 'readwrite')
      const pageStore = pageTx.objectStore('pages')
      for (const page of oldData.pages) {
        pageStore.add(page)
      }
      await new Promise<void>((resolve, reject) => {
        pageTx.oncomplete = () => resolve()
        pageTx.onerror = () => reject(pageTx.error)
      })
      addLog(`  恢復 ${oldData.pages.length} 個 pages`)

      db.close()

      addLog('')
      addLog('✅ 數據庫升級完成！', 'success')
      addLog('')
      addLog('請刷新頁面生效', 'success')

    } catch (error: any) {
      addLog(`錯誤：${error.message || error}`, 'error')
      console.error('Database upgrade failed:', error)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: '#fff',
        border: '3px solid #ef4444',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        zIndex: 20000,
        width: '600px',
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: '#fee2e2',
          borderBottom: '2px solid #fecaca',
          fontWeight: '600',
          color: '#991b1b',
          fontSize: '16px',
        }}
      >
        ⚠️ 數據庫升級工具
      </div>

      <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151', marginBottom: '16px' }}>
          <p style={{ marginBottom: '12px' }}>
            <strong>檢測到數據庫未升級到 V2。</strong>
          </p>
          <p style={{ marginBottom: '12px' }}>
            請點擊下方按鈕手動升級：
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>
            <li>保留所有現有數據（folders 和 pages）</li>
            <li>添加刪除追蹤功能（deletedFolders 和 deletedPages）</li>
            <li>升級後需要刷新頁面</li>
          </ul>
        </div>

        <button
          onClick={forceUpgrade}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          強制升級數據庫到 V2
        </button>

        {log.length > 0 && (
          <button
            onClick={clearLog}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '8px 12px',
              backgroundColor: '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
            }}
          >
            清除日誌
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '12px',
            backgroundColor: '#fafafa',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.6',
          }}
        >
          {log.join('\n')}
        </div>
      )}
    </div>
  )
}
