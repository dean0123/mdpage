import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { wrappingInputRule, InputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { marked } from 'marked'
import Sidebar from './Sidebar'
import LinkDialog from './editor/LinkDialog'
import { db, Page } from '../services/db'
import { storage } from '../services/storage'
import { ensureFolderAndPage } from '../services/pageHelper'
import { getMarkdownFromEditor, extractPageTitle } from '../utils/markdownConverter'
import '../styles/editor.css'

// HTML 转义函数
const escapeHtml = (text: string): string => {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (char) => map[char])
}

// 配置 marked：啟用 GFM 並自定義 renderer
marked.use({
  gfm: true,  // 啟用 GitHub Flavored Markdown
  breaks: false,
})

// 自定義 renderer 來生成 Tiptap 期望的 HTML 結構
marked.use({
  renderer: {
    code(code: string, language: string | undefined) {
      const lang = language || ''
      const langClass = lang ? ` class="language-${lang}" data-language="${lang}"` : ''
      // 确保 HTML 代码被正确转义
      const escapedCode = escapeHtml(code)
      // 將 class 添加到 <pre> 標籤，而不是 <code> 標籤
      return `<pre${langClass}><code>${escapedCode}</code></pre>`
    },
    list(body: string, ordered: boolean) {
      // 檢測是否為 task list（包含 data-type="taskItem" 的項目）
      const isTaskList = body.includes('data-type="taskItem"')
      const tag = ordered ? 'ol' : 'ul'
      const typeAttr = isTaskList ? ' data-type="taskList"' : ''
      return `<${tag}${typeAttr}>\n${body}</${tag}>\n`
    },
    listitem(text: string, task: boolean, checked: boolean) {
      // marked 的 GFM 會自動解析 task list 並設置 task 和 checked 參數
      if (task) {
        // 這是一個 task list item
        return `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? ' checked' : ''}><span>${text}</span></label></li>\n`
      }
      // 普通列表項
      return `<li>${text}</li>\n`
    }
  }
})

// 輔助函數：將 Markdown 轉換為 HTML，並修復 marked 在 code block 末尾添加的換行符
const markdownToHtml = (markdown: string): string => {
  let html = marked(markdown) as string
  // marked 會在 code block 內容末尾添加 \n，導致來回切換時累積空行
  // 例如：<code>line1\nline2\n</code> → <code>line1\nline2</code>
  html = html.replace(/\n(<\/code>)/g, '$1')
  return html
}

const MarkdownEditor = () => {
  // 初始 Markdown 內容
  const initialMarkdown = ''

  // 主要數據：Markdown 文本
  const [markdownText, setMarkdownText] = useState(initialMarkdown)
  const [isMarkdownMode, setIsMarkdownMode] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [showImageMenu, setShowImageMenu] = useState(false)
  const [imageMenuPosition, setImageMenuPosition] = useState({ x: 0, y: 0 })
  const [selectedImageNode, setSelectedImageNode] = useState<HTMLImageElement | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [currentPage, setCurrentPage] = useState<Page | null>(null)
  const [dbInitialized, setDbInitialized] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // 圖片 ID 到 blob URL 的映射
  const imageBlobUrlMap = useRef<Map<string, string>>(new Map())

  // 刷新觸發器：用於通知 Sidebar 刷新 FolderTree 和 PageList
  const [triggerRefresh, setTriggerRefresh] = useState(0)

  // 同步狀態：'saved' | 'saving' | 'unsaved'
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  // 用於防止在同步時觸發循環更新
  const isSyncingFromMarkdown = useRef(false)
  const autoSaveTimer = useRef<number | null>(null)
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const isInitialLoad = useRef(true) // 追蹤是否為首次載入

  // 統一的保存函數
  const saveCurrentPage = async (content: string): Promise<void> => {
    setSyncStatus('saving')

    try {
      const newTitle = extractPageTitle(content)

      // 獲取編輯器狀態
      const cursorPosition = editor?.state.selection.from || 0
      const scrollTop = editorScrollRef.current?.scrollTop || 0

      // 如果沒有當前頁面，自動創建新頁面
      if (!currentPage) {
        // 如果沒有選中文件夾，無法創建頁面
        if (!selectedFolderId) {
          setSyncStatus('saved')
          return
        }

        // 創建新頁面
        const newPage: Page = {
          id: `page-${Date.now()}`,
          folderId: selectedFolderId,
          name: newTitle,
          content: content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          editorState: {
            cursorPosition,
            scrollTop,
          },
        }

        await db.createPage(newPage)
        setCurrentPage(newPage)
        setSyncStatus('saved')
        return
      }

      // 更新現有頁面
      const updatedPage = {
        ...currentPage,
        name: newTitle,
        content: content,
        updatedAt: Date.now(),
        editorState: {
          cursorPosition,
          scrollTop,
        },
      }

      await db.updatePage(updatedPage)
      setCurrentPage(updatedPage)
      setSyncStatus('saved')
    } catch (error) {
      console.error('Save failed:', error)
      setSyncStatus('unsaved')
    }
  }

  // 初始化 IndexedDB 並恢復上次選擇的狀態
  useEffect(() => {
    const initDB = async () => {
      try {
        await db.init()
        setDbInitialized(true)

        // 恢復上次選擇的 folder 和 page
        const savedState = storage.getState()
        if (savedState.selectedFolderId) {
          setSelectedFolderId(savedState.selectedFolderId)
        }

        if (savedState.selectedPageId) {
          try {
            const page = await db.getPage(savedState.selectedPageId)
            if (page) {
              setCurrentPage(page)
              setMarkdownText(page.content)

              // 延遲恢復游標位置，等待編輯器完全加載
              setTimeout(() => {
                if (savedState.cursorPosition !== null && editor) {
                  editor.commands.focus()
                  editor.commands.setTextSelection(savedState.cursorPosition)
                }
              }, 100)
            }
          } catch (error) {
            console.error('Failed to restore page:', error)
          }
        }
      } catch (error) {
        console.error('Failed to initialize database:', error)
      }
    }
    initDB()
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false, // 禁用 StarterKit 的默認 code，我們將自定義配置
        codeBlock: false, // 禁用 StarterKit 的 codeBlock，使用自定义配置
      }),
      Code.extend({
        // 允許 code 與其他 marks（如 link）共存
        excludes: '',
      }).configure({
        HTMLAttributes: {
          class: 'inline-code',
        },
      }),
      CodeBlock.extend({
        addAttributes() {
          return {
            language: {
              default: null,
              parseHTML: element => element.getAttribute('data-language') || element.className.replace(/^language-/, ''),
              renderHTML: attributes => {
                if (!attributes.language) {
                  return {}
                }
                return {
                  'data-language': attributes.language,
                  class: `language-${attributes.language}`,
                }
              },
            },
          }
        },
      }),
      Placeholder.configure({
        placeholder: `⬆。 綠色按鈕可以輸入/查看 Markdown 本文原碼
        開始直接輸入你的 Pages 內容
        所見即所得 WYSIWYG Markdown 編輯器

        # 空格        大標題 H1
        ## 空格      中標題 H2
        ### 空格    小標題 H3
        >                 為註解
 
        - 空格         為列表
        1.                 為數字列表
        -[ ]  -[x]     ToDo 待辦事項
                       
        ---              三橫線為分割線
        \`\`\`              三個反單引號(前後)為代碼
        行尾兩個空格       可同段換行

      使用工具欄按鈕或鍵盤快捷鍵：
     **粗體**      （Cmd/Ctrl + B）
       *斜體*        （Cmd/Ctrl + I）
       \`代碼\`        （Cmd/Ctrl + E）
        `,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            src: {
              default: null,
              parseHTML: element => {
                // 保存原始的 image:// URL
                return element.getAttribute('src') || element.getAttribute('data-src')
              },
              renderHTML: attributes => {
                if (!attributes.src) return {}

                // 如果是 image:// 協議，暫時返回空的 data URL，稍後通過 useEffect 轉換
                if (attributes.src.startsWith('image://')) {
                  return {
                    'data-src': attributes.src,
                    src: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect fill=\'%23f0f0f0\' width=\'100\' height=\'100\'/%3E%3C/svg%3E'
                  }
                }

                return { src: attributes.src }
              },
            },
            alt: {
              default: null,
              parseHTML: element => element.getAttribute('alt'),
              renderHTML: attributes => {
                if (!attributes.alt) return {}
                return { alt: attributes.alt }
              },
            },
            width: {
              default: null,
              parseHTML: element => element.getAttribute('width'),
              renderHTML: attributes => {
                if (!attributes.width) return {}
                return { width: attributes.width }
              },
            },
            'data-shadow': {
              default: 'true',
              parseHTML: element => element.getAttribute('data-shadow'),
              renderHTML: attributes => {
                return { 'data-shadow': attributes['data-shadow'] || 'true' }
              },
            },
          }
        },
      }).configure({
        inline: true,
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.extend({
        addAttributes() {
          return {
            checked: {
              default: false,
              // 從 HTML 解析時，讀取 data-checked 屬性或 input 的 checked 狀態
              parseHTML: element => {
                // 優先讀取 data-checked 屬性
                const dataChecked = element.getAttribute('data-checked')
                if (dataChecked !== null) {
                  return dataChecked === 'true'
                }
                // 否則讀取 input checkbox 的 checked 狀態
                const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement | null
                return checkbox?.checked || false
              },
              // 渲染時保持原有行為
              renderHTML: attributes => {
                return {
                  'data-checked': attributes.checked,
                }
              },
            },
          }
        },
        addInputRules() {
          return [
            // 快捷輸入：-[ → 空的 checkbox
            wrappingInputRule({
              find: /^-\[\s$/,
              type: this.type,
              getAttributes: () => ({ checked: false }),
            }),
            wrappingInputRule({
              find: /^-\【\s$/,
              type: this.type,
              getAttributes: () => ({ checked: false }),
            }),
            // 快捷輸入：-[x → checked checkbox
            wrappingInputRule({
              find: /^-\[x\s$/,
              type: this.type,
              getAttributes: () => ({ checked: true }),
            }),
            // 快捷輸入：-[X → checked checkbox (大寫也支援)
            wrappingInputRule({
              find: /^-\[X\s$/,
              type: this.type,
              getAttributes: () => ({ checked: true }),
            }),
            // 在 bulletList item 中輸入 [ 空格 → 轉換成空 checkbox
            new InputRule({
              find: /^\[\s$/,
              handler: ({ state, range, chain }) => {
                // 檢查當前是否在 listItem 中
                const { $from } = state.selection
                const listItem = $from.node($from.depth - 1)

                if (listItem && listItem.type.name === 'listItem') {
                  // 檢查父節點是否為 bulletList
                  const list = $from.node($from.depth - 2)
                  if (list && list.type.name === 'bulletList') {
                    // 轉換為 taskList 和 taskItem
                    chain()
                      .deleteRange({ from: range.from, to: range.to })
                      .toggleTaskList()
                      .run()
                  }
                }
              },
            }),
            // 在 bulletList item 中輸入 [x 空格 → 轉換成 checked checkbox
            new InputRule({
              find: /^\[x\s$/i,
              handler: ({ state, range, chain }) => {
                // 檢查當前是否在 listItem 中
                const { $from } = state.selection
                const listItem = $from.node($from.depth - 1)

                if (listItem && listItem.type.name === 'listItem') {
                  // 檢查父節點是否為 bulletList
                  const list = $from.node($from.depth - 2)
                  if (list && list.type.name === 'bulletList') {
                    // 轉換為 taskList 和 taskItem，並設置為 checked
                    chain()
                      .deleteRange({ from: range.from, to: range.to })
                      .toggleTaskList()
                      .updateAttributes('taskItem', { checked: true })
                      .run()
                  }
                }
              },
            }),
          ]
        },
      }).configure({
        nested: true,
      }),
    ],
    content: markdownToHtml(initialMarkdown),
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none',
      },
      handleDOMEvents: {
        focus: () => {
          handleEditorFocus()
          return false
        },
        paste: (view, event) => {
          // 處理圖片貼上
          const items = event.clipboardData?.items
          if (!items) return false

          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (item.type.startsWith('image/')) {
              event.preventDefault()
              const file = item.getAsFile()
              if (file) {
                handleImageUpload(file)
              }
              return true
            }
          }
          return false
        },
        drop: (view, event) => {
          // 處理圖片拖放
          const files = event.dataTransfer?.files
          if (!files || files.length === 0) return false

          for (let i = 0; i < files.length; i++) {
            const file = files[i]
            if (file.type.startsWith('image/')) {
              event.preventDefault()
              handleImageUpload(file)
              return true
            }
          }
          return false
        },
      },
    },
    onUpdate: ({ editor }) => {
      // 每次編輯後，將編輯器內容轉換為 Markdown 並更新狀態
      // 但如果正在從 Markdown 同步，則跳過（避免覆蓋用戶在 MD 模式下的編輯）
      if (!isSyncingFromMarkdown.current) {
        const md = getMarkdownFromEditor(editor)
        setMarkdownText(md)

        // 立即更新頁面名稱（不等待保存）
        if (currentPage) {
          const newTitle = extractPageTitle(md)
          setCurrentPage({
            ...currentPage,
            name: newTitle,
          })
        }

        // 設置為未保存狀態
        setSyncStatus('unsaved')

        // 自動保存到 IndexedDB（防抖 500ms）
        if (autoSaveTimer.current) {
          clearTimeout(autoSaveTimer.current)
        }
        autoSaveTimer.current = setTimeout(() => {
          saveCurrentPage(md)
        }, 500)
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // 保存游標位置
      const { from } = editor.state.selection
      storage.saveCursorPosition(from)
    },
  })

  // 在 Markdown 模式下編輯時也自動更新頁面標題和保存
  useEffect(() => {
    if (isMarkdownMode && currentPage) {
      // 立即更新頁面名稱（不等待保存）
      const newTitle = extractPageTitle(markdownText)
      setCurrentPage({
        ...currentPage,
        name: newTitle,
      })

      // 設置為未保存狀態
      setSyncStatus('unsaved')

      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
      autoSaveTimer.current = setTimeout(() => {
        saveCurrentPage(markdownText)
      }, 500)
    }
  }, [markdownText, isMarkdownMode])

  // 在首次載入時，如果有恢復的 page，將內容設置到編輯器中
  useEffect(() => {
    if (isInitialLoad.current && editor && currentPage && !isMarkdownMode) {
      // 將 markdown 轉換為 HTML 並設置到編輯器
      isSyncingFromMarkdown.current = true
      const html = markdownToHtml(currentPage.content)
      editor.commands.setContent(html || '<p></p>')

      setTimeout(() => {
        isSyncingFromMarkdown.current = false

        // 恢復編輯器狀態
        if (currentPage.editorState) {
          // 恢復光標位置
          if (currentPage.editorState.cursorPosition !== undefined) {
            editor.commands.setTextSelection(currentPage.editorState.cursorPosition)
          }

          // 恢復滾動位置
          if (currentPage.editorState.scrollTop !== undefined && editorScrollRef.current) {
            editorScrollRef.current.scrollTop = currentPage.editorState.scrollTop
          } else if (editorScrollRef.current) {
            // 如果沒有記憶的滾動位置，預設捲到最上方
            editorScrollRef.current.scrollTop = 0
          }
        } else if (editorScrollRef.current) {
          // 如果沒有 editorState，預設捲到最上方
          editorScrollRef.current.scrollTop = 0
        }

        // 標記首次載入完成
        isInitialLoad.current = false
      }, 100)
    }
  }, [editor, currentPage, isMarkdownMode])

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showTableMenu && !target.closest('.toolbar-dropdown')) {
        setShowTableMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTableMenu])

  const handleToggleMarkdownMode = () => {
    if (!isMarkdownMode) {
      // 切换到 Markdown 模式：markdownText 已經是最新的
      setIsMarkdownMode(true)
    } else {
      // 切换回 WYSIWYG 模式：將 Markdown 轉換為 HTML 並設置到編輯器
      isSyncingFromMarkdown.current = true
      const html = markdownToHtml(markdownText)
      editor?.commands.setContent(html)
      setIsMarkdownMode(false)
      // 使用 setTimeout 確保 setContent 完成後再重置標誌
      setTimeout(() => {
        isSyncingFromMarkdown.current = false
        // 手動觸發圖片 URL 轉換
        convertImageUrlsManually()
      }, 0)
    }
  }

  // 手動觸發圖片 URL 轉換的函數
  const convertImageUrlsManually = async () => {
    const images = document.querySelectorAll('img[data-src^="image://"]')

    for (const imgElement of images) {
      const img = imgElement as HTMLImageElement
      const dataSrc = img.getAttribute('data-src')
      if (!dataSrc) continue

      const imageId = dataSrc.replace('image://', '')

      // 首先檢查映射表
      let blobUrl = imageBlobUrlMap.current.get(imageId)

      if (!blobUrl) {
        // 從 IndexedDB 讀取圖片
        try {
          const imageData = await db.getImage(imageId)
          if (imageData) {
            blobUrl = URL.createObjectURL(imageData.blob)
            imageBlobUrlMap.current.set(imageId, blobUrl)
          }
        } catch (error) {
          console.error('無法載入圖片:', imageId, error)
          continue
        }
      }

      // 設置 blob URL
      if (blobUrl) {
        img.src = blobUrl
      }
    }
  }


  const handleSelectPage = async (page: Page) => {
    // 如果選擇的是空頁面（刪除頁面時），清空編輯器
    if (!page.id) {
      // **重要：清除自動保存 timer，避免保存已刪除的頁面**
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = null
      }
      setCurrentPage(null)
      setMarkdownText('')
      editor?.commands.clearContent()
      setSyncStatus('saved')
      storage.saveSelectedPage(null)
      return
    }

    // 保存當前頁面的最後狀態
    if (currentPage && autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      // **重要：直接從編輯器獲取最新內容，不使用 React 狀態**
      // 因為 setMarkdownText 是異步的，狀態可能不是最新的
      const latestContent = isMarkdownMode
        ? markdownText  // Markdown 模式下使用狀態
        : getMarkdownFromEditor(editor)  // WYSIWYG 模式下從編輯器獲取
      await saveCurrentPage(latestContent || markdownText)
    }

    // 加載新頁面
    setCurrentPage(page)
    setMarkdownText(page.content)
    setSyncStatus('saved')

    // 保存選中的頁面到 localStorage
    storage.saveSelectedPage(page.id)

    if (!isMarkdownMode) {
      isSyncingFromMarkdown.current = true
      const html = markdownToHtml(page.content)
      editor?.commands.setContent(html || '<p></p>')
      setTimeout(() => {
        isSyncingFromMarkdown.current = false

        // 恢復編輯器狀態
        if (page.editorState) {
          // 恢復光標位置
          if (page.editorState.cursorPosition !== undefined) {
            editor?.commands.setTextSelection(page.editorState.cursorPosition)
          }

          // 恢復滾動位置
          if (page.editorState.scrollTop !== undefined && editorScrollRef.current) {
            editorScrollRef.current.scrollTop = page.editorState.scrollTop
          } else if (editorScrollRef.current) {
            // 如果沒有記憶的滾動位置，預設捲到最上方
            editorScrollRef.current.scrollTop = 0
          }
        } else if (editorScrollRef.current) {
          // 如果沒有 editorState，預設捲到最上方
          editorScrollRef.current.scrollTop = 0
        }

        // 自動 focus 到編輯器
        editor?.commands.focus()
      }, 100)
    } else {
      // Markdown 模式下，focus 到 textarea
      setTimeout(() => {
        const textarea = document.querySelector('.markdown-source-editor') as HTMLTextAreaElement
        textarea?.focus()
      }, 0)
    }
  }

  // 圖片壓縮函數
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img')
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('無法創建 Canvas'))
          return
        }

        // 計算新尺寸（最大 1024px）
        let width = img.width
        let height = img.height
        const maxSize = 1024

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width
            width = maxSize
          } else {
            width = (width * maxSize) / height
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height

        // 繪製圖片
        ctx.drawImage(img, 0, 0, width, height)

        // 轉換為 Blob
        // 注意：某些格式（如 GIF）可能不支持，統一轉為 JPEG 或 PNG
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const quality = mimeType === 'image/jpeg' ? 0.85 : undefined

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('圖片壓縮失敗：無法轉換為 Blob'))
            }
          },
          mimeType,
          quality
        )
      }

      img.onerror = () => reject(new Error('圖片載入失敗'))
      reader.onerror = () => reject(new Error('文件讀取失敗'))

      reader.readAsDataURL(file)
    })
  }

  // 處理圖片上傳
  const handleImageUpload = async (file: File) => {
    try {
      console.log('開始上傳圖片:', file.name, file.type, (file.size / 1024).toFixed(2), 'KB')

      if (!editor) {
        console.error('編輯器未初始化')
        alert('編輯器未準備好，請稍後再試')
        return
      }

      // 檢查文件類型
      if (!file.type.startsWith('image/')) {
        console.error('不是圖片文件:', file.type)
        alert('請選擇圖片文件')
        return
      }

      // 檢查文件大小（限制 10MB）
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        console.error('文件太大:', file.size)
        alert('圖片大小不能超過 10MB')
        return
      }

      // 壓縮圖片
      console.log('開始壓縮圖片...')
      const compressedBlob = await compressImage(file)
      console.log('壓縮完成 - 原始:', (file.size / 1024).toFixed(2), 'KB, 壓縮後:', (compressedBlob.size / 1024).toFixed(2), 'KB')

      // 生成唯一 ID
      const imageId = `img-${Date.now()}`

      // 保存到 IndexedDB
      const imageData = {
        id: imageId,
        blob: compressedBlob,
        filename: file.name,
        mimeType: file.type,
        size: compressedBlob.size,
        createdAt: Date.now(),
      }

      await db.saveImage(imageData)

      // 創建 blob URL 用於即時顯示
      const blobUrl = URL.createObjectURL(compressedBlob)

      // 保存到映射表
      imageBlobUrlMap.current.set(imageId, blobUrl)

      // 插入圖片到編輯器，使用自定義協議，預設添加陰影
      editor.chain().focus().setImage({
        src: `image://${imageId}`,
        alt: file.name,
        'data-shadow': 'true',
      }).run()

      console.log('圖片上傳成功:', imageId, '映射表大小:', imageBlobUrlMap.current.size)
    } catch (error) {
      console.error('圖片上傳失敗:', error)
      const errorMessage = error instanceof Error ? error.message : '未知錯誤'
      alert(`圖片上傳失敗: ${errorMessage}`)
    }
  }

  // 處理 image:// URL 轉換為 blob URL
  useEffect(() => {
    if (!editor) return

    const convertImageUrls = async () => {
      // 查找所有使用 data-src 的圖片（image:// 協議）
      const images = document.querySelectorAll('img[data-src^="image://"]')

      for (const imgElement of images) {
        const img = imgElement as HTMLImageElement
        const dataSrc = img.getAttribute('data-src')
        if (!dataSrc) continue

        const imageId = dataSrc.replace('image://', '')

        // 首先檢查映射表
        let blobUrl = imageBlobUrlMap.current.get(imageId)

        if (!blobUrl) {
          // 從 IndexedDB 讀取圖片
          try {
            const imageData = await db.getImage(imageId)
            if (imageData) {
              blobUrl = URL.createObjectURL(imageData.blob)
              imageBlobUrlMap.current.set(imageId, blobUrl)
              console.log('從 IndexedDB 載入圖片:', imageId)
            } else {
              console.warn('圖片不存在:', imageId)
              continue
            }
          } catch (error) {
            console.error('無法載入圖片:', imageId, error)
            continue
          }
        }

        // 設置 blob URL
        if (blobUrl) {
          img.src = blobUrl
        }
      }
    }

    // 初始轉換
    setTimeout(() => convertImageUrls(), 100)

    // 監聽編輯器更新
    const handleUpdate = () => {
      setTimeout(() => convertImageUrls(), 50)
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, currentPage])

  const handleSelectFolder = (folderId: string) => {
    // 如果傳入空字符串，表示沒有選中的 folder（回到初始化狀態）
    if (folderId === '') {
      setSelectedFolderId(null)
      setCurrentPage(null)
      setMarkdownText('')
      editor?.commands.clearContent()
      storage.saveSelectedFolder(null)
      storage.saveSelectedPage(null)
      return
    }

    setSelectedFolderId(folderId)
    // 保存選中的文件夾到 localStorage
    storage.saveSelectedFolder(folderId)
  }

  // 編輯器獲得焦點時的處理
  // 場景：初始頁面沒有 folder 和 page 時點擊編輯器、手動刪除全部 Folder 後點擊編輯器
  const handleEditorFocus = async () => {
    // 如果沒有當前頁面，自動創建「新資料夾」和「新頁面」
    if (!currentPage) {
      try {
        // 使用統一的邏輯：確保有 folder 和 page
        // 傳入 selectedFolderId，如果有選中的 folder，就在該 folder 下創建頁面
        const { folder, page } = await ensureFolderAndPage(selectedFolderId)

        // 設置選中的 folder 和 page
        setSelectedFolderId(folder.id)
        setCurrentPage(page)
        setMarkdownText(page.content)
        setSyncStatus('saved')

        // 保存到 localStorage
        storage.saveSelectedFolder(folder.id)
        storage.saveSelectedPage(page.id)

        // 觸發刷新，讓 Sidebar 更新 FolderTree 和 PageList
        setTriggerRefresh(prev => prev + 1)

        console.log('自動創建 folder 和 page:', { folder: folder.name, page: page.name })
      } catch (error) {
        console.error('Failed to create folder and page:', error)
      }
    }
  }

  const handleOpenLinkDialog = () => {
    // 获取当前选中的文本
    const { from, to } = editor?.state.selection || { from: 0, to: 0 }
    const selectedText = editor?.state.doc.textBetween(from, to, '') || ''

    // 检查是否已经是链接
    const existingLink = editor?.getAttributes('link')

    if (existingLink?.href) {
      setLinkUrl(existingLink.href)
      setLinkText(selectedText)
    } else {
      setLinkUrl('')
      setLinkText(selectedText)
    }

    setShowLinkDialog(true)
  }

  const handleInsertLink = () => {
    if (!linkUrl) {
      alert('請輸入 URL')
      return
    }

    if (!editor) return

    const { from, to } = editor.state.selection
    const hasSelection = from !== to

    if (linkText && !hasSelection) {
      // 情况1: 用户输入了链接文字，但没有选中文本
      // 插入带链接的文本
      editor.chain()
        .focus()
        .insertContent({
          type: 'text',
          text: linkText,
          marks: [{ type: 'link', attrs: { href: linkUrl } }]
        })
        .run()
    } else if (hasSelection || linkText) {
      // 情况2: 有选中的文本，或用户修改了链接文字
      // 先删除选中的内容（如果有），然后插入新的链接文本
      const textToUse = linkText || editor.state.doc.textBetween(from, to, '')

      editor.chain()
        .focus()
        .deleteSelection()
        .insertContent({
          type: 'text',
          text: textToUse,
          marks: [{ type: 'link', attrs: { href: linkUrl } }]
        })
        .run()
    } else {
      // 情况3: 没有链接文字，也没有选中文本
      alert('請輸入連結文字或先選擇文本')
      return
    }

    // 重置状态
    setShowLinkDialog(false)
    setLinkUrl('')
    setLinkText('')
  }

  const handleRemoveLink = () => {
    editor?.chain().focus().unsetLink().run()
    setShowLinkDialog(false)
    setLinkUrl('')
    setLinkText('')
  }

  if (!editor || !dbInitialized) {
    return <div className="loading">載入中...</div>
  }

  return (
    <div className="app-container">
      <Sidebar
        onSelectPage={handleSelectPage}
        onSelectFolder={handleSelectFolder}
        selectedFolderId={selectedFolderId}
        selectedPageId={currentPage?.id || null}
        selectedPage={currentPage}
        refreshTrigger={triggerRefresh}
      />

      <div className="editor-container">
        <div className="editor-wrapper">
        <div className="toolbar">
          <button
            onClick={handleToggleMarkdownMode}
            className={isMarkdownMode ? 'toolbar-button toolbar-button-md is-active' : 'toolbar-button toolbar-button-md'}
            title={isMarkdownMode ? '切換到 WYSIWYG 模式' : '切換到 Markdown 源碼模式'}
          >
            MD⬇
          </button>
          
          {/* Undo/Redo */}
          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={isMarkdownMode || !editor.can().chain().focus().undo().run()}
            className="toolbar-button"
            title="撤銷 (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={isMarkdownMode || !editor.can().chain().focus().redo().run()}
            className="toolbar-button"
            title="重做 (Ctrl+Shift+Z)"
          >
            ↪
          </button>

          <div className="toolbar-divider"></div>

          {/* Text formatting */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={isMarkdownMode || !editor.can().chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="粗體 (Ctrl+B)"
          >
            𝐁
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={isMarkdownMode || !editor.can().chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="斜體 (Ctrl+I)"
          >
            𝐼
          </button>
          {/* Headings */}
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            disabled={isMarkdownMode}
            className={editor.isActive('heading', { level: 1 }) ? 'toolbar-button is-active' : 'toolbar-button'}
            title="標題 1"
          >
            H₁
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            disabled={isMarkdownMode}
            className={editor.isActive('heading', { level: 2 }) ? 'toolbar-button is-active' : 'toolbar-button'}
            title="標題 2"
          >
            H₂
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            disabled={isMarkdownMode}
            className={editor.isActive('heading', { level: 3 }) ? 'toolbar-button is-active' : 'toolbar-button'}
            title="標題 3"
          >
            H₃
          </button>

          {/* Horizontal rule */}
          <button
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            disabled={isMarkdownMode}
            className="toolbar-button"
            title="分隔線"
          >
            ---
          </button>

          {/* Lists */}
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            disabled={isMarkdownMode}
            className={editor.isActive('bulletList') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="無序列表"
          >
            ●
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            disabled={isMarkdownMode}
            className={editor.isActive('orderedList') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="有序列表"
          >
            1.
          </button>
          <button
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            disabled={isMarkdownMode}
            className={editor.isActive('taskList') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="待辦事項列表"
          >
            ☑
          </button>

          {/* Blockquote */}
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            disabled={isMarkdownMode}
            className={editor.isActive('blockquote') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="引用"
          >
            &gt;
          </button>

          {/* Code */}
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            disabled={isMarkdownMode}
            className={editor.isActive('codeBlock') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="多行代碼"
          >
            &lt;/&gt;
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            disabled={isMarkdownMode || !editor.can().chain().focus().toggleCode().run()}
            className={editor.isActive('code') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="行內代碼 (Ctrl+E)"
          >
            &lt;&gt;
          </button>

          {/* Link */}
          <button
            onClick={handleOpenLinkDialog}
            disabled={isMarkdownMode}
            className={editor.isActive('link') ? 'toolbar-button is-active' : 'toolbar-button'}
            title="插入連結"
          >
            🔗
          </button>

          {/* Image */}
          <button
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/*'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) {
                  handleImageUpload(file)
                }
              }
              input.click()
            }}
            disabled={isMarkdownMode}
            className="toolbar-button"
            title="插入圖片"
          >
            🖼️
          </button>

          {/* Table */}
          <div className="toolbar-dropdown">
            <button
              onClick={() => setShowTableMenu(!showTableMenu)}
              disabled={isMarkdownMode}
              className="toolbar-button"
              title="表格操作"
            >
              田
            </button>
            {showTableMenu && !isMarkdownMode && (
              <div className="dropdown-menu">
                <button
                  className="dropdown-item"
                  onClick={() => {
                    editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()
                    setShowTableMenu(false)
                  }}
                >
                  插入表格
                </button>
                <div className="dropdown-divider"></div>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    editor.chain().focus().addRowBefore().run()
                    setShowTableMenu(false)
                  }}
                >
                  在上方插入行
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run()
                    setShowTableMenu(false)
                  }}
                >
                  在下方插入行
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    editor.chain().focus().deleteRow().run()
                    setShowTableMenu(false)
                  }}
                >
                  刪除行
                </button>
                <div className="dropdown-divider"></div>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    editor.chain().focus().addColumnBefore().run()
                    setShowTableMenu(false)
                  }}
                >
                  在左側插入列
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run()
                    setShowTableMenu(false)
                  }}
                >
                  在右側插入列
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run()
                    setShowTableMenu(false)
                  }}
                >
                  刪除列
                </button>
                <div className="dropdown-divider"></div>
                <button
                  className="dropdown-item dropdown-item-danger"
                  onClick={() => {
                    editor.chain().focus().deleteTable().run()
                    setShowTableMenu(false)
                  }}
                >
                  刪除表格
                </button>
              </div>
            )}
          </div>

          <div className="toolbar-divider"></div>

          {/* Save Status Indicator */}
          <div
            className={`save-status-indicator status-${syncStatus}`}
            title={
              syncStatus === 'saved' ? '已儲存' :
              syncStatus === 'saving' ? '儲存中...' :
              '未儲存'
            }
          />
        </div>

        {isMarkdownMode ? (
          <textarea
            className="markdown-source-editor"
            value={markdownText}
            onChange={(e) => setMarkdownText(e.target.value)}
            placeholder="在此 編輯 或 貼上 Markdown 本文原碼..."
          />
        ) : (
          <div ref={editorScrollRef} className="editor-scroll-container">
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      {/* Link Dialog */}
      <LinkDialog
        isOpen={showLinkDialog}
        linkText={linkText}
        linkUrl={linkUrl}
        isEditing={editor?.isActive('link') || false}
        onClose={() => setShowLinkDialog(false)}
        onLinkTextChange={setLinkText}
        onLinkUrlChange={setLinkUrl}
        onInsertLink={handleInsertLink}
        onRemoveLink={handleRemoveLink}
      />
      </div>
    </div>
  )
}

export default MarkdownEditor
