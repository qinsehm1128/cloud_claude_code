import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type WindowIdModule = typeof import('../../src/utils/windowId')

function createStorageMock(): Storage {
  let store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length
    },
  }
}

async function loadWindowIdModule(): Promise<WindowIdModule> {
  vi.resetModules()
  return import('../../src/utils/windowId')
}

describe('windowId utils', () => {
  let originalSessionStorage: Storage

  beforeEach(() => {
    originalSessionStorage = window.sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: createStorageMock(),
      writable: true,
    })
    window.sessionStorage.clear()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(window, 'sessionStorage', {
      value: originalSessionStorage,
      writable: true,
    })
    vi.restoreAllMocks()
  })

  it('should generate and persist a windowId in sessionStorage', async () => {
    const randomValue = 0.123456789
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(randomValue)

    const getItemSpy = vi.spyOn(window.sessionStorage, 'getItem')
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem')

    const { getWindowId } = await loadWindowIdModule()
    const windowId = getWindowId()

    const expectedWindowId = `window_1700000000000_${randomValue.toString(36).substring(2, 9)}`

    expect(windowId).toBe(expectedWindowId)
    expect(windowId).toMatch(/^window_\d+_[a-z0-9]{7}$/)
    expect(getItemSpy).toHaveBeenCalledWith('windowId')
    expect(setItemSpy).toHaveBeenCalledWith('windowId', expectedWindowId)
    expect(window.sessionStorage.getItem('windowId')).toBe(expectedWindowId)
  })

  it('should return existing windowId from sessionStorage', async () => {
    const existingWindowId = 'window_1700000000000_abcdefg'
    window.sessionStorage.setItem('windowId', existingWindowId)

    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem')
    setItemSpy.mockClear()

    const { getWindowId } = await loadWindowIdModule()
    const windowId = getWindowId()

    expect(windowId).toBe(existingWindowId)
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('should be idempotent for repeated calls in same window', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.987654321)

    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem')

    const { getWindowId } = await loadWindowIdModule()
    const firstId = getWindowId()
    const secondId = getWindowId()

    expect(secondId).toBe(firstId)
    expect(setItemSpy).toHaveBeenCalledTimes(1)
  })

  it('should scope storage key with current windowId', async () => {
    const { getWindowId, getScopedStorageKey } = await loadWindowIdModule()

    const windowId = getWindowId()
    const scopedKey = getScopedStorageKey('terminal_sessions_12')

    expect(scopedKey).toBe(`terminal_sessions_12_${windowId}`)
  })

  it('should use sessionStorage instead of localStorage', async () => {
    const localSetItemSpy = vi.spyOn(window.localStorage, 'setItem')
    const sessionSetItemSpy = vi.spyOn(window.sessionStorage, 'setItem')

    const { getWindowId } = await loadWindowIdModule()
    const windowId = getWindowId()

    expect(windowId).toMatch(/^window_\d+_[a-z0-9]{7}$/)
    expect(sessionSetItemSpy).toHaveBeenCalledTimes(1)
    expect(localSetItemSpy).not.toHaveBeenCalled()
  })

  it('should fall back to in-memory id when sessionStorage is unavailable', async () => {
    const brokenSessionStorage: Storage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      setItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      get length() {
        return 0
      },
    }

    Object.defineProperty(window, 'sessionStorage', {
      value: brokenSessionStorage,
      writable: true,
    })

    const { getWindowId } = await loadWindowIdModule()

    const firstId = getWindowId()
    const secondId = getWindowId()

    expect(firstId).toMatch(/^window_\d+_[a-z0-9]{7}$/)
    expect(secondId).toBe(firstId)
  })

  it('should generate different ids when timestamp or random changes', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1700000000000).mockReturnValueOnce(1700000000001)
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.111111111).mockReturnValueOnce(0.222222222)

    const moduleA = await loadWindowIdModule()
    const firstId = moduleA.getWindowId()

    window.sessionStorage.clear()

    const moduleB = await loadWindowIdModule()
    const secondId = moduleB.getWindowId()

    expect(firstId).not.toBe(secondId)
  })
})
