import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import * as fc from 'fast-check'
import { useCommandHistory } from '@/hooks/useCommandHistory'

describe('useCommandHistory', () => {
  const TEST_STORAGE_KEY = 'test_command_history'

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('initialization', () => {
    it('should initialize with empty history', () => {
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      expect(result.current.history).toEqual([])
    })

    it('should load history from localStorage', () => {
      const savedHistory = ['ls', 'cd /home', 'pwd']
      localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(savedHistory))
      
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      expect(result.current.history).toEqual(savedHistory)
    })

    it('should handle invalid localStorage data gracefully', () => {
      localStorage.setItem(TEST_STORAGE_KEY, 'invalid json')
      
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      expect(result.current.history).toEqual([])
    })
  })

  describe('Property 7: Command History Storage', () => {
    /**
     * For any command sent successfully, it SHALL appear in the command history list.
     * Validates: Requirements 4.1
     */
    it('should store any non-empty command in history', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          (command) => {
            const { result, unmount } = renderHook(() => 
              useCommandHistory({ storageKey: `${TEST_STORAGE_KEY}_${Math.random()}` })
            )
            
            act(() => {
              result.current.addCommand(command)
            })
            
            expect(result.current.history).toContain(command.trim())
            
            unmount()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should not store empty commands', () => {
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      act(() => {
        result.current.addCommand('')
        result.current.addCommand('   ')
        result.current.addCommand('\t\n')
      })
      
      expect(result.current.history).toEqual([])
    })

    it('should not store duplicate consecutive commands', () => {
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      act(() => {
        result.current.addCommand('ls')
        result.current.addCommand('ls')
        result.current.addCommand('ls')
      })
      
      expect(result.current.history).toEqual(['ls'])
    })
  })

  describe('Property 9: History Persistence Round-Trip', () => {
    /**
     * For any command history array, saving to localStorage and reading back
     * SHALL return an equivalent array.
     * Validates: Requirements 4.4
     */
    it('should persist history to localStorage and restore on reload', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            { minLength: 1, maxLength: 20 }
          ),
          (commands) => {
            const storageKey = `${TEST_STORAGE_KEY}_${Math.random()}`
            
            // First render - add commands
            const { result: result1, unmount: unmount1 } = renderHook(() => 
              useCommandHistory({ storageKey })
            )
            
            act(() => {
              commands.forEach(cmd => result1.current.addCommand(cmd))
            })
            
            const historyAfterAdd = [...result1.current.history]
            unmount1()
            
            // Second render - should restore from localStorage
            const { result: result2, unmount: unmount2 } = renderHook(() => 
              useCommandHistory({ storageKey })
            )
            
            expect(result2.current.history).toEqual(historyAfterAdd)
            
            unmount2()
            localStorage.removeItem(storageKey)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('Property 10: History Size Limit with FIFO', () => {
    /**
     * For any sequence of N commands added where N > 50, the history SHALL contain
     * exactly 50 commands, and they SHALL be the 50 most recent commands in order.
     * Validates: Requirements 4.5, 4.6
     */
    it('should enforce max size limit with FIFO behavior', () => {
      const maxSize = 50
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY, maxSize })
      )
      
      // Add more than maxSize unique commands
      const commands: string[] = []
      for (let i = 0; i < 75; i++) {
        commands.push(`command_${i}`)
      }
      
      act(() => {
        commands.forEach(cmd => result.current.addCommand(cmd))
      })
      
      // Should have exactly maxSize commands
      expect(result.current.history.length).toBe(maxSize)
      
      // Should be the 50 most recent (last 50 commands)
      const expected = commands.slice(-maxSize)
      expect(result.current.history).toEqual(expected)
    })

    it('should maintain FIFO order for any number of commands exceeding limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 51, max: 100 }),
          (numCommands) => {
            const maxSize = 50
            const storageKey = `${TEST_STORAGE_KEY}_${Math.random()}`
            
            const { result, unmount } = renderHook(() => 
              useCommandHistory({ storageKey, maxSize })
            )
            
            const commands: string[] = []
            for (let i = 0; i < numCommands; i++) {
              commands.push(`cmd_${i}_${Math.random()}`)
            }
            
            act(() => {
              commands.forEach(cmd => result.current.addCommand(cmd))
            })
            
            // Should have exactly maxSize commands
            expect(result.current.history.length).toBe(maxSize)
            
            // Should be the most recent maxSize commands
            const expected = commands.slice(-maxSize)
            expect(result.current.history).toEqual(expected)
            
            unmount()
            localStorage.removeItem(storageKey)
          }
        ),
        { numRuns: 20 }
      )
    })

    it('should not exceed maxSize when loading from localStorage', () => {
      const maxSize = 10
      const savedHistory = Array.from({ length: 20 }, (_, i) => `old_cmd_${i}`)
      localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(savedHistory))
      
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY, maxSize })
      )
      
      // Should only load the last maxSize commands
      expect(result.current.history.length).toBe(maxSize)
      expect(result.current.history).toEqual(savedHistory.slice(-maxSize))
    })
  })

  describe('clearHistory', () => {
    it('should clear all history', () => {
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      act(() => {
        result.current.addCommand('ls')
        result.current.addCommand('pwd')
        result.current.addCommand('cd')
      })
      
      expect(result.current.history.length).toBe(3)
      
      act(() => {
        result.current.clearHistory()
      })
      
      expect(result.current.history).toEqual([])
    })

    it('should persist cleared state to localStorage', () => {
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      act(() => {
        result.current.addCommand('ls')
        result.current.clearHistory()
      })
      
      const stored = localStorage.getItem(TEST_STORAGE_KEY)
      expect(JSON.parse(stored!)).toEqual([])
    })
  })

  describe('removeCommand', () => {
    it('should remove command at specific index', () => {
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      act(() => {
        result.current.addCommand('first')
        result.current.addCommand('second')
        result.current.addCommand('third')
      })
      
      act(() => {
        result.current.removeCommand(1) // Remove 'second'
      })
      
      expect(result.current.history).toEqual(['first', 'third'])
    })

    it('should handle invalid index gracefully', () => {
      const { result } = renderHook(() => 
        useCommandHistory({ storageKey: TEST_STORAGE_KEY })
      )
      
      act(() => {
        result.current.addCommand('test')
      })
      
      act(() => {
        result.current.removeCommand(-1)
        result.current.removeCommand(100)
      })
      
      expect(result.current.history).toEqual(['test'])
    })
  })
})
