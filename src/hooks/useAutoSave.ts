/**
 * useAutoSave Hook
 * 封装自动保存逻辑和 timer 管理
 */

import { useRef, useCallback } from 'react'

export type SyncStatus = 'saved' | 'saving' | 'unsaved'

interface UseAutoSaveOptions {
  delay?: number // 自动保存延迟时间（毫秒），默认 500ms
  onSave: (content: string) => Promise<void> // 保存函数
  onStatusChange?: (status: SyncStatus) => void // 状态变化回调
}

interface UseAutoSaveReturn {
  scheduleAutoSave: (content: string) => void // 调度自动保存
  clearAutoSave: () => void // 清除自动保存
  saveNow: (content: string) => Promise<void> // 立即保存
}

/**
 * 自动保存 Hook
 * @param options 配置选项
 * @returns 自动保存相关函数
 */
export const useAutoSave = (options: UseAutoSaveOptions): UseAutoSaveReturn => {
  const { delay = 500, onSave, onStatusChange } = options
  const autoSaveTimer = useRef<number | null>(null)

  /**
   * 清除自动保存 timer
   */
  const clearAutoSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
  }, [])

  /**
   * 调度自动保存（防抖）
   * @param content 要保存的内容
   */
  const scheduleAutoSave = useCallback(
    (content: string) => {
      // 设置为未保存状态
      onStatusChange?.('unsaved')

      // 清除之前的 timer
      clearAutoSave()

      // 设置新的 timer
      autoSaveTimer.current = window.setTimeout(() => {
        saveNow(content)
      }, delay)
    },
    [delay, clearAutoSave, onStatusChange]
  )

  /**
   * 立即保存
   * @param content 要保存的内容
   */
  const saveNow = useCallback(
    async (content: string) => {
      clearAutoSave()
      onStatusChange?.('saving')

      try {
        await onSave(content)
        onStatusChange?.('saved')
      } catch (error) {
        console.error('Auto save failed:', error)
        onStatusChange?.('unsaved')
      }
    },
    [onSave, clearAutoSave, onStatusChange]
  )

  return {
    scheduleAutoSave,
    clearAutoSave,
    saveNow,
  }
}
