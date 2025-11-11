/**
 * Content Hash 計算器
 * 用於快速比對 page 內容是否變更
 */

/**
 * 計算字符串的 SHA-256 hash
 */
export async function calculateContentHash(content: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  } catch (error) {
    console.error('Failed to calculate content hash:', error)
    // Fallback: 使用簡單的字符串長度作為標識（不安全，僅用於失敗情況）
    return `fallback-${content.length}-${Date.now()}`
  }
}

/**
 * 批量計算多個內容的 hash
 */
export async function calculateMultipleHashes(
  contents: Array<{ id: string; content: string }>
): Promise<Map<string, string>> {
  const hashMap = new Map<string, string>()

  await Promise.all(
    contents.map(async ({ id, content }) => {
      const hash = await calculateContentHash(content)
      hashMap.set(id, hash)
    })
  )

  return hashMap
}

/**
 * 驗證內容是否匹配指定 hash
 */
export async function verifyContentHash(content: string, expectedHash: string): Promise<boolean> {
  const actualHash = await calculateContentHash(content)
  return actualHash === expectedHash
}
