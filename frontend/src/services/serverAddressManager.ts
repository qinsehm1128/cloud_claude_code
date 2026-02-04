/**
 * Server Address Manager Service
 *
 * Manages server address storage, validation, and retrieval for dynamic server connection.
 * Allows users to specify backend server addresses at runtime.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 5.1
 */

// Storage key for localStorage
const STORAGE_KEY = 'claude_code_server_address'

// URL validation pattern - must start with http:// or https:// and be a valid URL
const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

// Protocol pattern - checks if string starts with http:// or https://
const PROTOCOL_PATTERN = /^https?:\/\//i

/**
 * Result of address validation
 */
export interface ValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Stored server configuration in localStorage
 */
export interface StoredServerConfig {
  address: string
  lastUsed: number
}

/**
 * Result of connection test
 */
export interface ConnectionTestResult {
  success: boolean
  error?: string
}

// In-memory fallback storage when localStorage is unavailable
let memoryStorage: StoredServerConfig | null = null

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__'
    localStorage.setItem(testKey, testKey)
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * Validates a server address format
 *
 * @param address - The server address to validate
 * @returns ValidationResult with isValid flag and optional error message
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
export function validateAddress(address: string): ValidationResult {
  // Empty address is valid (will use default)
  if (!address || address.trim() === '') {
    return { isValid: true }
  }

  const trimmedAddress = address.trim()

  // Check for protocol prefix
  if (!PROTOCOL_PATTERN.test(trimmedAddress)) {
    return {
      isValid: false,
      error: '请输入完整的服务器地址，包含 http:// 或 https://',
    }
  }

  // Check for valid URL format
  if (!URL_PATTERN.test(trimmedAddress)) {
    return {
      isValid: false,
      error: '服务器地址格式无效',
    }
  }

  // Additional validation using URL constructor
  try {
    new URL(trimmedAddress)
  } catch {
    return {
      isValid: false,
      error: '服务器地址格式无效',
    }
  }

  return { isValid: true }
}

/**
 * Gets the currently stored server address
 *
 * @returns The stored server address or empty string if not set
 *
 * Requirements: 3.2, 3.3, 3.4
 */
export function getServerAddress(): string {
  // Try localStorage first
  if (isLocalStorageAvailable()) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const config: StoredServerConfig = JSON.parse(stored)
        if (config && typeof config.address === 'string') {
          return config.address
        }
        // Data is corrupted, clear it
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Data is corrupted or parsing failed, clear it
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore removal errors
      }
    }
  }

  // Fall back to memory storage
  if (memoryStorage && typeof memoryStorage.address === 'string') {
    return memoryStorage.address
  }

  // Return empty string as default
  return ''
}

/**
 * Sets the server address
 *
 * @param address - The server address to store
 *
 * Requirements: 3.1
 */
export function setServerAddress(address: string): void {
  const config: StoredServerConfig = {
    address: address.trim(),
    lastUsed: Date.now(),
  }

  // Try localStorage first
  if (isLocalStorageAvailable()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
      // Also update memory storage as backup
      memoryStorage = config
      return
    } catch {
      // Storage full or other error, fall back to memory
    }
  }

  // Fall back to memory storage
  memoryStorage = config
}

/**
 * Gets the full API base URL
 *
 * @returns The API base URL (server address or default "/api")
 *
 * Requirements: 4.1, 4.2
 */
export function getApiBaseUrl(): string {
  const serverAddress = getServerAddress()

  if (!serverAddress) {
    // Use default relative path when no server address is set
    return '/api'
  }

  // Remove trailing slash from server address if present
  const normalizedAddress = serverAddress.replace(/\/+$/, '')

  // Return server address with /api path
  return `${normalizedAddress}/api`
}

/**
 * Clears the stored server address
 *
 * Requirements: 3.4
 */
export function clearServerAddress(): void {
  // Clear localStorage
  if (isLocalStorageAvailable()) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore removal errors
    }
  }

  // Clear memory storage
  memoryStorage = null
}

/**
 * Tests connection to the specified server
 *
 * @param address - The server address to test
 * @returns Promise with connection test result
 *
 * Requirements: 5.1
 */
export async function testConnection(address: string): Promise<ConnectionTestResult> {
  // Validate address first
  const validation = validateAddress(address)
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.error,
    }
  }

  // If address is empty, test the default API
  const testUrl = address
    ? `${address.replace(/\/+$/, '')}/api/health`
    : '/api/health'

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(testUrl, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      return { success: true }
    }

    return {
      success: false,
      error: `服务器返回错误: ${response.status}`,
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: '连接超时，服务器可能无响应',
        }
      }

      // Check for CORS or network errors
      if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
        return {
          success: false,
          error: '跨域请求被拒绝，请确认服务器已配置 CORS',
        }
      }

      return {
        success: false,
        error: '无法连接到服务器，请检查地址是否正确',
      }
    }

    return {
      success: false,
      error: '无法连接到服务器，请检查地址是否正确',
    }
  }
}

/**
 * Server Address Manager object for convenient access
 */
export const serverAddressManager = {
  getServerAddress,
  setServerAddress,
  validateAddress,
  testConnection,
  getApiBaseUrl,
  clearServerAddress,
}

export default serverAddressManager
