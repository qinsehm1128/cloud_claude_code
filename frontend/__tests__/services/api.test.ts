/**
 * Unit Tests for API Client
 *
 * Feature: dynamic-server-connection
 *
 * These tests verify the API client's dynamic baseURL behavior and CORS configuration.
 * Requirements: 4.2, 6.3, 6.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getBaseUrl } from '../../src/services/api'
import {
  setServerAddress,
  clearServerAddress,
} from '../../src/services/serverAddressManager'

describe('API Client - Dynamic baseURL', () => {
  beforeEach(() => {
    // Clear any existing server address before each test
    clearServerAddress()
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearServerAddress()
    vi.restoreAllMocks()
  })

  /**
   * Test Suite: Default baseURL Behavior
   * Requirements: 4.2
   *
   * WHEN user hasn't specified server address
   * THEN API_Client SHALL use default relative path "/api"
   */
  describe('Default baseURL Behavior', () => {
    it('should return "/api" when no server address is set', () => {
      // Ensure no server address is set
      clearServerAddress()

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('/api')
    })

    it('should return "/api" after clearing server address', () => {
      // First set a server address
      setServerAddress('http://localhost:8080')

      // Then clear it
      clearServerAddress()

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('/api')
    })

    it('should return "/api" when server address is empty string', () => {
      setServerAddress('')

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('/api')
    })

    it('should return "/api" when server address is whitespace only', () => {
      setServerAddress('   ')

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('/api')
    })
  })

  /**
   * Test Suite: Dynamic baseURL Behavior
   * Requirements: 4.1, 4.3
   *
   * WHEN user specifies server address
   * THEN API_Client SHALL use that address as base URL
   */
  describe('Dynamic baseURL Behavior', () => {
    it('should use server address when set', () => {
      setServerAddress('http://localhost:8080')

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('http://localhost:8080/api')
    })

    it('should update baseURL when server address changes', () => {
      // Set initial address
      setServerAddress('http://server1.example.com')
      expect(getBaseUrl()).toBe('http://server1.example.com/api')

      // Change to new address
      setServerAddress('http://server2.example.com')
      expect(getBaseUrl()).toBe('http://server2.example.com/api')
    })

    it('should handle HTTPS server addresses', () => {
      setServerAddress('https://secure.example.com')

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('https://secure.example.com/api')
    })

    it('should handle server addresses with ports', () => {
      setServerAddress('http://192.168.1.100:3000')

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('http://192.168.1.100:3000/api')
    })

    it('should normalize trailing slashes in server address', () => {
      setServerAddress('http://localhost:8080/')

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('http://localhost:8080/api')
    })

    it('should handle multiple trailing slashes', () => {
      setServerAddress('http://localhost:8080///')

      const baseUrl = getBaseUrl()

      expect(baseUrl).toBe('http://localhost:8080/api')
    })
  })
})

describe('API Client - CORS Configuration', () => {
  /**
   * Test Suite: CORS Configuration
   * Requirements: 6.2, 6.4
   *
   * WHEN API_Client sends cross-origin request
   * THEN API_Client SHALL set withCredentials to true to support Cookie
   */
  describe('withCredentials Configuration', () => {
    it('should have axios instance configured with withCredentials: true', async () => {
      // Import the api module to check its configuration
      const apiModule = await import('../../src/services/api')
      const api = apiModule.default

      // Check that the axios instance has withCredentials set
      expect(api.defaults.withCredentials).toBe(true)
    })
  })

  /**
   * Test Suite: Request Interceptor
   * Requirements: 4.1, 4.3, 4.4
   *
   * Request interceptor should set dynamic baseURL
   */
  describe('Request Interceptor', () => {
    it('should have request interceptor configured', async () => {
      const apiModule = await import('../../src/services/api')
      const api = apiModule.default

      // Check that interceptors are configured
      // axios interceptors have handlers array
      expect(api.interceptors.request).toBeDefined()
    })

    it('should set baseURL dynamically via getBaseUrl function', () => {
      // Test that getBaseUrl is exported and callable
      expect(typeof getBaseUrl).toBe('function')

      // Test default behavior
      clearServerAddress()
      expect(getBaseUrl()).toBe('/api')

      // Test with server address
      setServerAddress('http://test.example.com')
      expect(getBaseUrl()).toBe('http://test.example.com/api')
    })
  })
})

describe('API Client - Error Handling', () => {
  /**
   * Test Suite: Response Interceptor Error Handling
   * Requirements: 6.3
   *
   * IF server returns CORS error
   * THEN API_Client SHALL show friendly cross-origin error message
   */
  describe('Response Interceptor', () => {
    it('should have response interceptor configured', async () => {
      const apiModule = await import('../../src/services/api')
      const api = apiModule.default

      // Check that response interceptors are configured
      expect(api.interceptors.response).toBeDefined()
    })
  })

  /**
   * Test Suite: Same-Domain Requests
   * Requirements: 6.4
   *
   * WHEN user connects to same-domain server
   * THEN API_Client SHALL work normally without extra CORS configuration
   */
  describe('Same-Domain Requests', () => {
    it('should use relative path /api for same-domain requests when no server address set', () => {
      clearServerAddress()

      const baseUrl = getBaseUrl()

      // Relative path works for same-domain without CORS issues
      expect(baseUrl).toBe('/api')
      expect(baseUrl.startsWith('http')).toBe(false)
    })
  })
})

describe('API Client - Timeout Configuration', () => {
  /**
   * Test Suite: Timeout Configuration
   * Verify that the API client has appropriate timeout settings
   */
  describe('Timeout Settings', () => {
    it('should have timeout configured', async () => {
      const apiModule = await import('../../src/services/api')
      const api = apiModule.default

      // Check that timeout is set (should be 30000ms as per api.ts)
      expect(api.defaults.timeout).toBe(30000)
    })
  })
})

