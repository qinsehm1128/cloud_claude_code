/**
 * Unit Tests for API Client
 *
 * Feature: dynamic-server-connection
 *
 * These tests verify the API client's dynamic baseURL behavior and CORS configuration.
 * Requirements: 4.2, 6.3, 6.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getBaseUrl,
  getContainerConversations,
  deleteContainerConversation,
} from '../../src/services/api'
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

describe('API Client - Container Conversations', () => {
  beforeEach(() => {
    clearServerAddress()
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearServerAddress()
    vi.unstubAllGlobals()
  })

  it('should fetch container conversations with typed payload', async () => {
    setServerAddress('http://localhost:8088/')

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([
        {
          id: '101',
          title: 'Session 101',
          state: 'running',
          is_running: true,
          total_turns: 12,
          created_at: '2026-02-11T08:10:00Z',
          updated_at: '2026-02-11T08:20:00Z',
        },
      ]),
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await getContainerConversations(5)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8088/api/containers/5/conversations',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      })
    )
    expect(result).toEqual([
      {
        id: 101,
        title: 'Session 101',
        state: 'running',
        is_running: true,
        total_turns: 12,
        created_at: '2026-02-11T08:10:00Z',
        updated_at: '2026-02-11T08:20:00Z',
      },
    ])
  })

  it('should throw container not found error for 404 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({}),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(getContainerConversations(999)).rejects.toThrow('Container not found')
  })

  it('should throw timeout error when request is aborted', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    vi.stubGlobal('fetch', fetchMock)

    await expect(getContainerConversations(1)).rejects.toThrow('Request timed out while fetching conversations')
  })

  it('should reject invalid payload shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ conversations: [] }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(getContainerConversations(1)).rejects.toThrow('Invalid conversation list response')
  })
})

describe('API Client - Delete Container Conversation', () => {
  beforeEach(() => {
    clearServerAddress()
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearServerAddress()
    vi.unstubAllGlobals()
  })

  it('should delete a container conversation', async () => {
    setServerAddress('http://localhost:8088/')

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(5, 101)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8088/api/containers/5/conversations/101',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
      })
    )
  })

  it('should throw conversation not found for 404 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({}),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(1, 999)).rejects.toThrow('Conversation not found')
  })

  it('should throw running conversation error for 409 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({}),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(1, 2)).rejects.toThrow('Conversation is running and cannot be deleted')
  })

  it('should throw timeout error when delete request is aborted', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(1, 2)).rejects.toThrow('Request timed out while deleting conversation')
  })

  it('should throw running error for 423 locked response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 423,
      json: vi.fn().mockResolvedValue({}),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(1, 2)).rejects.toThrow('Conversation is running and cannot be deleted')
  })

  it('should use server error message when available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'Internal database error' }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(1, 2)).rejects.toThrow('Internal database error')
  })

  it('should fallback to generic message for unknown status codes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({}),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(1, 2)).rejects.toThrow('Failed to delete conversation (503)')
  })
})

describe('API Client - Conversation Error Parsing', () => {
  beforeEach(() => {
    clearServerAddress()
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearServerAddress()
    vi.unstubAllGlobals()
  })

  it('should use message field when error field is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: 'Bad request parameters' }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(getContainerConversations(1)).rejects.toThrow('Bad request parameters')
  })

  it('should handle generic non-404 error response for conversations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({}),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(getContainerConversations(1)).rejects.toThrow('Failed to fetch conversations (500)')
  })

  it('should handle non-Error thrown objects in getContainerConversations', async () => {
    const fetchMock = vi.fn().mockRejectedValue('string error')

    vi.stubGlobal('fetch', fetchMock)

    await expect(getContainerConversations(1)).rejects.toThrow('Failed to fetch conversations')
  })

  it('should handle non-Error thrown objects in deleteContainerConversation', async () => {
    const fetchMock = vi.fn().mockRejectedValue('string error')

    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteContainerConversation(1, 2)).rejects.toThrow('Failed to delete conversation')
  })

  it('should parse conversation with string id to number', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([
        {
          id: '999',
          title: null,
          state: null,
          is_running: null,
          total_turns: null,
          created_at: null,
          updated_at: null,
        },
      ]),
    })

    vi.stubGlobal('fetch', fetchMock)

    const result = await getContainerConversations(1)

    expect(result).toEqual([
      {
        id: 999,
        title: '',
        state: 'idle',
        is_running: false,
        total_turns: 0,
        created_at: '',
        updated_at: '',
      },
    ])
  })
})

