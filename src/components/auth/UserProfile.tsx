/**
 * 用戶資料顯示組件 - 圓形頭像設計
 */

import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

export function UserProfile() {
  const { user, signOut } = useAuth()
  const [showMenu, setShowMenu] = useState(false)

  if (!user) return null

  const handleSignOut = async () => {
    try {
      await signOut()
      setShowMenu(false)
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* 用戶頭像按鈕 - 只顯示圓形頭像 */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        title={user.name}
        style={{
          width: '40px',
          height: '40px',
          padding: '0',
          backgroundColor: 'transparent',
          border: '2px solid transparent',
          borderRadius: '50%',
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#dadce0'
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <img
          src={user.picture}
          alt={user.name}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            objectFit: 'cover',
          }}
        />
      </button>

      {/* 下拉選單 */}
      {showMenu && (
        <>
          {/* 背景遮罩 */}
          <div
            onClick={() => setShowMenu(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
          />

          {/* 選單內容 - 向右上彈出 */}
          <div
            style={{
              position: 'absolute',
              bottom: '0',
              left: 'calc(100% + 8px)',
              minWidth: '250px',
              backgroundColor: '#fff',
              border: '1px solid #dadce0',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              zIndex: 1000,
              overflow: 'hidden',
            }}
          >
            {/* 用戶資訊 */}
            <div
              style={{
                padding: '16px',
                borderBottom: '1px solid #e0e0e0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src={user.picture}
                  alt={user.name}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                  }}
                />
                <div>
                  <div style={{ fontWeight: '500', color: '#202124' }}>{user.name}</div>
                  <div style={{ fontSize: '13px', color: '#5f6368' }}>{user.email}</div>
                </div>
              </div>
            </div>

            {/* 登出按鈕 */}
            <button
              onClick={handleSignOut}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'transparent',
                border: 'none',
                textAlign: 'left',
                fontSize: '14px',
                color: '#3c4043',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8f9fa'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              登出
            </button>
          </div>
        </>
      )}
    </div>
  )
}
