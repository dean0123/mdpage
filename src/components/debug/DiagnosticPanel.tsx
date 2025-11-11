/**
 * 診斷面板 - 用於檢查數據庫狀態
 */

import React, { useState } from 'react'
import { db } from '../../services/db'

export function DiagnosticPanel() {
  const [info, setInfo] = useState<string>('')

  const handleDiagnose = async () => {
    const lines: string[] = []

    lines.push('=== 數據庫診斷報告 ===\n')

    // 1. 檢查所有 folders
    const allFolders = await db.getAllFolders()
    lines.push(`📁 總共 ${allFolders.length} 個 folders：\n`)

    for (const folder of allFolders) {
      const parentInfo = folder.parentId
        ? `子目錄 (parent: ${folder.parentId.substring(0, 15)}...)`
        : '根目錄 (parentId: null)'

      const driveInfo = folder.driveFileId
        ? `✓ 有 driveFileId: ${folder.driveFileId.substring(0, 20)}...`
        : '✗ 無 driveFileId'

      lines.push(`  ${folder.name}`)
      lines.push(`    ID: ${folder.id}`)
      lines.push(`    ${parentInfo}`)
      lines.push(`    ${driveInfo}`)
      lines.push(`    Created: ${new Date(folder.createdAt).toLocaleString()}`)
      lines.push(`    Updated: ${new Date(folder.updatedAt).toLocaleString()}`)
      lines.push(`    Order: ${folder.order}`)
      lines.push('')
    }

    // 2. 檢查根目錄
    const rootFolders = allFolders.filter(f => f.parentId === null)
    lines.push(`\n🌳 根目錄數量: ${rootFolders.length}`)
    rootFolders.forEach(f => {
      lines.push(`  - ${f.name} (ID: ${f.id})`)
    })

    // 3. 檢查有 driveFileId 的 folders
    const foldersWithDrive = allFolders.filter(f => f.driveFileId)
    lines.push(`\n☁️ 有 driveFileId 的 folders: ${foldersWithDrive.length}`)
    foldersWithDrive.forEach(f => {
      const isRoot = f.parentId === null ? '根' : '子'
      lines.push(`  - ${f.name} (${isRoot}目錄)`)
    })

    // 4. 檢查 pages
    const allPages = await db.getAllPages()
    lines.push(`\n📄 總共 ${allPages.length} 個 pages`)

    // 5. 檢查層級結構
    lines.push(`\n🔗 層級結構：`)
    for (const root of rootFolders) {
      lines.push(`  ${root.name} (根)`)
      const children = allFolders.filter(f => f.parentId === root.id)
      for (const child of children) {
        lines.push(`    └─ ${child.name}`)
        const pages = allPages.filter(p => p.folderId === child.id)
        pages.forEach(p => {
          lines.push(`       └─ ${p.name}`)
        })
      }
      const rootPages = allPages.filter(p => p.folderId === root.id)
      rootPages.forEach(p => {
        lines.push(`    └─ ${p.name}`)
      })
    }

    setInfo(lines.join('\n'))
  }

  const handleClearDriveIds = async () => {
    if (!confirm('確定要清除所有 driveFileId 嗎？\n\n這會讓所有 folder 重新上傳到 Drive。')) {
      return
    }

    const allFolders = await db.getAllFolders()
    for (const folder of allFolders) {
      if (folder.driveFileId) {
        await db.updateFolder({
          ...folder,
          driveFileId: undefined,
          lastSyncedAt: undefined,
        })
      }
    }

    alert('已清除所有 driveFileId')
    handleDiagnose()
  }

  const handleExportReport = () => {
    const blob = new Blob([info], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagnostic-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: '#fff',
        border: '2px solid #6b7280',
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
          backgroundColor: '#f3f4f6',
          borderBottom: '1px solid #d1d5db',
          fontWeight: '600',
        }}
      >
        🔍 數據庫診斷工具
      </div>

      <div style={{ padding: '16px', display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={handleDiagnose}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          執行診斷
        </button>

        <button
          onClick={handleClearDriveIds}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f59e0b',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500',
          }}
        >
          清除 driveFileId
        </button>

        <button
          onClick={handleExportReport}
          disabled={!info}
          style={{
            padding: '8px 16px',
            backgroundColor: info ? '#10b981' : '#e5e7eb',
            color: info ? '#fff' : '#9ca3af',
            border: 'none',
            borderRadius: '4px',
            cursor: info ? 'pointer' : 'not-allowed',
            fontWeight: '500',
          }}
        >
          匯出報告
        </button>
      </div>

      <div
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '12px',
          whiteSpace: 'pre-wrap',
          backgroundColor: '#fafafa',
        }}
      >
        {info || '點擊「執行診斷」查看數據庫狀態'}
      </div>
    </div>
  )
}
