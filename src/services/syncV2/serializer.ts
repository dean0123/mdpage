/**
 * V2 數據序列化/反序列化
 * 定義 Drive 上的文件格式
 */

import { Folder, Page } from '../db'
import { calculateContentHash } from './hashCalculator'

// ==================== 類型定義 ====================

/**
 * folders.json 格式
 */
export interface FoldersFile {
  version: '2.0'
  lastModified: number
  folders: Folder[]
}

/**
 * deletedFolders.json 格式
 */
export interface DeletedFoldersFile {
  version: '2.0'
  deleted: Array<{
    folderId: string
    deletedAt: number
  }>
}

/**
 * Page 元數據（不含 content）
 */
export interface PageMetadata {
  id: string
  name: string
  folderId: string
  createdAt: number
  updatedAt: number
  contentHash: string  // SHA-256 hash
  contentSize: number  // bytes
}

/**
 * pages.json 格式
 */
export interface PagesFile {
  version: '2.0'
  lastModified: number
  pages: PageMetadata[]
}

/**
 * deletedPages.json 格式
 */
export interface DeletedPagesFile {
  version: '2.0'
  deleted: Array<{
    pageId: string
    deletedAt: number
  }>
}

// ==================== Folders 序列化 ====================

/**
 * 序列化 folders 到 JSON
 */
export function serializeFolders(folders: Folder[]): FoldersFile {
  return {
    version: '2.0',
    lastModified: Date.now(),
    folders: folders.map(f => ({
      ...f,
      // 移除同步相關的臨時字段（如果有）
      driveFileId: undefined,
      lastSyncedAt: undefined,
    } as any)).map(f => {
      // 清理 undefined 字段
      const cleaned: any = {}
      for (const key in f) {
        if (f[key] !== undefined) {
          cleaned[key] = f[key]
        }
      }
      return cleaned as Folder
    })
  }
}

/**
 * 反序列化 folders
 */
export function deserializeFolders(json: string): FoldersFile {
  const data = JSON.parse(json) as FoldersFile

  // 版本檢查
  if (data.version !== '2.0') {
    throw new Error(`Unsupported folders.json version: ${data.version}`)
  }

  return data
}

// ==================== Deleted Folders 序列化 ====================

export function serializeDeletedFolders(
  deleted: Array<{ folderId: string; deletedAt: number }>
): DeletedFoldersFile {
  return {
    version: '2.0',
    deleted
  }
}

export function deserializeDeletedFolders(json: string): DeletedFoldersFile {
  const data = JSON.parse(json) as DeletedFoldersFile

  if (data.version !== '2.0') {
    throw new Error(`Unsupported deletedFolders.json version: ${data.version}`)
  }

  return data
}

// ==================== Pages 序列化 ====================

/**
 * 將 Page[] 轉換為 PageMetadata[]（計算 hash）
 */
export async function serializePages(pages: Page[]): Promise<PagesFile> {
  const metadata: PageMetadata[] = await Promise.all(
    pages.map(async (page) => {
      const contentHash = await calculateContentHash(page.content)
      const contentSize = new Blob([page.content]).size

      return {
        id: page.id,
        name: page.name,
        folderId: page.folderId,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        contentHash,
        contentSize
      }
    })
  )

  return {
    version: '2.0',
    lastModified: Date.now(),
    pages: metadata
  }
}

/**
 * 反序列化 pages.json
 */
export function deserializePages(json: string): PagesFile {
  const data = JSON.parse(json) as PagesFile

  if (data.version !== '2.0') {
    throw new Error(`Unsupported pages.json version: ${data.version}`)
  }

  return data
}

// ==================== Deleted Pages 序列化 ====================

export function serializeDeletedPages(
  deleted: Array<{ pageId: string; deletedAt: number }>
): DeletedPagesFile {
  return {
    version: '2.0',
    deleted
  }
}

export function deserializeDeletedPages(json: string): DeletedPagesFile {
  const data = JSON.parse(json) as DeletedPagesFile

  if (data.version !== '2.0') {
    throw new Error(`Unsupported deletedPages.json version: ${data.version}`)
  }

  return data
}

// ==================== Page Content ====================

/**
 * 序列化單個 page 內容為 Markdown
 */
export function serializePageContent(page: Page): string {
  return page.content
}

/**
 * 反序列化 page 內容
 */
export function deserializePageContent(markdown: string): string {
  return markdown
}

/**
 * 生成 page 文件名
 */
export function getPageFileName(pageId: string): string {
  return `page-${pageId}.md`
}

/**
 * 從文件名解析 page ID
 */
export function parsePageFileName(fileName: string): string | null {
  const match = fileName.match(/^page-(.+)\.md$/)
  return match ? match[1] : null
}
