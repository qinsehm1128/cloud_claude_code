import { useState, useEffect, useCallback } from 'react'

const VISIBILITY_STORAGE_KEY = 'mobile_keyboard_visible'

export interface UseMobileKeyboardStateReturn {
  visible: boolean
  setVisible: (visible: boolean) => void
  toggleVisible: () => void
}

/**
 * Hook for managing mobile keyboard visibility state with localStorage persistence
 */
export function useMobileKeyboardState(): UseMobileKeyboardStateReturn {
  const [visible, setVisibleState] = useState<boolean>(() => {
    // Initialize from localStorage
    try {
      const saved = localStorage.getItem(VISIBILITY_STORAGE_KEY)
      if (saved !== null) {
        return JSON.parse(saved)
      }
    } catch {
      // Ignore parse errors
    }
    return false // Default to hidden
  })

  // Persist to localStorage whenever visibility changes
  useEffect(() => {
    try {
      localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(visible))
    } catch {
      // Ignore storage errors
    }
  }, [visible])

  const setVisible = useCallback((newVisible: boolean) => {
    setVisibleState(newVisible)
  }, [])

  const toggleVisible = useCallback(() => {
    setVisibleState(prev => !prev)
  }, [])

  return {
    visible,
    setVisible,
    toggleVisible,
  }
}

export default useMobileKeyboardState
