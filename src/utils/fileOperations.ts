/**
 * 文件操作工具函数
 * 负责 Markdown 文件的导入、导出等操作
 */

/**
 * 导出 Markdown 文件
 * @param content Markdown 内容
 * @param filename 文件名（可选，默认使用当前日期）
 */
export const exportMarkdownFile = (content: string, filename?: string): void => {
  const defaultFilename = `markdown-${new Date().toISOString().split('T')[0]}.md`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || defaultFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 导入 Markdown 文件
 * @param onImport 导入成功的回调函数
 */
export const importMarkdownFile = (onImport: (content: string) => void): void => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,.markdown,.txt'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        onImport(content)
      }
      reader.readAsText(file)
    }
  }
  input.click()
}
