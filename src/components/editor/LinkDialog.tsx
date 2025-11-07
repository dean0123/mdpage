/**
 * LinkDialog 组件
 * 用于插入和编辑链接的对话框
 */

interface LinkDialogProps {
  isOpen: boolean
  linkText: string
  linkUrl: string
  isEditing: boolean
  onClose: () => void
  onLinkTextChange: (text: string) => void
  onLinkUrlChange: (url: string) => void
  onInsertLink: () => void
  onRemoveLink: () => void
}

const LinkDialog = ({
  isOpen,
  linkText,
  linkUrl,
  isEditing,
  onClose,
  onLinkTextChange,
  onLinkUrlChange,
  onInsertLink,
  onRemoveLink,
}: LinkDialogProps) => {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>插入連結</h2>
          <button className="modal-close" onClick={onClose}>
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
              onChange={(e) => onLinkTextChange(e.target.value)}
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
              onChange={(e) => onLinkUrlChange(e.target.value)}
              placeholder="https://example.com"
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          {isEditing && (
            <button
              className="modal-button modal-button-secondary"
              onClick={onRemoveLink}
            >
              移除連結
            </button>
          )}
          <button className="modal-button" onClick={onInsertLink}>
            {isEditing ? '更新連結' : '插入連結'}
          </button>
          <button
            className="modal-button modal-button-secondary"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export default LinkDialog
