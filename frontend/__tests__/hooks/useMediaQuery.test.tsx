import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMediaQuery, useIsMobile } from '@/hooks/useMediaQuery'

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should return initial matchMedia result', () => {
      // Mock matchMedia to return matches: false
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
      expect(result.current).toBe(false)
    })

    it('should return true when media query matches', () => {
      // Mock matchMedia to return matches: true
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
      expect(result.current).toBe(true)
    })
  })

  describe('useIsMobile Hook', () => {
    it('should return false for desktop viewport (> 768px)', () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === '(max-width: 768px)' ? false : true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const { result } = renderHook(() => useIsMobile())
      expect(result.current).toBe(false)
    })

    it('should return true for mobile viewport (<= 768px)', () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === '(max-width: 768px)' ? true : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const { result } = renderHook(() => useIsMobile())
      expect(result.current).toBe(true)
    })
  })

  describe('Event Listener Handling', () => {
    it('should update state when matchMedia change event fires', async () => {
      let changeListener: ((e: MediaQueryListEvent) => void) | null = null

      // Mock matchMedia with ability to trigger change event
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event, listener) => {
          if (event === 'change') {
            changeListener = listener as (e: MediaQueryListEvent) => void
          }
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))

      // Initial state should be false
      expect(result.current).toBe(false)

      // Simulate media query change
      if (changeListener) {
        changeListener({ matches: true, media: '(max-width: 768px)' } as MediaQueryListEvent)
      }

      // Wait for state update
      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })

    it('should register event listener on mount', () => {
      const addEventListenerMock = vi.fn()

      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: addEventListenerMock,
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      renderHook(() => useMediaQuery('(max-width: 768px)'))

      expect(addEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('should cleanup event listener on unmount', () => {
      const removeEventListenerMock = vi.fn()

      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerMock,
        dispatchEvent: vi.fn(),
      }))

      const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'))

      unmount()

      expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
    })
  })

  describe('Legacy Browser Support', () => {
    it('should use addListener/removeListener for browsers without addEventListener', () => {
      const addListenerMock = vi.fn()
      const removeListenerMock = vi.fn()

      // Mock matchMedia without addEventListener (legacy browser)
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: addListenerMock,
        removeListener: removeListenerMock,
        addEventListener: undefined as any,
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'))

      expect(addListenerMock).toHaveBeenCalledWith(expect.any(Function))

      unmount()

      expect(removeListenerMock).toHaveBeenCalledWith(expect.any(Function))
    })
  })
})
