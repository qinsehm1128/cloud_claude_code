import { useState, useEffect, useCallback } from 'react'

const HISTORY_STORAGE_KEY = 'terminal_command_history'
const DEFAULT_MAX_SIZE = 50

export interface UseCommandHistoryOptions {
  maxSize?: number
  storageKey?: string
}

export interface UseCommandHistoryReturn {
  history: string[]
  addCommand: (command: string) => void
  clearHistory: () => void
  removeCommand: (index: number) => void
}

/**
 * Hook for managing command history with localStorage persistence
 * Implements FIFO behavior when max size is exceeded
 */
export function useCommandHistory(
  options: UseCommandHistoryOptions = {}
): UseCommandHistoryReturn {
  const { maxSize = DEFAULT_MAX_SIZE, storageKey = HISTORY_STORAGE_KEY } = options
  
  const [history, setHistory] = useState<string[]>(() => {
    // Initialize from localStorage
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Ensure we don't exceed maxSize on load
          return parsed.slice(-maxSize)
        }
      }
    } catch {
      // Ignore parse errors
    }
    return []
  })

  // Persist to localStorage whenever history changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(history))
    } catch {
      // Ignore storage errors (e.g., quota exceeded)
    }
  }, [history, storageKey])

  /**
   * Add a command to history
   * - Skips empty commands
   * - Skips duplicate of the most recent command
   * - Removes oldest entries when maxSize is exceeded (FIFO)
   */
  const addCommand = useCallback((command: string) => {
    const trimmed = command.trim()
    if (!trimmed) return

    setHistory(prev => {
      // Skip if same as most recent command
      if (prev.length > 0 && prev[prev.length - 1] === trimmed) {
        return prev
      }

      // Add new command and enforce max size (FIFO)
      const newHistory = [...prev, trimmed]
      if (newHistory.length > maxSize) {
        return newHistory.slice(-maxSize)
      }
      return newHistory
    })
  }, [maxSize])

  /**
   * Clear all command history
   */
  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  /**
   * Remove a specific command by index
   */
  const removeCommand = useCallback((index: number) => {
    setHistory(prev => {
      if (index < 0 || index >= prev.length) return prev
      return [...prev.slice(0, index), ...prev.slice(index + 1)]
    })
  }, [])

  return {
    history,
    addCommand,
    clearHistory,
    removeCommand,
  }
}

export default useCommandHistory
