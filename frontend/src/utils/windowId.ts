const WINDOW_ID_STORAGE_KEY = 'windowId'

let memoryWindowId: string | null = null

function createWindowId(): string {
  return `window_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function getWindowId(): string {
  if (memoryWindowId) {
    return memoryWindowId
  }

  try {
    const storedWindowId = sessionStorage.getItem(WINDOW_ID_STORAGE_KEY)
    if (storedWindowId) {
      memoryWindowId = storedWindowId
      return storedWindowId
    }

    const windowId = createWindowId()
    sessionStorage.setItem(WINDOW_ID_STORAGE_KEY, windowId)
    memoryWindowId = windowId
    return windowId
  } catch {
    const windowId = createWindowId()
    memoryWindowId = windowId
    return windowId
  }
}

export function getScopedStorageKey(baseKey: string): string {
  return `${baseKey}_${getWindowId()}`
}
