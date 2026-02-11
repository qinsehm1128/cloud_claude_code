import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsMobile, useMediaQuery } from '@/hooks/useMediaQuery'

type MediaQueryListener = (event: MediaQueryListEvent) => void

function createModernMatchMedia(query: string, initialMatches: boolean) {
  let matches = initialMatches
  let listener: MediaQueryListener | null = null

  const addEventListener = vi.fn((eventName: string, handler: EventListenerOrEventListenerObject) => {
    if (eventName === 'change' && typeof handler === 'function') {
      listener = handler as MediaQueryListener
    }
  })

  const removeEventListener = vi.fn((eventName: string, handler: EventListenerOrEventListenerObject) => {
    if (eventName === 'change' && typeof handler === 'function' && listener === handler) {
      listener = null
    }
  })

  const addListener = vi.fn()
  const removeListener = vi.fn()

  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: query,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener,
    removeListener,
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList

  const emitChange = (nextMatches: boolean) => {
    matches = nextMatches
    listener?.({ matches: nextMatches } as MediaQueryListEvent)
  }

  return {
    mediaQueryList,
    emitChange,
    addEventListener,
    removeEventListener,
    addListener,
    removeListener,
  }
}

function createLegacyMatchMedia(query: string, initialMatches: boolean) {
  let matches = initialMatches
  let listener: MediaQueryListener | null = null

  const addListener = vi.fn((handler: MediaQueryListener) => {
    listener = handler
  })

  const removeListener = vi.fn((handler: MediaQueryListener) => {
    if (listener === handler) {
      listener = null
    }
  })

  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: query,
    onchange: null,
    addEventListener: undefined,
    removeEventListener: undefined,
    addListener,
    removeListener,
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList

  const emitChange = (nextMatches: boolean) => {
    matches = nextMatches
    listener?.({ matches: nextMatches } as MediaQueryListEvent)
  }

  return {
    mediaQueryList,
    emitChange,
    addListener,
    removeListener,
  }
}

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.mocked(window.matchMedia).mockReset()
  })

  it('uses addEventListener for modern matchMedia and cleans up on unmount', () => {
    const controls = createModernMatchMedia('(max-width: 768px)', false)
    vi.mocked(window.matchMedia).mockReturnValue(controls.mediaQueryList)

    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'))

    expect(result.current).toBe(false)
    expect(controls.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))

    act(() => {
      controls.emitChange(true)
    })

    expect(result.current).toBe(true)

    const addedHandler = controls.addEventListener.mock.calls[0]?.[1]
    unmount()

    expect(controls.removeEventListener).toHaveBeenCalledWith('change', addedHandler)
    expect(controls.addListener).not.toHaveBeenCalled()
    expect(controls.removeListener).not.toHaveBeenCalled()
  })

  it('falls back to addListener/removeListener for legacy matchMedia', () => {
    const controls = createLegacyMatchMedia('(max-width: 768px)', false)
    vi.mocked(window.matchMedia).mockReturnValue(controls.mediaQueryList)

    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'))

    expect(result.current).toBe(false)
    expect(controls.addListener).toHaveBeenCalledWith(expect.any(Function))

    act(() => {
      controls.emitChange(true)
    })

    expect(result.current).toBe(true)

    const addedHandler = controls.addListener.mock.calls[0]?.[0]
    unmount()

    expect(controls.removeListener).toHaveBeenCalledWith(addedHandler)
  })

  it('useIsMobile uses Tailwind md breakpoint query', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => {
      const controls = createModernMatchMedia(query, query === '(max-width: 768px)')
      return controls.mediaQueryList
    })

    const { result } = renderHook(() => useIsMobile())

    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 768px)')
    expect(result.current).toBe(true)
  })
})