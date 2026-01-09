import { useState, useEffect, createContext, useContext, ReactNode } from 'react'
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast = { ...toast, id }
    setToasts(prev => [...prev, newToast])

    // Auto remove after duration
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// Global toast function for use outside React components
let globalAddToast: ((toast: Omit<Toast, 'id'>) => void) | null = null

export function setGlobalToast(addToast: (toast: Omit<Toast, 'id'>) => void) {
  globalAddToast = addToast
}

export function toast(options: Omit<Toast, 'id'>) {
  if (globalAddToast) {
    globalAddToast(options)
  } else {
    console.warn('Toast not initialized. Make sure ToastProvider is mounted.')
  }
}

// Convenience methods
toast.success = (title: string, message?: string) => toast({ type: 'success', title, message })
toast.error = (title: string, message?: string) => toast({ type: 'error', title, message })
toast.warning = (title: string, message?: string) => toast({ type: 'warning', title, message })
toast.info = (title: string, message?: string) => toast({ type: 'info', title, message })

function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
  }

  const bgColors = {
    success: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
    warning: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
    info: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg transition-all duration-300',
        bgColors[toast.type],
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-sm text-muted-foreground mt-1">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
