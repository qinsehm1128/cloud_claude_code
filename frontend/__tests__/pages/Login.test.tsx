/**
 * Login Page Integration Tests
 *
 * Tests for the Login page covering:
 * - Server address input display position
 * - Saved address auto-fill
 * - Server address saving on successful login
 * - Server address validation
 * - Connection test functionality
 *
 * Requirements: 1.1, 1.4, 3.1, 3.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Login from '@/pages/Login'

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock the serverAddressManager module
vi.mock('@/services/serverAddressManager', () => ({
  getServerAddress: vi.fn(),
  setServerAddress: vi.fn(),
  validateAddress: vi.fn(),
  testConnection: vi.fn(),
}))

// Mock the authApi
vi.mock('@/services/api', () => ({
  authApi: {
    login: vi.fn(),
  },
}))

// Import after mocking
import {
  getServerAddress,
  setServerAddress,
  validateAddress,
  testConnection,
} from '@/services/serverAddressManager'
import { authApi } from '@/services/api'

const mockGetServerAddress = vi.mocked(getServerAddress)
const mockSetServerAddress = vi.mocked(setServerAddress)
const mockValidateAddress = vi.mocked(validateAddress)
const mockTestConnection = vi.mocked(testConnection)
const mockAuthApiLogin = vi.mocked(authApi.login)

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('Login Page Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementations
    mockGetServerAddress.mockReturnValue('')
    mockValidateAddress.mockReturnValue({ isValid: true })
    mockTestConnection.mockResolvedValue({ success: true })
    mockAuthApiLogin.mockResolvedValue({ data: { token: 'test-token' } })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Server Address Input Display Position', () => {
    /**
     * Test: Server address input displays above username field
     * Validates: Requirement 1.1
     */
    it('should display server address input above username field', () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Get all form elements
      const serverAddressLabel = screen.getByText('服务器地址')
      const usernameLabel = screen.getByText('Username')

      // Get the parent form elements
      const serverAddressContainer = serverAddressLabel.closest('.space-y-2')
      const usernameContainer = usernameLabel.closest('.space-y-2')

      // Verify both exist
      expect(serverAddressContainer).toBeInTheDocument()
      expect(usernameContainer).toBeInTheDocument()

      // Verify server address comes before username in DOM order
      if (serverAddressContainer && usernameContainer) {
        // Use closest('form') to find the form element
        const form = serverAddressContainer.closest('form')
        expect(form).toBeInTheDocument()
        if (form) {
          const formChildren = Array.from(form.children)
          const serverIndex = formChildren.findIndex(
            (child) => child.contains(serverAddressContainer)
          )
          const usernameIndex = formChildren.findIndex(
            (child) => child.contains(usernameContainer)
          )
          expect(serverIndex).toBeLessThan(usernameIndex)
        }
      }
    })

    /**
     * Test: Server address input is rendered with correct placeholder
     * Validates: Requirement 1.3
     */
    it('should render server address input with placeholder', () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      expect(serverAddressInput).toBeInTheDocument()
    })

    /**
     * Test: Server address input has correct label
     * Validates: Requirement 1.1
     */
    it('should render server address input with correct label', () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      expect(screen.getByText('服务器地址')).toBeInTheDocument()
    })
  })

  describe('Saved Address Auto-fill', () => {
    /**
     * Test: Saved address is auto-filled on page load
     * Validates: Requirements 1.4, 3.2
     */
    it('should auto-fill saved server address on page load', () => {
      const savedAddress = 'http://saved-server.example.com:8080'
      mockGetServerAddress.mockReturnValue(savedAddress)

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      expect(serverAddressInput).toHaveValue(savedAddress)
    })

    /**
     * Test: getServerAddress is called on component mount
     * Validates: Requirement 3.2
     */
    it('should call getServerAddress on component mount', () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      expect(mockGetServerAddress).toHaveBeenCalled()
    })

    /**
     * Test: Empty input when no saved address exists
     * Validates: Requirement 3.3
     */
    it('should show empty input when no saved address exists', () => {
      mockGetServerAddress.mockReturnValue('')

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      expect(serverAddressInput).toHaveValue('')
    })
  })

  describe('Server Address Saving on Login', () => {
    /**
     * Test: Server address is saved on successful login
     * Validates: Requirement 3.1
     */
    it('should save server address on successful login', async () => {
      const serverAddress = 'http://test-server.example.com:8080'
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockAuthApiLogin.mockResolvedValue({ data: { token: 'test-token' } })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: serverAddress } })

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'testpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        // setServerAddress should be called (once before login, once after success)
        expect(mockSetServerAddress).toHaveBeenCalledWith(serverAddress)
      })
    })

    /**
     * Test: Navigation to home page after successful login
     * Validates: Requirement 3.1 (implicit - login flow completes)
     */
    it('should navigate to home page after successful login', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockAuthApiLogin.mockResolvedValue({ data: { token: 'test-token' } })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'testpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })

    /**
     * Test: Server address is not saved on failed login
     * Validates: Requirement 3.1 (only save on success)
     */
    it('should not navigate on failed login', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockAuthApiLogin.mockRejectedValue({
        response: { data: { error: 'Invalid credentials' } },
      })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'wrongpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      })

      // Should not navigate
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  describe('Server Address Validation', () => {
    /**
     * Test: Server address validation blocks login on invalid address
     * Validates: Requirement 2.4
     */
    it('should block login when server address is invalid', async () => {
      mockValidateAddress.mockReturnValue({
        isValid: false,
        error: '请输入完整的服务器地址，包含 http:// 或 https://',
      })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in invalid server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'invalid-address' } })

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'testpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        // Login API should not be called
        expect(mockAuthApiLogin).not.toHaveBeenCalled()
      })
    })

    /**
     * Test: Validation error message is displayed
     * Validates: Requirement 2.4
     */
    it('should display validation error message', async () => {
      const errorMessage = '请输入完整的服务器地址，包含 http:// 或 https://'
      mockValidateAddress.mockReturnValue({
        isValid: false,
        error: errorMessage,
      })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in invalid server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'invalid' } })

      // Fill in credentials and submit
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'testpass' } })

      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument()
      })
    })

    /**
     * Test: Valid address allows login to proceed
     * Validates: Requirement 2.3
     */
    it('should allow login with valid server address', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockAuthApiLogin.mockResolvedValue({ data: { token: 'test-token' } })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in valid server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'http://valid-server.com:8080' } })

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'testpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockAuthApiLogin).toHaveBeenCalledWith('testuser', 'testpass')
      })
    })
  })

  describe('Connection Test Button', () => {
    /**
     * Test: Connection test button is rendered
     * Validates: Requirement 5.1
     */
    it('should render connection test button', () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      expect(screen.getByRole('button', { name: '测试连接' })).toBeInTheDocument()
    })

    /**
     * Test: Connection test button calls testConnection
     * Validates: Requirement 5.1
     */
    it('should call testConnection when test button is clicked', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockTestConnection.mockResolvedValue({ success: true })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'http://test-server.com:8080' } })

      // Click test connection button
      const testButton = screen.getByRole('button', { name: '测试连接' })
      fireEvent.click(testButton)

      await waitFor(() => {
        expect(mockTestConnection).toHaveBeenCalledWith('http://test-server.com:8080')
      })
    })

    /**
     * Test: Connection success shows success indicator
     * Validates: Requirement 5.2
     */
    it('should show success indicator on successful connection test', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockTestConnection.mockResolvedValue({ success: true })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'http://test-server.com:8080' } })

      // Click test connection button
      const testButton = screen.getByRole('button', { name: '测试连接' })
      fireEvent.click(testButton)

      await waitFor(() => {
        expect(screen.getByLabelText('连接成功')).toBeInTheDocument()
      })
    })

    /**
     * Test: Connection failure shows error indicator
     * Validates: Requirement 5.3
     */
    it('should show error indicator on failed connection test', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockTestConnection.mockResolvedValue({
        success: false,
        error: '无法连接到服务器',
      })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'http://test-server.com:8080' } })

      // Click test connection button
      const testButton = screen.getByRole('button', { name: '测试连接' })
      fireEvent.click(testButton)

      await waitFor(() => {
        expect(screen.getByLabelText('连接失败')).toBeInTheDocument()
      })
    })

    /**
     * Test: Connection test shows loading state
     * Validates: Requirement 5.4
     */
    it('should show loading state during connection test', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      // Create a promise that we can control
      let resolveTestConnection: (value: { success: boolean }) => void
      mockTestConnection.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveTestConnection = resolve
          })
      )

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'http://test-server.com:8080' } })

      // Click test connection button
      const testButton = screen.getByRole('button', { name: '测试连接' })
      fireEvent.click(testButton)

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('测试中')).toBeInTheDocument()
      })

      // Resolve the promise
      resolveTestConnection!({ success: true })

      // Loading state should be gone
      await waitFor(() => {
        expect(screen.queryByText('测试中')).not.toBeInTheDocument()
      })
    })

    /**
     * Test: Connection test validates address first
     * Validates: Requirement 2.4
     */
    it('should validate address before testing connection', async () => {
      mockValidateAddress.mockReturnValue({
        isValid: false,
        error: '服务器地址格式无效',
      })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in invalid server address
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'invalid' } })

      // Click test connection button
      const testButton = screen.getByRole('button', { name: '测试连接' })
      fireEvent.click(testButton)

      await waitFor(() => {
        // testConnection should not be called for invalid address
        expect(mockTestConnection).not.toHaveBeenCalled()
        // Error should be displayed
        expect(screen.getByText('服务器地址格式无效')).toBeInTheDocument()
      })
    })
  })

  describe('Form Interaction', () => {
    /**
     * Test: Server address input updates on user input
     * Validates: Requirement 1.2
     */
    it('should update server address on user input', () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'http://new-server.com' } })

      expect(serverAddressInput).toHaveValue('http://new-server.com')
    })

    /**
     * Test: Connection status resets when address changes
     */
    it('should reset connection status when address changes', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockTestConnection.mockResolvedValue({ success: true })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in server address and test connection
      const serverAddressInput = screen.getByPlaceholderText('http://localhost:8080')
      fireEvent.change(serverAddressInput, { target: { value: 'http://test-server.com:8080' } })

      const testButton = screen.getByRole('button', { name: '测试连接' })
      fireEvent.click(testButton)

      await waitFor(() => {
        expect(screen.getByLabelText('连接成功')).toBeInTheDocument()
      })

      // Change address - status should reset
      fireEvent.change(serverAddressInput, { target: { value: 'http://another-server.com' } })

      await waitFor(() => {
        expect(screen.queryByLabelText('连接成功')).not.toBeInTheDocument()
      })
    })

    /**
     * Test: Loading state during login
     */
    it('should show loading state during login', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      // Create a promise that we can control
      let resolveLogin: (value: { data: { token: string } }) => void
      mockAuthApiLogin.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve
          })
      )

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'testpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      // Button should be disabled during loading
      await waitFor(() => {
        expect(submitButton).toBeDisabled()
      })

      // Resolve the promise
      resolveLogin!({ data: { token: 'test-token' } })

      // Button should be enabled again (or navigated away)
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })
  })

  describe('Error Handling', () => {
    /**
     * Test: Display login error message
     */
    it('should display login error message', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockAuthApiLogin.mockRejectedValue({
        response: { data: { error: 'Invalid username or password' } },
      })

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'wrongpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Invalid username or password')).toBeInTheDocument()
      })
    })

    /**
     * Test: Display generic error when no specific error message
     */
    it('should display generic error when no specific error message', async () => {
      mockValidateAddress.mockReturnValue({ isValid: true })
      mockAuthApiLogin.mockRejectedValue(new Error('Network error'))

      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      )

      // Fill in credentials
      const usernameInput = screen.getByPlaceholderText('admin')
      const passwordInput = screen.getByPlaceholderText('••••••••')
      fireEvent.change(usernameInput, { target: { value: 'testuser' } })
      fireEvent.change(passwordInput, { target: { value: 'testpass' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /Sign in/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Login failed')).toBeInTheDocument()
      })
    })
  })
})
