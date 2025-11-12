/**
 * Markdown 转换工具
 * 负责 Tiptap Editor JSON 格式与 Markdown 文本之间的转换
 */

/**
 * 从 Tiptap Editor 实例中提取 Markdown 文本
 * @param editorInstance - Tiptap Editor 实例
 * @returns Markdown 格式的文本
 */
export const getMarkdownFromEditor = (editorInstance: any): string => {
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
        const codeMark = node.marks.find((mark: any) => mark.type === 'code')
        const boldMark = node.marks.find((mark: any) => mark.type === 'bold')
        const italicMark = node.marks.find((mark: any) => mark.type === 'italic')

        // 特殊处理：code + link 组合
        // 生成 [`text`](url) 格式，这在 markdown 中是合法的
        if (codeMark && linkMark) {
          text = `[\`${text}\`](${linkMark.attrs.href})`
        } else {
          // 处理其他格式标记
          if (boldMark) text = `**${text}**`
          if (italicMark) text = `*${text}*`
          if (codeMark) text = `\`${text}\``

          // 最后应用链接（包装所有其他格式）
          if (linkMark) {
            text = `[${text}](${linkMark.attrs.href})`
          }
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

    if (node.type === 'taskList') {
      return node.content?.map((child: any) => jsonToMarkdown(child, depth)).join('\n') || ''
    }

    if (node.type === 'taskItem') {
      const checked = node.attrs?.checked ? 'x' : ' '
      const paragraphs = node.content?.map((child: any) => {
        if (child.type === 'paragraph') {
          return jsonToMarkdown(child, depth + 1)
        }
        return jsonToMarkdown(child, depth + 1)
      }) || []

      const firstPara = paragraphs[0] || ''
      const restParas = paragraphs.slice(1)

      let result = `- [${checked}] ` + firstPara
      if (restParas.length > 0) {
        result += '\n  ' + restParas.join('\n  ')
      }
      return result
    }

    if (node.type === 'codeBlock') {
      const language = node.attrs?.language || ''
      const code = node.content?.map((child: any) => child.text || '').join('\n') || ''
      // 移除末尾的單個換行符，避免在 code block 後出現多餘空行
      // 原因：Tiptap 在 code block 最後一行按 Enter 後會保留換行符
      const trimmedCode = code.replace(/\n$/, '')
      return '```' + language + '\n' + trimmedCode + '\n```'
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

    if (node.type === 'image') {
      const src = node.attrs?.src || ''
      const alt = node.attrs?.alt || ''

      // 只保存基本 Markdown 語法
      // 屬性（width, shadow）會保存在 Tiptap 的 JSON 中，不需要在 Markdown 中顯示
      return `![${alt}](${src})`
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
        // 使用 jsonToMarkdown 递归处理 cell 内容，保留所有格式（包括 code + link）
        return cell.content?.map((node: any) => jsonToMarkdown(node, 0)).join(' ').trim() || ''
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

/**
 * 从 Markdown 文本中提取页面标题
 * @param markdown - Markdown 文本
 * @returns 页面标题
 */
export const extractPageTitle = (markdown: string): string => {
  if (!markdown.trim()) return '新頁面'

  const lines = markdown.split('\n')
  const firstLine = lines[0].trim()

  if (!firstLine) return '新頁面'

  // 移除 Markdown 标题符号（# ## ### 等）
  const withoutHash = firstLine.replace(/^#+\s*/, '')

  // 移除其他 Markdown 格式符号
  const cleanTitle = withoutHash
    .replace(/\*\*/g, '')  // 粗體
    .replace(/\*/g, '')    // 斜體
    .replace(/`/g, '')     // 代碼
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')  // 鏈接
    .trim()

  return cleanTitle || '新頁面'
}
