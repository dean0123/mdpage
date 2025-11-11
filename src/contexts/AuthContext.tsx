/**
 * 認證 Context - 提供全局的認證狀態和方法
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { googleAuth, AuthState } from '../services/auth/googleAuth'
import { UserInfo } from '../services/auth/tokenManager'

interface AuthContextType {
  // 認證狀態
  isSignedIn: boolean
  isLoading: boolean
  user: UserInfo | null
  error: string | null

  // 認證方法
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  getAccessToken: () => string | null
}

const AuthContext = createContext<AuthContextType | null>(null)

/**
 * AuthProvider - 認證狀態提供者
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isSignedIn: false,
    isLoading: true,
    user: null,
    error: null,
  })

  useEffect(() => {
    // 初始化 Google Auth
    googleAuth.initialize()

    // 訂閱認證狀態變更
    const unsubscribe = googleAuth.subscribe((newState) => {
      setAuthState(newState)
    })

    // 清理訂閱
    return () => {
      unsubscribe()
    }
  }, [])

  // 監聽登入狀態變化，執行自動同步
  useEffect(() => {
    if (authState.isSignedIn) {
      // 用戶已登入
      console.log('✅ User signed in')
      console.log('⚠️  自動同步已完全停用，請使用測試面板手動測試')

      // ⛔ 完全停用自動同步 - 階段 2 測試期間
      // 等所有測試通過後再啟用
      // const timer = setTimeout(async () => {
      //   try {
      //     console.log('Starting initial sync after login...')
      //     await syncManager.performFullSync()
      //     syncManager.startAutoSync(5 * 60 * 1000)
      //   } catch (error) {
      //     console.error('Initial sync failed:', error)
      //   }
      // }, 2000)
      // return () => clearTimeout(timer)
    } else {
      // 用戶已登出
      console.log('User signed out')
      // V2 同步：自動同步已停用，無需調用 stopAutoSync
    }
  }, [authState.isSignedIn])

  const signIn = async () => {
    try {
      await googleAuth.signIn()
    } catch (error) {
      console.error('Sign in failed:', error)
    }
  }

  const signOut = async () => {
    try {
      await googleAuth.signOut()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  const getAccessToken = () => {
    return googleAuth.getAccessToken()
  }

  const value: AuthContextType = {
    isSignedIn: authState.isSignedIn,
    isLoading: authState.isLoading,
    user: authState.user,
    error: authState.error,
    signIn,
    signOut,
    getAccessToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * useAuth Hook - 便捷地使用認證 Context
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
