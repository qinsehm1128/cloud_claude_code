/**
 * Property-Based Tests for Server Address Manager
 *
 * Feature: dynamic-server-connection
 *
 * These tests use fast-check to verify URL validation properties hold across many random inputs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  validateAddress,
  setServerAddress,
  getServerAddress,
  clearServerAddress,
  getApiBaseUrl,
} from '../../src/services/serverAddressManager'

/**
 * Feature: dynamic-server-connection, Property 1: URL 验证一致性
 *
 * For any string input, if the string does not start with "http://" or "https://",
 * then `validateAddress` should return `isValid: false` with a protocol missing error message.
 *
 * **Validates: Requirements 2.1, 2.2**
 */
describe('Property 1: URL 验证一致性 (URL Validation Consistency)', () => {
  // Generator for strings that do NOT start with http:// or https://
  // This includes empty strings, strings with other protocols, and random strings
  const nonHttpStringArb = fc.oneof(
    // Random strings that don't start with http:// or https://
    fc.string().filter((s) => {
      const trimmed = s.trim()
      return (
        trimmed !== '' &&
        !trimmed.toLowerCase().startsWith('http://') &&
        !trimmed.toLowerCase().startsWith('https://')
      )
    }),
    // Strings with other protocols
    fc.constantFrom(
      'ftp://example.com',
      'file:///path/to/file',
      'ws://websocket.example.com',
      'wss://secure-websocket.example.com',
      'mailto:user@example.com',
      'tel:+1234567890',
      'ssh://user@host.com',
      'git://github.com/repo.git'
    ),
    // Strings that look like URLs but missing protocol
    fc.constantFrom(
      'example.com',
      'localhost:8080',
      'www.example.com',
      '192.168.1.1:3000',
      'example.com/path',
      '//example.com'
    ),
    // Malformed protocol prefixes
    fc.constantFrom(
      'http:example.com',
      'https:example.com',
      'http:/example.com',
      'https:/example.com',
      'htp://example.com',
      'htps://example.com',
      'HTTP//example.com',
      'HTTPS//example.com'
    )
  )

  it('should return isValid: false for strings without http:// or https:// protocol', () => {
    fc.assert(
      fc.property(nonHttpStringArb, (input) => {
        const result = validateAddress(input)

        // Should be invalid
        expect(result.isValid).toBe(false)

        // Should have an error message about protocol
        expect(result.error).toBeDefined()
        expect(result.error).toContain('http://')
        expect(result.error).toContain('https://')
      }),
      { numRuns: 100 }
    )
  })

  it('should return isValid: false for random alphanumeric strings without protocol', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9._-]+$/),
        (input) => {
          // Skip empty strings (they are valid by design)
          fc.pre(input.trim() !== '')

          const result = validateAddress(input)

          // Should be invalid since no protocol
          expect(result.isValid).toBe(false)
          expect(result.error).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return isValid: false for strings with partial protocol prefixes', () => {
    const partialProtocolArb = fc.constantFrom(
      'http:',
      'https:',
      'http:/',
      'https:/',
      'http',
      'https',
      'htt',
      'ht',
      'h'
    )

    fc.assert(
      fc.property(partialProtocolArb, (input) => {
        const result = validateAddress(input)

        expect(result.isValid).toBe(false)
        expect(result.error).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  it('should handle whitespace-padded strings without protocol', () => {
    // Generator for whitespace strings
    const whitespaceArb = fc
      .array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 })
      .map((arr) => arr.join(''))

    fc.assert(
      fc.property(
        fc.tuple(
          whitespaceArb,
          fc.constantFrom('example.com', 'localhost:8080', 'www.test.com'),
          whitespaceArb
        ),
        ([leadingSpace, domain, trailingSpace]) => {
          const input = `${leadingSpace}${domain}${trailingSpace}`

          // Skip if the trimmed result is empty
          fc.pre(input.trim() !== '')

          const result = validateAddress(input)

          expect(result.isValid).toBe(false)
          expect(result.error).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Feature: dynamic-server-connection, Property 2: 有效 URL 验证通过
 *
 * For any string starting with "http://" or "https://" that conforms to URL format,
 * `validateAddress` should return `isValid: true`.
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 2: 有效 URL 验证通过 (Valid URL Validation Passes)', () => {
  // Generator for valid domain names
  const domainArb = fc.oneof(
    // Simple domains
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.com$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.org$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.net$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.io$/),
    // Subdomains
    fc.stringMatching(/^[a-z][a-z0-9-]{0,10}\.[a-z][a-z0-9-]{0,10}\.com$/),
    // localhost
    fc.constant('localhost'),
    // IP addresses
    fc.tuple(
      fc.integer({ min: 1, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 1, max: 255 })
    ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)
  )

  // Generator for optional port numbers
  const portArb = fc.option(
    fc.integer({ min: 1, max: 65535 }).map((port) => `:${port}`),
    { nil: '' }
  )

  // Generator for optional paths
  const pathArb = fc.option(
    fc.stringMatching(/^\/[a-z0-9\-_/]{0,30}$/).filter((p) => !p.includes('//')),
    { nil: '' }
  )

  // Generator for valid HTTP URLs
  const validHttpUrlArb = fc
    .tuple(
      fc.constantFrom('http://', 'https://'),
      domainArb,
      portArb,
      pathArb
    )
    .map(([protocol, domain, port, path]) => `${protocol}${domain}${port}${path}`)

  it('should return isValid: true for valid HTTP/HTTPS URLs', () => {
    fc.assert(
      fc.property(validHttpUrlArb, (url) => {
        const result = validateAddress(url)

        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  it('should return isValid: true for common valid URL patterns', () => {
    const commonUrlsArb = fc.constantFrom(
      'http://localhost',
      'http://localhost:8080',
      'http://localhost:3000',
      'https://localhost',
      'https://localhost:443',
      'http://127.0.0.1',
      'http://127.0.0.1:8080',
      'https://127.0.0.1:443',
      'http://example.com',
      'https://example.com',
      'http://www.example.com',
      'https://www.example.com',
      'http://api.example.com',
      'https://api.example.com',
      'http://example.com:8080',
      'https://example.com:443',
      'http://example.com/api',
      'https://example.com/api/v1',
      'http://192.168.1.1',
      'http://192.168.1.1:8080',
      'https://10.0.0.1:3000',
      'http://sub.domain.example.com',
      'https://my-server.example.org'
    )

    fc.assert(
      fc.property(commonUrlsArb, (url) => {
        const result = validateAddress(url)

        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  it('should return isValid: true for URLs with various port numbers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http://', 'https://'),
        fc.constantFrom('localhost', 'example.com', '127.0.0.1'),
        fc.integer({ min: 1, max: 65535 }),
        (protocol, host, port) => {
          const url = `${protocol}${host}:${port}`
          const result = validateAddress(url)

          expect(result.isValid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return isValid: true for case-insensitive protocol prefixes', () => {
    const caseVariantProtocolArb = fc.constantFrom(
      'HTTP://',
      'HTTPS://',
      'Http://',
      'Https://',
      'hTtP://',
      'hTtPs://'
    )

    fc.assert(
      fc.property(
        caseVariantProtocolArb,
        fc.constantFrom('localhost', 'example.com', '127.0.0.1'),
        (protocol, host) => {
          const url = `${protocol}${host}`
          const result = validateAddress(url)

          expect(result.isValid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return isValid: true for empty string (uses default)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', '   ', '\t', '\n', '  \t  '),
        (emptyInput) => {
          const result = validateAddress(emptyInput)

          // Empty addresses are valid (will use default)
          expect(result.isValid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle whitespace-padded valid URLs', () => {
    // Generator for whitespace strings
    const whitespaceArb = fc
      .array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 })
      .map((arr) => arr.join(''))

    fc.assert(
      fc.property(
        fc.tuple(whitespaceArb, validHttpUrlArb, whitespaceArb),
        ([leadingSpace, url, trailingSpace]) => {
          const paddedUrl = `${leadingSpace}${url}${trailingSpace}`
          const result = validateAddress(paddedUrl)

          expect(result.isValid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * Feature: dynamic-server-connection, Property 3: 存储往返一致性
 *
 * For any valid server address, after calling `setServerAddress` to save it,
 * calling `getServerAddress` should return the same address value.
 *
 * **Validates: Requirements 3.1, 3.2**
 */
describe('Property 3: 存储往返一致性 (Storage Round-Trip Consistency)', () => {
  // Clear storage before and after each test to avoid test pollution
  beforeEach(() => {
    clearServerAddress()
  })

  afterEach(() => {
    clearServerAddress()
  })

  // Generator for valid domain names
  const domainArb = fc.oneof(
    // Simple domains
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.com$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.org$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.net$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.io$/),
    // Subdomains
    fc.stringMatching(/^[a-z][a-z0-9-]{0,10}\.[a-z][a-z0-9-]{0,10}\.com$/),
    // localhost
    fc.constant('localhost'),
    // IP addresses
    fc
      .tuple(
        fc.integer({ min: 1, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 1, max: 255 })
      )
      .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)
  )

  // Generator for optional port numbers
  const portArb = fc.option(
    fc.integer({ min: 1, max: 65535 }).map((port) => `:${port}`),
    { nil: '' }
  )

  // Generator for optional paths
  const pathArb = fc.option(
    fc.stringMatching(/^\/[a-z0-9\-_/]{0,30}$/).filter((p) => !p.includes('//')),
    { nil: '' }
  )

  // Generator for valid HTTP URLs
  const validHttpUrlArb = fc
    .tuple(fc.constantFrom('http://', 'https://'), domainArb, portArb, pathArb)
    .map(([protocol, domain, port, path]) => `${protocol}${domain}${port}${path}`)

  it('should return the same address after setServerAddress and getServerAddress', () => {
    fc.assert(
      fc.property(validHttpUrlArb, (address) => {
        // Clear before each iteration
        clearServerAddress()

        // Set the server address
        setServerAddress(address)

        // Get the server address
        const retrievedAddress = getServerAddress()

        // The retrieved address should match the original (trimmed)
        expect(retrievedAddress).toBe(address.trim())
      }),
      { numRuns: 100 }
    )
  })

  it('should preserve address across multiple set/get cycles', () => {
    fc.assert(
      fc.property(validHttpUrlArb, validHttpUrlArb, (address1, address2) => {
        // Clear before each iteration
        clearServerAddress()

        // First cycle
        setServerAddress(address1)
        expect(getServerAddress()).toBe(address1.trim())

        // Second cycle - should overwrite
        setServerAddress(address2)
        expect(getServerAddress()).toBe(address2.trim())
      }),
      { numRuns: 100 }
    )
  })

  it('should handle common valid URL patterns in storage round-trip', () => {
    const commonUrlsArb = fc.constantFrom(
      'http://localhost',
      'http://localhost:8080',
      'http://localhost:3000',
      'https://localhost',
      'https://localhost:443',
      'http://127.0.0.1',
      'http://127.0.0.1:8080',
      'https://127.0.0.1:443',
      'http://example.com',
      'https://example.com',
      'http://www.example.com',
      'https://www.example.com',
      'http://api.example.com',
      'https://api.example.com',
      'http://example.com:8080',
      'https://example.com:443',
      'http://example.com/api',
      'https://example.com/api/v1',
      'http://192.168.1.1',
      'http://192.168.1.1:8080',
      'https://10.0.0.1:3000',
      'http://sub.domain.example.com',
      'https://my-server.example.org'
    )

    fc.assert(
      fc.property(commonUrlsArb, (address) => {
        // Clear before each iteration
        clearServerAddress()

        // Set and get
        setServerAddress(address)
        const retrieved = getServerAddress()

        // Should match exactly
        expect(retrieved).toBe(address)
      }),
      { numRuns: 100 }
    )
  })

  it('should handle whitespace-padded addresses by trimming', () => {
    // Generator for whitespace strings
    const whitespaceArb = fc
      .array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 3 })
      .map((arr) => arr.join(''))

    fc.assert(
      fc.property(
        fc.tuple(whitespaceArb, validHttpUrlArb, whitespaceArb),
        ([leadingSpace, url, trailingSpace]) => {
          // Clear before each iteration
          clearServerAddress()

          const paddedUrl = `${leadingSpace}${url}${trailingSpace}`

          // Set the padded address
          setServerAddress(paddedUrl)

          // Get should return trimmed version
          const retrieved = getServerAddress()

          // Should be trimmed
          expect(retrieved).toBe(url.trim())
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return empty string after clearServerAddress', () => {
    fc.assert(
      fc.property(validHttpUrlArb, (address) => {
        // Set an address
        setServerAddress(address)

        // Verify it was set
        expect(getServerAddress()).toBe(address.trim())

        // Clear the address
        clearServerAddress()

        // Should return empty string
        expect(getServerAddress()).toBe('')
      }),
      { numRuns: 100 }
    )
  })

  it('should handle URLs with various port numbers in storage round-trip', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http://', 'https://'),
        fc.constantFrom('localhost', 'example.com', '127.0.0.1'),
        fc.integer({ min: 1, max: 65535 }),
        (protocol, host, port) => {
          // Clear before each iteration
          clearServerAddress()

          const url = `${protocol}${host}:${port}`

          // Set and get
          setServerAddress(url)
          const retrieved = getServerAddress()

          // Should match exactly
          expect(retrieved).toBe(url)
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * Feature: dynamic-server-connection, Property 5: URL 路径拼接正确性
 *
 * For any valid server address and API path, the concatenation result should be
 * in `{serverAddress}/api{path}` format, without duplicate slashes.
 *
 * **Validates: Requirements 4.4**
 */
describe('Property 5: URL 路径拼接正确性 (URL Path Concatenation Correctness)', () => {
  // Clear storage before and after each test to avoid test pollution
  beforeEach(() => {
    clearServerAddress()
  })

  afterEach(() => {
    clearServerAddress()
  })

  // Generator for valid domain names
  const domainArb = fc.oneof(
    // Simple domains
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.com$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.org$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.net$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.io$/),
    // Subdomains
    fc.stringMatching(/^[a-z][a-z0-9-]{0,10}\.[a-z][a-z0-9-]{0,10}\.com$/),
    // localhost
    fc.constant('localhost'),
    // IP addresses
    fc
      .tuple(
        fc.integer({ min: 1, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 1, max: 255 })
      )
      .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)
  )

  // Generator for optional port numbers
  const portArb = fc.option(
    fc.integer({ min: 1, max: 65535 }).map((port) => `:${port}`),
    { nil: '' }
  )

  // Generator for valid HTTP URLs (base server address without path)
  const validServerAddressArb = fc
    .tuple(fc.constantFrom('http://', 'https://'), domainArb, portArb)
    .map(([protocol, domain, port]) => `${protocol}${domain}${port}`)

  // Generator for trailing slashes (0 to 3 slashes)
  const trailingSlashesArb = fc
    .integer({ min: 0, max: 3 })
    .map((count) => '/'.repeat(count))

  it('should produce correct format {serverAddress}/api without duplicate slashes', () => {
    fc.assert(
      fc.property(validServerAddressArb, trailingSlashesArb, (baseAddress, trailingSlashes) => {
        // Clear before each iteration
        clearServerAddress()

        // Create address with trailing slashes
        const addressWithSlashes = `${baseAddress}${trailingSlashes}`

        // Set the server address
        setServerAddress(addressWithSlashes)

        // Get the API base URL
        const apiBaseUrl = getApiBaseUrl()

        // Property 1: Should not contain duplicate slashes (except in protocol)
        // Remove protocol prefix for checking
        const urlWithoutProtocol = apiBaseUrl.replace(/^https?:\/\//, '')
        expect(urlWithoutProtocol).not.toContain('//')

        // Property 2: Should be in format {serverAddress}/api
        expect(apiBaseUrl).toBe(`${baseAddress}/api`)

        // Property 3: Should end with /api (no trailing slash after /api)
        expect(apiBaseUrl).toMatch(/\/api$/)
        expect(apiBaseUrl).not.toMatch(/\/api\/$/)
      }),
      { numRuns: 100 }
    )
  })

  it('should handle server address with trailing slash correctly', () => {
    fc.assert(
      fc.property(validServerAddressArb, (baseAddress) => {
        // Clear before each iteration
        clearServerAddress()

        // Add trailing slash
        const addressWithTrailingSlash = `${baseAddress}/`

        // Set the server address
        setServerAddress(addressWithTrailingSlash)

        // Get the API base URL
        const apiBaseUrl = getApiBaseUrl()

        // Should not produce double slashes
        const urlWithoutProtocol = apiBaseUrl.replace(/^https?:\/\//, '')
        expect(urlWithoutProtocol).not.toContain('//')

        // Should be in correct format
        expect(apiBaseUrl).toBe(`${baseAddress}/api`)
      }),
      { numRuns: 100 }
    )
  })

  it('should handle server address without trailing slash correctly', () => {
    fc.assert(
      fc.property(validServerAddressArb, (baseAddress) => {
        // Clear before each iteration
        clearServerAddress()

        // Set the server address without trailing slash
        setServerAddress(baseAddress)

        // Get the API base URL
        const apiBaseUrl = getApiBaseUrl()

        // Should produce correct format
        expect(apiBaseUrl).toBe(`${baseAddress}/api`)

        // Should end with /api
        expect(apiBaseUrl).toMatch(/\/api$/)
      }),
      { numRuns: 100 }
    )
  })

  it('should always end with /api without trailing slash', () => {
    fc.assert(
      fc.property(validServerAddressArb, trailingSlashesArb, (baseAddress, trailingSlashes) => {
        // Clear before each iteration
        clearServerAddress()

        // Create address with various trailing slashes
        const address = `${baseAddress}${trailingSlashes}`

        // Set the server address
        setServerAddress(address)

        // Get the API base URL
        const apiBaseUrl = getApiBaseUrl()

        // Should always end with /api
        expect(apiBaseUrl.endsWith('/api')).toBe(true)

        // Should never end with /api/
        expect(apiBaseUrl.endsWith('/api/')).toBe(false)

        // Should never have trailing slash after /api
        expect(apiBaseUrl).not.toMatch(/\/api\/+$/)
      }),
      { numRuns: 100 }
    )
  })

  it('should handle common server addresses with various trailing slash patterns', () => {
    const commonAddressesArb = fc.constantFrom(
      'http://localhost',
      'http://localhost/',
      'http://localhost//',
      'http://localhost:8080',
      'http://localhost:8080/',
      'http://localhost:8080//',
      'https://localhost',
      'https://localhost/',
      'http://127.0.0.1',
      'http://127.0.0.1/',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:8080/',
      'http://example.com',
      'http://example.com/',
      'http://example.com//',
      'https://example.com',
      'https://example.com/',
      'http://api.example.com',
      'http://api.example.com/',
      'http://192.168.1.1:3000',
      'http://192.168.1.1:3000/',
      'https://my-server.example.org',
      'https://my-server.example.org/'
    )

    fc.assert(
      fc.property(commonAddressesArb, (address) => {
        // Clear before each iteration
        clearServerAddress()

        // Set the server address
        setServerAddress(address)

        // Get the API base URL
        const apiBaseUrl = getApiBaseUrl()

        // Remove trailing slashes from original address for comparison
        const normalizedAddress = address.replace(/\/+$/, '')

        // Should be in correct format
        expect(apiBaseUrl).toBe(`${normalizedAddress}/api`)

        // Should not contain duplicate slashes (except in protocol)
        const urlWithoutProtocol = apiBaseUrl.replace(/^https?:\/\//, '')
        expect(urlWithoutProtocol).not.toContain('//')

        // Should end with /api
        expect(apiBaseUrl.endsWith('/api')).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should return default /api when no server address is set', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Clear storage
        clearServerAddress()

        // Get the API base URL without setting any address
        const apiBaseUrl = getApiBaseUrl()

        // Should return default /api
        expect(apiBaseUrl).toBe('/api')
      }),
      { numRuns: 100 }
    )
  })

  it('should handle URLs with various port numbers correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http://', 'https://'),
        fc.constantFrom('localhost', 'example.com', '127.0.0.1'),
        fc.integer({ min: 1, max: 65535 }),
        trailingSlashesArb,
        (protocol, host, port, trailingSlashes) => {
          // Clear before each iteration
          clearServerAddress()

          const baseUrl = `${protocol}${host}:${port}`
          const addressWithSlashes = `${baseUrl}${trailingSlashes}`

          // Set the server address
          setServerAddress(addressWithSlashes)

          // Get the API base URL
          const apiBaseUrl = getApiBaseUrl()

          // Should be in correct format
          expect(apiBaseUrl).toBe(`${baseUrl}/api`)

          // Should not contain duplicate slashes (except in protocol)
          const urlWithoutProtocol = apiBaseUrl.replace(/^https?:\/\//, '')
          expect(urlWithoutProtocol).not.toContain('//')
        }
      ),
      { numRuns: 100 }
    )
  })
})
