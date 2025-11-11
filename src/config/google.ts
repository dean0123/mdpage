/**
 * Google API 配置
 */

export const GOOGLE_CONFIG = {
  // OAuth 客戶端 ID
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,

  // API Scopes - 請求的權限
  scopes: [
    'openid', // OIDC 基本登入
    'profile', // 用戶名稱和頭像
    'email', // 用戶 email
    'https://www.googleapis.com/auth/drive.file', // 只能訪問應用創建的文件（最安全）
  ].join(' '),

  // Discovery Docs - API 規範文件
  discoveryDocs: [
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  ],
}

// 全局類型聲明
declare global {
  interface Window {
    google?: any
    gapi?: any
  }
}
