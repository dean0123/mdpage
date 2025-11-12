/**
 * Token 管理器 - 負責 Token 的儲存、讀取、更新和清除
 */

export interface TokenData {
  accessToken: string
  expiresAt: number // 過期時間戳（毫秒）
  scope: string
}

export interface UserInfo {
  id: string
  email: string
  name: string
  picture: string
}

class TokenManager {
  private readonly TOKEN_KEY = 'google_access_token'
  private readonly USER_INFO_KEY = 'google_user_info'
  private refreshTimer: number | null = null
  private refreshCallback: (() => void) | null = null

  /**
   * 設定 Token 刷新回調函數
   */
  setRefreshCallback(callback: () => void): void {
    this.refreshCallback = callback
  }

  /**
   * 儲存 Access Token
   */
  saveToken(token: string, expiresIn: number, scope: string): void {
    try {
      const tokenData: TokenData = {
        accessToken: token,
        expiresAt: Date.now() + expiresIn * 1000, // 轉換為毫秒
        scope,
      }
      // 簡單的 Base64 編碼（防止意外洩漏，但不是真正的加密）
      const encoded = btoa(JSON.stringify(tokenData))
      localStorage.setItem(this.TOKEN_KEY, encoded)

      // 設置自動刷新計時器（在過期前 10 分鐘刷新）
      this.scheduleTokenRefresh(expiresIn)
    } catch (error) {
      console.error('Failed to save token:', error)
    }
  }

  /**
   * 安排 Token 自動刷新
   */
  private scheduleTokenRefresh(expiresIn: number): void {
    // 清除現有的計時器
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    // 在過期前 10 分鐘刷新（但至少在獲取 token 後 5 分鐘才刷新）
    const refreshTime = Math.max(expiresIn - 10 * 60, 5 * 60) * 1000

    console.log(`Token 將在 ${refreshTime / 1000 / 60} 分鐘後自動刷新`)

    this.refreshTimer = window.setTimeout(() => {
      console.log('正在自動刷新 token...')
      if (this.refreshCallback) {
        this.refreshCallback()
      }
    }, refreshTime)
  }

  /**
   * 獲取 Access Token
   */
  getToken(): string | null {
    try {
      const encoded = localStorage.getItem(this.TOKEN_KEY)
      if (!encoded) return null

      const tokenData: TokenData = JSON.parse(atob(encoded))

      // 檢查是否過期（提前 2 分鐘判定過期，因為有自動刷新機制）
      if (Date.now() > tokenData.expiresAt - 2 * 60 * 1000) {
        this.clearToken()
        return null
      }

      return tokenData.accessToken
    } catch (error) {
      console.error('Failed to get token:', error)
      this.clearToken()
      return null
    }
  }

  /**
   * 獲取完整的 Token 資料
   */
  getTokenData(): TokenData | null {
    try {
      const encoded = localStorage.getItem(this.TOKEN_KEY)
      if (!encoded) return null

      const tokenData: TokenData = JSON.parse(atob(encoded))

      // 檢查是否過期（提前 2 分鐘判定過期，因為有自動刷新機制）
      if (Date.now() > tokenData.expiresAt - 2 * 60 * 1000) {
        this.clearToken()
        return null
      }

      return tokenData
    } catch (error) {
      console.error('Failed to get token data:', error)
      this.clearToken()
      return null
    }
  }

  /**
   * 檢查 Token 是否有效
   */
  isTokenValid(): boolean {
    return this.getToken() !== null
  }

  /**
   * 清除 Token
   */
  clearToken(): void {
    try {
      localStorage.removeItem(this.TOKEN_KEY)
      // 清除刷新計時器
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer)
        this.refreshTimer = null
      }
    } catch (error) {
      console.error('Failed to clear token:', error)
    }
  }

  /**
   * 儲存用戶資料
   */
  saveUserInfo(userInfo: UserInfo): void {
    try {
      localStorage.setItem(this.USER_INFO_KEY, JSON.stringify(userInfo))
    } catch (error) {
      console.error('Failed to save user info:', error)
    }
  }

  /**
   * 獲取用戶資料
   */
  getUserInfo(): UserInfo | null {
    try {
      const stored = localStorage.getItem(this.USER_INFO_KEY)
      if (!stored) return null
      return JSON.parse(stored)
    } catch (error) {
      console.error('Failed to get user info:', error)
      return null
    }
  }

  /**
   * 清除用戶資料
   */
  clearUserInfo(): void {
    try {
      localStorage.removeItem(this.USER_INFO_KEY)
    } catch (error) {
      console.error('Failed to clear user info:', error)
    }
  }

  /**
   * 清除所有認證資料
   */
  clearAll(): void {
    this.clearToken()
    this.clearUserInfo()
  }
}

// 單例模式
export const tokenManager = new TokenManager()
