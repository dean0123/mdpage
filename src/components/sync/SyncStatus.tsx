/**
 * 同步狀態組件
 * 顯示為浮動面板，可展開查看詳細資訊
 */

import { useState } from 'react'
import { syncManagerV2 } from '../../services/syncV2/syncManagerV2'
import { useAuth } from '../../contexts/AuthContext'

type Status = 'idle' | 'syncing' | 'success' | 'error'

interface SyncResult {
  success: boolean
  foldersUploaded: number
  foldersDownloaded: number
  foldersDeleted: number
  pagesUploaded: number
  pagesDownloaded: number
  pagesDeleted: number
  conflicts: number
  errors: string[]
}

export function SyncStatus() {
  const { isSignedIn, getAccessToken } = useAuth()
  const [status, setStatus] = useState<Status>('idle')
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // 如果未登入，不顯示
  if (!isSignedIn) {
    return null
  }

  const handleManualSync = async () => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      setStatus('error')
      setLastResult({
        success: false,
        foldersUploaded: 0,
        foldersDownloaded: 0,
        foldersDeleted: 0,
        pagesUploaded: 0,
        pagesDownloaded: 0,
        pagesDeleted: 0,
        conflicts: 0,
        errors: ['未登入']
      })
      return
    }

    try {
      setStatus('syncing')
      const result = await syncManagerV2.performSync(accessToken)
      setStatus(result.success ? 'success' : 'error')
      setLastResult(result)
      if (result.success) {
        setLastSyncTime(Date.now())
      }
    } catch (error: any) {
      console.error('Manual sync failed:', error)
      setStatus('error')
      setLastResult({
        success: false,
        foldersUploaded: 0,
        foldersDownloaded: 0,
        foldersDeleted: 0,
        pagesUploaded: 0,
        pagesDownloaded: 0,
        pagesDeleted: 0,
        conflicts: 0,
        errors: [error.message || '同步失敗']
      })
    }
  }

  const handleCleanup = async () => {
    alert('V2 架構不需要清理孤立檔案\n\n新的同步機制已自動處理數據一致性')
  }

  // 狀態圖示和顏色
  const getStatusDisplay = () => {
    switch (status) {
      case 'idle':
        return { icon: '○', color: '#9ca3af', text: '未同步', bg: '#f3f4f6' }
      case 'syncing':
        return { icon: '↻', color: '#3b82f6', text: '同步中...', bg: '#dbeafe' }
      case 'success':
        return { icon: '✓', color: '#10b981', text: '已同步', bg: '#d1fae5' }
      case 'error':
        return { icon: '✗', color: '#ef4444', text: '同步失敗', bg: '#fee2e2' }
    }
  }

  const statusDisplay = getStatusDisplay()

  // 格式化上次同步時間
  const formatLastSyncTime = () => {
    if (!lastSyncTime) return ''
    const now = Date.now()
    const diff = now - lastSyncTime
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} 天前`
    if (hours > 0) return `${hours} 小時前`
    if (minutes > 0) return `${minutes} 分鐘前`
    return '剛才'
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: '#fff',
        border: `2px solid ${statusDisplay.color}`,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999,
        minWidth: isExpanded ? '400px' : '200px',
        maxWidth: '500px',
      }}
    >
      {/* 標題列 - 可點擊展開/收合 */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          backgroundColor: statusDisplay.bg,
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '18px',
              color: statusDisplay.color,
              fontWeight: '600',
              animation: status === 'syncing' ? 'spin 1s linear infinite' : 'none',
            }}
          >
            {statusDisplay.icon}
          </span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
            Google Drive 同步
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {/* 內容區 */}
      <div style={{ padding: '12px 16px' }}>
        {/* 狀態文字 */}
        <div style={{ marginBottom: '8px' }}>
          <span
            style={{
              fontSize: '13px',
              color: statusDisplay.color,
              fontWeight: '600',
            }}
          >
            {statusDisplay.text}
          </span>
          {lastSyncTime && (
            <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>
              {formatLastSyncTime()}
            </span>
          )}
        </div>

        {/* 手動同步按鈕 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: isExpanded ? '12px' : '0' }}>
          <button
            onClick={handleManualSync}
            disabled={status === 'syncing'}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '13px',
              backgroundColor: status === 'syncing' ? '#e5e7eb' : '#3b82f6',
              color: status === 'syncing' ? '#9ca3af' : '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: status === 'syncing' ? 'not-allowed' : 'pointer',
              fontWeight: '500',
            }}
          >
            {status === 'syncing' ? '同步中...' : '手動同步'}
          </button>

          {isExpanded && (
            <button
              onClick={handleCleanup}
              disabled={status === 'syncing'}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                backgroundColor: status === 'syncing' ? '#e5e7eb' : '#f59e0b',
                color: status === 'syncing' ? '#9ca3af' : '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: status === 'syncing' ? 'not-allowed' : 'pointer',
                fontWeight: '500',
              }}
              title="清理孤立的 .ppage 檔案"
            >
              🧹
            </button>
          )}
        </div>

        {/* 展開的詳細資訊 */}
        {isExpanded && (
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '12px',
              fontSize: '12px',
              color: '#4b5563',
            }}
          >
            {/* 同步結果摘要 */}
            {lastResult && status === 'success' && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: '600', marginBottom: '6px', color: '#374151' }}>
                  上次同步結果：
                </div>
                <div style={{ display: 'grid', gap: '4px' }}>
                  {(lastResult.foldersUploaded > 0 || lastResult.pagesUploaded > 0) && (
                    <div>
                      ↑ 上傳：<strong>{lastResult.foldersUploaded}</strong> 個檔案夾、<strong>{lastResult.pagesUploaded}</strong> 個頁面
                    </div>
                  )}
                  {(lastResult.foldersDownloaded > 0 || lastResult.pagesDownloaded > 0) && (
                    <div>
                      ↓ 下載：<strong>{lastResult.foldersDownloaded}</strong> 個檔案夾、<strong>{lastResult.pagesDownloaded}</strong> 個頁面
                    </div>
                  )}
                  {lastResult.conflicts > 0 && (
                    <div style={{ color: '#f59e0b' }}>
                      ⚠ 衝突：<strong>{lastResult.conflicts}</strong> 個（已建立副本）
                    </div>
                  )}
                  {lastResult.foldersUploaded === 0 &&
                    lastResult.foldersDownloaded === 0 &&
                    lastResult.pagesUploaded === 0 &&
                    lastResult.pagesDownloaded === 0 &&
                    lastResult.conflicts === 0 && (
                      <div style={{ color: '#10b981' }}>✓ 無需同步，資料已是最新</div>
                    )}
                </div>
              </div>
            )}

            {/* 錯誤訊息 */}
            {lastResult && lastResult.errors.length > 0 && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '4px',
                  padding: '8px',
                  marginBottom: '8px',
                }}
              >
                <div style={{ fontWeight: '600', marginBottom: '6px', color: '#dc2626' }}>
                  錯誤訊息：
                </div>
                <div
                  style={{
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontSize: '11px',
                    color: '#991b1b',
                  }}
                >
                  {lastResult.errors.map((error, i) => (
                    <div key={i} style={{ marginBottom: '4px' }}>
                      • {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 說明文字 */}
            <div
              style={{
                fontSize: '11px',
                color: '#9ca3af',
                marginTop: '8px',
                lineHeight: '1.5',
              }}
            >
              <strong>同步規則：</strong>
              <br />
              • 只有根目錄會同步到 Drive（含所有子目錄和頁面）
              <br />
              • 保留原始的創建時間和排序
              <br />
              • 自動同步：已停用（僅手動同步）
              <br />
              <br />
              <strong>清理按鈕 🧹：</strong>
              <br />
              刪除 Drive 上錯誤的子目錄 .ppage 檔案
            </div>
          </div>
        )}
      </div>

      {/* 旋轉動畫 CSS */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
