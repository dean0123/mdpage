/**
 * Toast 通知容器
 * 顯示所有活動的 toast 通知
 */

import { Toast } from '../hooks/useToast'

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

const ToastContainer = ({ toasts, onRemove }: ToastContainerProps) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
      default:
        return 'ℹ️'
    }
  }

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => onRemove(toast.id)}
        >
          <span className="toast-icon">{getIcon(toast.type)}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(toast.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
