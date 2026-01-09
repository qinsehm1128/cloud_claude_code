import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import * as fc from 'fast-check'
import { ThemeProvider, useTheme, Theme, THEME_STORAGE_KEY, VALID_THEMES } from '@/hooks/useTheme'
import { ReactNode } from 'react'

// Wrapper component for testing hooks
const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('light', 'dark')
  })

  describe('Property 1: Theme Persistence Round-Trip', () => {
    it('should persist and restore theme correctly for all valid themes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<Theme>('light', 'dark', 'system'),
          (theme) => {
            // Clear state
            localStorage.clear()
            document.documentElement.classList.remove('light', 'dark')

            // Set theme
            const { result, unmount } = renderHook(() => useTheme(), { wrapper })
            act(() => {
              result.current.setTheme(theme)
            })
            
            // Verify localStorage was updated
            expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme)
            
            unmount()

            // Render new hook - should restore from localStorage
            const { result: result2 } = renderHook(() => useTheme(), { wrapper })
            expect(result2.current.theme).toBe(theme)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 2: Theme State Validity', () => {
    it('should always have a valid theme state', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom<Theme>('light', 'dark', 'system'), { minLength: 1, maxLength: 10 }),
          (themeSequence) => {
            localStorage.clear()
            const { result } = renderHook(() => useTheme(), { wrapper })

            // Apply sequence of theme changes
            for (const theme of themeSequence) {
              act(() => {
                result.current.setTheme(theme)
              })
              
              // After each change, theme should be valid
              expect(VALID_THEMES).toContain(result.current.theme)
              expect(['light', 'dark']).toContain(result.current.resolvedTheme)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject invalid theme values', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !VALID_THEMES.includes(s as Theme)),
          (invalidTheme) => {
            localStorage.clear()
            const { result } = renderHook(() => useTheme(), { wrapper })
            
            const initialTheme = result.current.theme
            
            act(() => {
              // @ts-expect-error - intentionally passing invalid value
              result.current.setTheme(invalidTheme)
            })
            
            // Theme should remain unchanged for invalid values
            expect(result.current.theme).toBe(initialTheme)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Unit Tests', () => {
    it('should default to system theme when no stored preference', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      expect(result.current.theme).toBe('system')
    })

    it('should apply dark class when theme is dark', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      
      act(() => {
        result.current.setTheme('dark')
      })
      
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('should apply light class when theme is light', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })
      
      act(() => {
        result.current.setTheme('light')
      })
      
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('should throw error when used outside ThemeProvider', () => {
      expect(() => {
        renderHook(() => useTheme())
      }).toThrow('useTheme must be used within a ThemeProvider')
    })

    it('should resolve system theme based on media query', () => {
      // Mock dark mode preference
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const { result } = renderHook(() => useTheme(), { wrapper })
      
      act(() => {
        result.current.setTheme('system')
      })
      
      expect(result.current.resolvedTheme).toBe('dark')
    })
  })
})
