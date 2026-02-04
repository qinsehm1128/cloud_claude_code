/**
 * Unit Tests for Server Address Manager Service
 *
 * Feature: dynamic-server-connection
 *
 * These tests cover edge cases and boundary conditions for the serverAddressManager service.
 * Requirements: 3.3, 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateAddress,
  getServerAddress,
  setServerAddress,
  getApiBaseUrl,
  clearServerAddress,
} from '../../src/services/serverAddressManager'

describe('serverAddressManager - Edge Cases', () => {
  // Store original localStorage
  let originalLocalStorage: Storage

  beforeEach(() => {
    // Store original localStorage
    originalLocalStorage = window.localStorage
    // Clear any existing data
    clearServerAddress()
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    })
    clearServerAddress()
    vi.restoreAllMocks()
  })

  /**
   * Test Suite: Empty String Input
   * Requirements: 3.3
   */
  describe('Empty String Input', () => {
    it('should return isValid: true for empty string', () => {
      const result = validateAddress('')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return isValid: true for whitespace-only string', () => {
      const result = validateAddress('   ')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return isValid: true for tab-only string', () => {
      const result = validateAddress('\t\t')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return isValid: true for mixed whitespace string', () => {
      const result = validateAddress('  \t  \n  ')
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should handle empty string in setServerAddress', () => {
      setServerAddress('')
      const result = getServerAddress()
      expect(result).toBe('')
    })

    it('should handle whitespace-only string in setServerAddress (trimmed)', () => {
      setServerAddress('   ')
      const result = getServerAddress()
      expect(result).toBe('')
    })

    it('should return default /api for empty server address', () => {
      setServerAddress('')
      const result = getApiBaseUrl()
      expect(result).toBe('/api')
    })
  })

  /**
   * Test Suite: Null and Undefined Handling
   * Note: TypeScript prevents null/undefined at compile time, but we test runtime behavior
   * Requirements: 3.3
   */
  describe('Null and Undefined Handling', () => {
    it('should handle null input gracefully in validateAddress', () => {
      // @ts-expect-error - Testing runtime behavior with null
      const result = validateAddress(null)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should handle undefined input gracefully in validateAddress', () => {
      // @ts-expect-error - Testing runtime behavior with undefined
      const result = validateAddress(undefined)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  /**
   * Test Suite: localStorage Unavailable Scenario
   * Requirements: 3.4
   */
  describe('localStorage Unavailable Scenario', () => {
    it('should fall back to memory storage when localStorage throws on setItem', () => {
      // Mock localStorage to throw on setItem
      const mockLocalStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError')
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Should not throw and should use memory storage
      expect(() => setServerAddress('http://localhost:8080')).not.toThrow()

      // Should retrieve from memory storage
      const address = getServerAddress()
      expect(address).toBe('http://localhost:8080')
    })

    it('should fall back to memory storage when localStorage throws on getItem', () => {
      // First set a value in memory by making localStorage unavailable
      const mockLocalStorage = {
        getItem: vi.fn(() => {
          throw new Error('SecurityError')
        }),
        setItem: vi.fn(() => {
          throw new Error('SecurityError')
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Set should use memory storage
      setServerAddress('http://example.com')

      // Get should use memory storage
      const address = getServerAddress()
      expect(address).toBe('http://example.com')
    })

    it('should return empty string when both localStorage and memory storage are empty', () => {
      // Clear everything first
      clearServerAddress()

      // Mock localStorage to be unavailable
      const mockLocalStorage = {
        getItem: vi.fn(() => {
          throw new Error('SecurityError')
        }),
        setItem: vi.fn(() => {
          throw new Error('SecurityError')
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      const address = getServerAddress()
      expect(address).toBe('')
    })

    it('should handle localStorage being completely undefined', () => {
      // Remove localStorage entirely
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
      })

      // Should not throw
      expect(() => setServerAddress('http://localhost:3000')).not.toThrow()
      expect(() => getServerAddress()).not.toThrow()
      expect(() => clearServerAddress()).not.toThrow()
    })
  })

  /**
   * Test Suite: Corrupted Data in localStorage
   * Requirements: 3.4
   */
  describe('Corrupted Data in localStorage', () => {
    it('should handle invalid JSON in localStorage', () => {
      // Set corrupted data directly
      const mockLocalStorage = {
        getItem: vi.fn(() => 'not valid json {{{'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 1,
        key: vi.fn(() => 'claude_code_server_address'),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Should return empty string and not throw
      const address = getServerAddress()
      expect(address).toBe('')

      // Should have attempted to remove corrupted data
      expect(mockLocalStorage.removeItem).toHaveBeenCalled()
    })

    it('should handle missing address field in stored config', () => {
      // Set data with missing address field
      const mockLocalStorage = {
        getItem: vi.fn(() => JSON.stringify({ lastUsed: Date.now() })),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 1,
        key: vi.fn(() => 'claude_code_server_address'),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Should return empty string
      const address = getServerAddress()
      expect(address).toBe('')
    })

    it('should handle non-string address field in stored config', () => {
      // Set data with non-string address
      const mockLocalStorage = {
        getItem: vi.fn(() => JSON.stringify({ address: 12345, lastUsed: Date.now() })),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 1,
        key: vi.fn(() => 'claude_code_server_address'),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Should return empty string
      const address = getServerAddress()
      expect(address).toBe('')
    })

    it('should handle null stored config', () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => 'null'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 1,
        key: vi.fn(() => 'claude_code_server_address'),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      const address = getServerAddress()
      expect(address).toBe('')
    })

    it('should handle array instead of object in stored config', () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => JSON.stringify(['http://localhost'])),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 1,
        key: vi.fn(() => 'claude_code_server_address'),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      const address = getServerAddress()
      expect(address).toBe('')
    })
  })

  /**
   * Test Suite: Storage Full Scenario
   * Requirements: 3.4
   */
  describe('Storage Full Scenario', () => {
    it('should gracefully handle QuotaExceededError and use memory storage', () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          const error = new Error('QuotaExceededError')
          error.name = 'QuotaExceededError'
          throw error
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Should not throw
      expect(() => setServerAddress('http://localhost:8080')).not.toThrow()

      // Should still be able to retrieve from memory
      const address = getServerAddress()
      expect(address).toBe('http://localhost:8080')
    })

    it('should continue working after storage full error', () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError')
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Multiple sets should all work via memory storage
      setServerAddress('http://server1.com')
      expect(getServerAddress()).toBe('http://server1.com')

      setServerAddress('http://server2.com')
      expect(getServerAddress()).toBe('http://server2.com')

      setServerAddress('http://server3.com')
      expect(getServerAddress()).toBe('http://server3.com')

      // setItem should have been called (includes availability checks and actual set attempts)
      expect(mockLocalStorage.setItem).toHaveBeenCalled()
    })
  })

  /**
   * Test Suite: clearServerAddress Edge Cases
   * Requirements: 3.4
   */
  describe('clearServerAddress Edge Cases', () => {
    it('should not throw when clearing empty storage', () => {
      expect(() => clearServerAddress()).not.toThrow()
    })

    it('should handle localStorage.removeItem throwing error', () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(() => {
          throw new Error('SecurityError')
        }),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      }
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
      })

      // Should not throw
      expect(() => clearServerAddress()).not.toThrow()
    })

    it('should clear both localStorage and memory storage', () => {
      // First set a value
      setServerAddress('http://localhost:8080')
      expect(getServerAddress()).toBe('http://localhost:8080')

      // Clear
      clearServerAddress()

      // Should return empty string
      expect(getServerAddress()).toBe('')
    })
  })

  /**
   * Test Suite: getApiBaseUrl Edge Cases
   * Requirements: 4.1, 4.2
   */
  describe('getApiBaseUrl Edge Cases', () => {
    it('should return /api when no server address is set', () => {
      clearServerAddress()
      expect(getApiBaseUrl()).toBe('/api')
    })

    it('should handle server address with trailing slash', () => {
      setServerAddress('http://localhost:8080/')
      expect(getApiBaseUrl()).toBe('http://localhost:8080/api')
    })

    it('should handle server address with multiple trailing slashes', () => {
      setServerAddress('http://localhost:8080///')
      expect(getApiBaseUrl()).toBe('http://localhost:8080/api')
    })

    it('should handle server address without trailing slash', () => {
      setServerAddress('http://localhost:8080')
      expect(getApiBaseUrl()).toBe('http://localhost:8080/api')
    })

    it('should handle HTTPS server address', () => {
      setServerAddress('https://secure.example.com')
      expect(getApiBaseUrl()).toBe('https://secure.example.com/api')
    })

    it('should handle server address with port', () => {
      setServerAddress('http://192.168.1.100:3000')
      expect(getApiBaseUrl()).toBe('http://192.168.1.100:3000/api')
    })
  })

  /**
   * Test Suite: validateAddress Edge Cases
   * Requirements: 2.1, 2.2, 2.3, 2.4
   */
  describe('validateAddress Edge Cases', () => {
    it('should reject URL with only protocol', () => {
      const result = validateAddress('http://')
      expect(result.isValid).toBe(false)
    })

    it('should reject URL with only protocol and slash', () => {
      const result = validateAddress('https:///')
      expect(result.isValid).toBe(false)
    })

    it('should reject malformed URLs', () => {
      const malformedUrls = [
        'http://[invalid',
        'http://example.com:abc',
        'http://:8080',
        'http://.',
        'http://..',
      ]

      for (const url of malformedUrls) {
        const result = validateAddress(url)
        expect(result.isValid).toBe(false)
      }
    })

    it('should accept valid localhost URLs', () => {
      const validUrls = [
        'http://localhost',
        'http://localhost:8080',
        'https://localhost:443',
        'http://localhost/path',
      ]

      for (const url of validUrls) {
        const result = validateAddress(url)
        expect(result.isValid).toBe(true)
      }
    })

    it('should accept valid IP address URLs', () => {
      const validUrls = [
        'http://127.0.0.1',
        'http://192.168.1.1:8080',
        'https://10.0.0.1:3000',
        'http://172.16.0.1/api',
      ]

      for (const url of validUrls) {
        const result = validateAddress(url)
        expect(result.isValid).toBe(true)
      }
    })

    it('should handle URLs with special characters in path', () => {
      const result = validateAddress('http://example.com/path/to/resource?query=value')
      expect(result.isValid).toBe(true)
    })

    it('should handle URLs with fragments', () => {
      const result = validateAddress('http://example.com/page#section')
      expect(result.isValid).toBe(true)
    })

    it('should handle URLs with authentication info', () => {
      const result = validateAddress('http://user:pass@example.com')
      expect(result.isValid).toBe(true)
    })

    it('should handle case-insensitive protocol', () => {
      const protocols = ['HTTP://', 'HTTPS://', 'Http://', 'Https://', 'hTtP://', 'hTtPs://']

      for (const protocol of protocols) {
        const result = validateAddress(`${protocol}example.com`)
        expect(result.isValid).toBe(true)
      }
    })
  })
})
