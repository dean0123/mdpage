import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { marked } from 'marked'
import Sidebar from './Sidebar'
import { db, Page, Folder } from '../services/db'
import { storage } from '../services/storage'
import { ensureFolderAndPage } from '../services/pageHelper'
import '../styles/editor.css'

const MarkdownEditor = () => {
  // 初始 Markdown 內容
  const initialMarkdown = ''

  // 主要數據：Markdown 文本
  const [markdownText, setMarkdownText] = useState(initialMarkdown)
  const [isMarkdownMode, setIsMarkdownMode] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [currentPage, setCurrentPage] = useState<Page | null>(null)
  const [dbInitialized, setDbInitialized] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // 刷新觸發器：用於通知 Sidebar 刷新 FolderTree 和 PageList
  const [triggerRefresh, setTriggerRefresh] = useState(0)

  // 同步狀態：'saved' | 'saving' | 'unsaved'
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')

  // 用於防止在同步時觸發循環更新
  const isSyncingFromMarkdown = useRef(false)
  const autoSaveTimer = useRef<number | null>(null)
  const editorScrollRef = useRef<HTMLDivElement>(null)

  // 從 Markdown 文本中提取第一行作為標題
  const extractPageTitle = (markdown: string): string => {
    if (!markdown.trim()) return '新頁面'

    const lines = markdown.split('\n')
    const firstLine = lines[0].trim()

    if (!firstLine) return '新頁面'

    // 移除 Markdown 標題符號（# ## ### 等）
    const withoutHash = firstLine.replace(/^#+\s*/, '')

    // 移除其他 Markdown 格式符號
    const cleanTitle = withoutHash
      .replace(/\*\*/g, '')  // 粗體
      .replace(/\*/g, '')    // 斜體
      .replace(/`/g, '')     // 代碼
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')  // 鏈接
      .trim()

    return cleanTitle || '新頁面'
  }

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
      StarterKit,
      Placeholder.configure({
        placeholder: `開始輸入你的 Pages 內容

所見即所得 WYSIWYG Markdown 編輯器
      # 空格     為大字 H1
      ## 空格   為中字 H2
      - 空格      為列表
      1.              為數字列表
      >              為註解
      ---           三橫線為分割線
      \`\`\`           三個反單引號(前後)為代碼
      行尾兩個空格    為換行

使用工具欄按鈕或鍵盤快捷鍵：
      **粗體** （Cmd/Ctrl + B）
      *斜體*     （Cmd/Ctrl + I）
      \`代碼\`     （Cmd/Ctrl + E）
        `,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: marked(initialMarkdown) as string,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none',
      },
      handleDOMEvents: {
        focus: () => {
          handleEditorFocus()
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

  const getMarkdownFromEditor = (editorInstance: any) => {
    if (!editorInstance) return ''

    // 获取编辑器的 JSON 内容
    const json = editorInstance.getJSON()

    // 改进的 JSON 到 Markdown 转换
    const jsonToMarkdown = (node: any, depth = 0): string => {
      if (node.type === 'doc') {
        const items = node.content?.map((child: any) => jsonToMarkdown(child, depth)) || []
        // 智能处理换行：只在非空内容之间添加空行
        return items.filter((item: string) => item.trim()).join('\n\n')
      }

      if (node.type === 'heading') {
        const level = node.attrs?.level || 1
        const text = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('') || ''
        return '#'.repeat(level) + ' ' + text
      }

      if (node.type === 'paragraph') {
        const content = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('') || ''
        return content
      }

      if (node.type === 'text') {
        let text = node.text || ''
        if (node.marks) {
          const linkMark = node.marks.find((mark: any) => mark.type === 'link')

          // 处理格式标记（bold, italic, code）
          node.marks.forEach((mark: any) => {
            if (mark.type === 'bold') text = `**${text}**`
            if (mark.type === 'italic') text = `*${text}*`
            if (mark.type === 'code') text = `\`${text}\``
          })

          // 最后应用链接（包装所有其他格式）
          if (linkMark) {
            text = `[${text}](${linkMark.attrs.href})`
          }
        }
        return text
      }

      if (node.type === 'bulletList') {
        return node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('\n') || ''
      }

      if (node.type === 'orderedList') {
        return node.content?.map((child: any, index: number) => {
          const content = jsonToMarkdown(child, depth)
          return content.replace(/^- /, `${index + 1}. `)
        }).join('\n') || ''
      }

      if (node.type === 'listItem') {
        // 处理列表项中的多个段落
        const paragraphs = node.content?.map((child: any) => {
          if (child.type === 'paragraph') {
            return jsonToMarkdown(child, depth + 1)
          }
          return jsonToMarkdown(child, depth + 1)
        }) || []

        const firstPara = paragraphs[0] || ''
        const restParas = paragraphs.slice(1)

        let result = '- ' + firstPara
        if (restParas.length > 0) {
          result += '\n  ' + restParas.join('\n  ')
        }
        return result
      }

      if (node.type === 'codeBlock') {
        const code = node.content?.map((child: any) => child.text || '').join('\n') || ''
        return '```\n' + code + '\n```'
      }

      if (node.type === 'blockquote') {
        const content = node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('\n\n') || ''
        return content.split('\n').map((line: string) => '> ' + line).join('\n')
      }

      if (node.type === 'horizontalRule') {
        return '---'
      }

      if (node.type === 'hardBreak') {
        return '  \n'  // Markdown 硬换行：两个空格 + 换行
      }

      if (node.type === 'table') {
        return convertTableToMarkdown(node)
      }

      if (node.type === 'tableRow' || node.type === 'tableCell' || node.type === 'tableHeader') {
        // 这些由 table 节点统一处理
        return ''
      }

      return ''
    }

    const convertTableToMarkdown = (tableNode: any): string => {
      const rows = tableNode.content || []
      if (rows.length === 0) return ''

      let markdown = ''
      rows.forEach((row: any, rowIndex: number) => {
        const cells = row.content || []
        const cellContents = cells.map((cell: any) => {
          return cell.content?.map((p: any) => {
            return p.content?.map((t: any) => t.text || '').join('') || ''
          }).join(' ') || ''
        })

        markdown += '| ' + cellContents.join(' | ') + ' |\n'

        // 添加分隔线（在第一行后）
        if (rowIndex === 0) {
          markdown += '| ' + cellContents.map(() => '---').join(' | ') + ' |\n'
        }
      })

      return markdown
    }

    return jsonToMarkdown(json)
  }

  const handleToggleMarkdownMode = () => {
    if (!isMarkdownMode) {
      // 切换到 Markdown 模式：markdownText 已經是最新的
      setIsMarkdownMode(true)
    } else {
      // 切换回 WYSIWYG 模式：將 Markdown 轉換為 HTML 並設置到編輯器
      isSyncingFromMarkdown.current = true
      const html = marked(markdownText) as string
      editor?.commands.setContent(html)
      setIsMarkdownMode(false)
      // 使用 setTimeout 確保 setContent 完成後再重置標誌
      setTimeout(() => {
        isSyncingFromMarkdown.current = false
      }, 0)
    }
  }

  const handleExportMarkdown = () => {
    // markdownText 始終是最新的
    const blob = new Blob([markdownText], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `markdown-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleImportMarkdown = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const content = event.target?.result as string
          // 設置 Markdown 文本（主要數據源）
          setMarkdownText(content)

          if (!isMarkdownMode) {
            // 如果在 WYSIWYG 模式，同步更新編輯器
            isSyncingFromMarkdown.current = true
            const html = marked(content) as string
            editor?.commands.setContent(html)
            setTimeout(() => {
              isSyncingFromMarkdown.current = false
            }, 0)
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  const handleClearEditor = () => {
    if (confirm('確定要清空所有內容嗎？')) {
      // 清空 Markdown 文本（主要數據源）
      setMarkdownText('')

      if (!isMarkdownMode) {
        // 如果在 WYSIWYG 模式，同步清空編輯器
        isSyncingFromMarkdown.current = true
        editor?.commands.clearContent()
        setTimeout(() => {
          isSyncingFromMarkdown.current = false
        }, 0)
      }
    }
  }

  const handleSelectPage = async (page: Page) => {
    // 如果選擇的是空頁面（刪除頁面時），清空編輯器
    if (!page.id) {
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
      await saveCurrentPage(markdownText)
    }

    // 加載新頁面
    setCurrentPage(page)
    setMarkdownText(page.content)
    setSyncStatus('saved')

    // 保存選中的頁面到 localStorage
    storage.saveSelectedPage(page.id)

    if (!isMarkdownMode) {
      isSyncingFromMarkdown.current = true
      const html = marked(page.content) as string
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
          }
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

  const handleManualSync = async () => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
    }
    await saveCurrentPage(markdownText)
  }

  // 編輯器獲得焦點時的處理
  // 場景：初始頁面沒有 folder 和 page 時點擊編輯器、手動刪除全部 Folder 後點擊編輯器
  const handleEditorFocus = async () => {
    // 如果沒有當前頁面，自動創建「新資料夾」和「新頁面」
    if (!currentPage) {
      try {
        // 使用統一的邏輯：確保有 folder 和 page
        const { folder, page } = await ensureFolderAndPage()

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

          {/* File operations */}

          {/* Sync Button */}
          <button
            onClick={handleManualSync}
            className={`toolbar-button toolbar-button-sync sync-status-${syncStatus}`}
            title={
              syncStatus === 'saved' ? '已同步' :
              syncStatus === 'saving' ? '同步中...' :
              '未同步（點擊手動同步）'
            }
          >
            🔄
          </button>

          <button
            onClick={handleToggleMarkdownMode}
            className={isMarkdownMode ? 'toolbar-button toolbar-button-md is-active' : 'toolbar-button toolbar-button-md'}
            title={isMarkdownMode ? '切換到 WYSIWYG 模式' : '切換到 Markdown 源碼模式'}
          >
            MD⬇
          </button>
          <button
            onClick={handleImportMarkdown}
            className="toolbar-button toolbar-button-import"
            title="導入 Markdown 文件"
          >
            📂
          </button>
          <button
            onClick={handleExportMarkdown}
            className="toolbar-button toolbar-button-export"
            title="導出 Markdown 文件"
          >
            💾
          </button>
          <button
            onClick={handleClearEditor}
            className="toolbar-button toolbar-button-clear"
            title="清空編輯器"
          >
            🗑️
          </button>
        </div>

        {isMarkdownMode ? (
          <textarea
            className="markdown-source-editor"
            value={markdownText}
            onChange={(e) => setMarkdownText(e.target.value)}
            placeholder="在此編輯 Markdown 源碼..."
          />
        ) : (
          <div ref={editorScrollRef} className="editor-scroll-container">
            <EditorContent editor={editor} />
          </div>
        )}
      </div>

      {/* Link Dialog */}
      {showLinkDialog && (
        <div className="modal-overlay" onClick={() => setShowLinkDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>插入連結</h2>
              <button className="modal-close" onClick={() => setShowLinkDialog(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="link-text">連結文字</label>
                <input
                  id="link-text"
                  type="text"
                  className="form-input"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="請輸入連結顯示的文字"
                />
              </div>
              <div className="form-group">
                <label htmlFor="link-url">URL 網址</label>
                <input
                  id="link-url"
                  type="url"
                  className="form-input"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              {editor?.isActive('link') && (
                <button
                  className="modal-button modal-button-secondary"
                  onClick={handleRemoveLink}
                >
                  移除連結
                </button>
              )}
              <button
                className="modal-button"
                onClick={handleInsertLink}
              >
                {editor?.isActive('link') ? '更新連結' : '插入連結'}
              </button>
              <button
                className="modal-button modal-button-secondary"
                onClick={() => setShowLinkDialog(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default MarkdownEditor
