/**
 * Google 認證服務 - 處理 OAuth 登入流程
 */

import { GOOGLE_CONFIG } from '../../config/google'
import { tokenManager, UserInfo } from './tokenManager'

export interface AuthState {
  isSignedIn: boolean
  isLoading: boolean
  user: UserInfo | null
  error: string | null
}

type AuthStateListener = (state: AuthState) => void

class GoogleAuthService {
  private gisInited = false
  private tokenClient: any = null
  private authState: AuthState = {
    isSignedIn: false,
    isLoading: true,
    user: null,
    error: null,
  }
  private listeners: AuthStateListener[] = []

  /**
   * 初始化 Google API 和 Identity Services
   */
  async initialize(): Promise<void> {
    try {
      // 等待 scripts 載入
      await this.waitForScriptsLoad()

      // 初始化 GAPI Client
      await this.initializeGapiClient()

      // 初始化 GIS (Google Identity Services)
      await this.initializeGisClient()

      // 註冊 token 自動刷新回調
      tokenManager.setRefreshCallback(() => {
        this.refreshToken()
      })

      // 檢查是否有已存在的 token
      this.checkExistingAuth()

      this.updateAuthState({ isLoading: false })
    } catch (error) {
      console.error('Failed to initialize Google Auth:', error)
      this.updateAuthState({
        isLoading: false,
        error: '初始化 Google 認證失敗',
      })
    }
  }

  /**
   * 等待 Google scripts 載入完成
   */
  private waitForScriptsLoad(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Google scripts load timeout'))
      }, 10000)

      const checkInterval = setInterval(() => {
        if (window.gapi && window.google) {
          clearInterval(checkInterval)
          clearTimeout(timeout)
          resolve()
        }
      }, 100)
    })
  }

  /**
   * 初始化 GAPI Client
   */
  private async initializeGapiClient(): Promise<void> {
    return new Promise((resolve, reject) => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            discoveryDocs: GOOGLE_CONFIG.discoveryDocs,
          })

          // 明確加載 Drive API v3
          await window.gapi.client.load('drive', 'v3')

          console.log('GAPI Client initialized with Drive API v3')
          resolve()
        } catch (error) {
          console.error('Failed to initialize GAPI Client:', error)
          reject(error)
        }
      })
    })
  }

  /**
   * 初始化 GIS (Google Identity Services) Client
   */
  private async initializeGisClient(): Promise<void> {
    return new Promise((resolve) => {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.clientId,
        scope: GOOGLE_CONFIG.scopes,
        callback: (response: any) => {
          this.handleAuthResponse(response)
        },
      })
      this.gisInited = true
      resolve()
    })
  }

  /**
   * 處理認證回應
   */
  private async handleAuthResponse(response: any): Promise<void> {
    if (response.error) {
      console.error('Auth error:', response.error)
      this.updateAuthState({
        isSignedIn: false,
        user: null,
        error: response.error,
      })
      return
    }

    // 儲存 token
    tokenManager.saveToken(response.access_token, response.expires_in, response.scope)

    // 設定 GAPI client 的 access token
    window.gapi.client.setToken({
      access_token: response.access_token,
    })

    // 獲取用戶資料
    await this.fetchUserInfo(response.access_token)
  }

  /**
   * 獲取用戶資料
   */
  private async fetchUserInfo(accessToken: string): Promise<void> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch user info')
      }

      const userInfo: UserInfo = await response.json()

      // 儲存用戶資料
      tokenManager.saveUserInfo(userInfo)

      this.updateAuthState({
        isSignedIn: true,
        user: userInfo,
        error: null,
      })
    } catch (error) {
      console.error('Failed to fetch user info:', error)
      this.updateAuthState({
        isSignedIn: false,
        user: null,
        error: '無法獲取用戶資料',
      })
    }
  }

  /**
   * 檢查是否有現有的認證
   */
  private checkExistingAuth(): void {
    const token = tokenManager.getToken()
    const userInfo = tokenManager.getUserInfo()

    if (token && userInfo) {
      // 設定 GAPI client 的 access token
      window.gapi.client.setToken({
        access_token: token,
      })

      this.updateAuthState({
        isSignedIn: true,
        user: userInfo,
        error: null,
      })
    } else {
      // 清除可能存在的無效資料
      tokenManager.clearAll()
    }
  }

  /**
   * 登入
   */
  async signIn(): Promise<void> {
    if (!this.gisInited) {
      throw new Error('Google Identity Services not initialized')
    }

    // 請求 token（會彈出 OAuth 視窗）
    this.tokenClient.requestAccessToken({ prompt: 'consent' })
  }

  /**
   * 靜默刷新 Token（不會彈出視窗）
   */
  private async refreshToken(): Promise<void> {
    if (!this.gisInited) {
      console.error('Cannot refresh token: GIS not initialized')
      return
    }

    try {
      // 使用空的 prompt 進行靜默刷新（不會彈出視窗）
      this.tokenClient.requestAccessToken({ prompt: '' })
      console.log('Token 靜默刷新成功')
    } catch (error) {
      console.error('Token 靜默刷新失敗:', error)
      // 如果靜默刷新失敗，用戶下次操作時會被要求重新登入
      this.updateAuthState({
        isSignedIn: false,
        user: null,
        error: '登入已過期，請重新登入',
      })
    }
  }

  /**
   * 登出
   */
  async signOut(): Promise<void> {
    const token = tokenManager.getToken()

    if (token) {
      // 撤銷 token
      window.google.accounts.oauth2.revoke(token, () => {
        console.log('Token revoked')
      })
    }

    // 清除 GAPI client token
    if (window.gapi.client.getToken()) {
      window.gapi.client.setToken(null)
    }

    // 清除本地儲存
    tokenManager.clearAll()

    this.updateAuthState({
      isSignedIn: false,
      user: null,
      error: null,
    })
  }

  /**
   * 獲取當前 Access Token
   */
  getAccessToken(): string | null {
    return tokenManager.getToken()
  }

  /**
   * 檢查是否已登入
   */
  isSignedIn(): boolean {
    return this.authState.isSignedIn
  }

  /**
   * 獲取當前用戶資料
   */
  getCurrentUser(): UserInfo | null {
    return this.authState.user
  }

  /**
   * 獲取當前認證狀態
   */
  getAuthState(): AuthState {
    return { ...this.authState }
  }

  /**
   * 訂閱認證狀態變更
   */
  subscribe(listener: AuthStateListener): () => void {
    this.listeners.push(listener)

    // 返回取消訂閱函數
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * 更新認證狀態並通知監聽者
   */
  private updateAuthState(updates: Partial<AuthState>): void {
    this.authState = {
      ...this.authState,
      ...updates,
    }

    // 通知所有監聽者
    this.listeners.forEach((listener) => {
      listener(this.getAuthState())
    })
  }
}

// 單例模式
export const googleAuth = new GoogleAuthService()
