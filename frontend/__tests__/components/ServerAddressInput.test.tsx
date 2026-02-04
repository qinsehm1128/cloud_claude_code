/**
 * ServerAddressInput Component Tests
 *
 * Tests for the ServerAddressInput component covering:
 * - Component rendering
 * - Input event handling
 * - Connection status display
 *
 * Requirements: 1.1, 1.2, 1.3, 5.2, 5.3, 5.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ServerAddressInput, ServerAddressInputProps } from '@/components/ServerAddressInput'

describe('ServerAddressInput', () => {
  let defaultProps: ServerAddressInputProps

  beforeEach(() => {
    defaultProps = {
      value: '',
      onChange: vi.fn(),
    }
  })

  describe('Component Rendering', () => {
    /**
     * Test: Component renders correctly with default props
     * Validates: Requirements 1.1
     */
    it('should render correctly with default props', () => {
      render(<ServerAddressInput {...defaultProps} />)

      // Should render the label
      expect(screen.getByText('服务器地址')).toBeInTheDocument()

      // Should render the input
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    /**
     * Test: Input displays placeholder text
     * Validates: Requirements 1.3
     */
    it('should display placeholder text', () => {
      render(<ServerAddressInput {...defaultProps} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('placeholder', 'http://localhost:8080')
    })

    /**
     * Test: Input displays the provided value
     * Validates: Requirements 1.2
     */
    it('should display the provided value', () => {
      render(<ServerAddressInput {...defaultProps} value="http://example.com:8080" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('http://example.com:8080')
    })

    /**
     * Test: Input has correct id for accessibility
     */
    it('should have correct id for accessibility', () => {
      render(<ServerAddressInput {...defaultProps} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('id', 'server-address')
    })
  })

  describe('Input Event Handling', () => {
    /**
     * Test: Input value updates when user types
     * Validates: Requirements 1.2
     */
    it('should call onChange when user types', () => {
      const mockOnChange = vi.fn()
      render(<ServerAddressInput {...defaultProps} onChange={mockOnChange} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'http://localhost:3000' } })

      expect(mockOnChange).toHaveBeenCalledWith('http://localhost:3000')
    })

    /**
     * Test: onChange is called with each keystroke
     */
    it('should call onChange with each input change', () => {
      const mockOnChange = vi.fn()
      render(<ServerAddressInput {...defaultProps} onChange={mockOnChange} />)

      const input = screen.getByRole('textbox')

      fireEvent.change(input, { target: { value: 'h' } })
      expect(mockOnChange).toHaveBeenCalledWith('h')

      fireEvent.change(input, { target: { value: 'ht' } })
      expect(mockOnChange).toHaveBeenCalledWith('ht')

      fireEvent.change(input, { target: { value: 'http' } })
      expect(mockOnChange).toHaveBeenCalledWith('http')

      expect(mockOnChange).toHaveBeenCalledTimes(3)
    })
  })

  describe('Error Message Display', () => {
    /**
     * Test: Error message displays when error prop is provided
     * Validates: Requirements 2.1, 2.2
     */
    it('should display error message when error prop is provided', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          error="请输入完整的服务器地址，包含 http:// 或 https://"
        />
      )

      expect(
        screen.getByText('请输入完整的服务器地址，包含 http:// 或 https://')
      ).toBeInTheDocument()
    })

    /**
     * Test: Error message has alert role for accessibility
     */
    it('should have alert role for error message', () => {
      render(
        <ServerAddressInput {...defaultProps} error="服务器地址格式无效" />
      )

      expect(screen.getByRole('alert')).toHaveTextContent('服务器地址格式无效')
    })

    /**
     * Test: Input has aria-invalid when error is present
     */
    it('should set aria-invalid when error is present', () => {
      render(<ServerAddressInput {...defaultProps} error="Invalid address" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
    })

    /**
     * Test: Input has aria-describedby pointing to error message
     */
    it('should have aria-describedby pointing to error message', () => {
      render(<ServerAddressInput {...defaultProps} error="Invalid address" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'server-address-error')

      const errorElement = screen.getByRole('alert')
      expect(errorElement).toHaveAttribute('id', 'server-address-error')
    })

    /**
     * Test: No error message when error prop is not provided
     */
    it('should not display error message when error prop is not provided', () => {
      render(<ServerAddressInput {...defaultProps} />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    /**
     * Test: Input has destructive border style when error is present
     */
    it('should apply error styling to input when error is present', () => {
      render(<ServerAddressInput {...defaultProps} error="Error" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('border-destructive')
    })
  })

  describe('Test Connection Button', () => {
    /**
     * Test: Test connection button renders when onTestConnection is provided
     * Validates: Requirements 5.1
     */
    it('should render test connection button when onTestConnection is provided', () => {
      const mockOnTestConnection = vi.fn()
      render(
        <ServerAddressInput
          {...defaultProps}
          onTestConnection={mockOnTestConnection}
        />
      )

      expect(screen.getByRole('button', { name: '测试连接' })).toBeInTheDocument()
    })

    /**
     * Test: Test connection button does not render when onTestConnection is not provided
     */
    it('should not render test connection button when onTestConnection is not provided', () => {
      render(<ServerAddressInput {...defaultProps} />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    /**
     * Test: Test connection button calls onTestConnection when clicked
     */
    it('should call onTestConnection when button is clicked', () => {
      const mockOnTestConnection = vi.fn()
      render(
        <ServerAddressInput
          {...defaultProps}
          onTestConnection={mockOnTestConnection}
        />
      )

      const button = screen.getByRole('button', { name: '测试连接' })
      fireEvent.click(button)

      expect(mockOnTestConnection).toHaveBeenCalledTimes(1)
    })

    /**
     * Test: Test connection button shows loading state when isTestingConnection is true
     * Validates: Requirements 5.4
     */
    it('should show loading state when isTestingConnection is true', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          onTestConnection={vi.fn()}
          isTestingConnection={true}
        />
      )

      // Button should show loading text
      expect(screen.getByRole('button', { name: '正在测试连接' })).toBeInTheDocument()
      expect(screen.getByText('测试中')).toBeInTheDocument()
    })

    /**
     * Test: Button is disabled during connection testing
     * Validates: Requirements 5.4
     */
    it('should disable button during connection testing', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          onTestConnection={vi.fn()}
          isTestingConnection={true}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    /**
     * Test: Button is enabled when not testing connection
     */
    it('should enable button when not testing connection', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          onTestConnection={vi.fn()}
          isTestingConnection={false}
        />
      )

      const button = screen.getByRole('button', { name: '测试连接' })
      expect(button).not.toBeDisabled()
    })
  })

  describe('Connection Status Display', () => {
    /**
     * Test: Connection success status shows green checkmark
     * Validates: Requirements 5.2
     */
    it('should show success indicator when connectionStatus is success', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          connectionStatus="success"
        />
      )

      expect(screen.getByLabelText('连接成功')).toBeInTheDocument()
    })

    /**
     * Test: Connection error status shows red X
     * Validates: Requirements 5.3
     */
    it('should show error indicator when connectionStatus is error', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          connectionStatus="error"
        />
      )

      expect(screen.getByLabelText('连接失败')).toBeInTheDocument()
    })

    /**
     * Test: No status indicator when connectionStatus is idle
     */
    it('should not show status indicator when connectionStatus is idle', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          connectionStatus="idle"
        />
      )

      expect(screen.queryByLabelText('连接成功')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('连接失败')).not.toBeInTheDocument()
    })

    /**
     * Test: No status indicator when connectionStatus is not provided (defaults to idle)
     */
    it('should not show status indicator when connectionStatus is not provided', () => {
      render(<ServerAddressInput {...defaultProps} />)

      expect(screen.queryByLabelText('连接成功')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('连接失败')).not.toBeInTheDocument()
    })

    /**
     * Test: Status indicator is hidden during connection testing
     * Validates: Requirements 5.4
     */
    it('should hide status indicator during connection testing', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          onTestConnection={vi.fn()}
          isTestingConnection={true}
          connectionStatus="success"
        />
      )

      // Status indicator should be hidden while testing
      expect(screen.queryByLabelText('连接成功')).not.toBeInTheDocument()
    })

    /**
     * Test: Success indicator has correct styling (green color)
     */
    it('should apply green color to success indicator', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          connectionStatus="success"
        />
      )

      const successIcon = screen.getByLabelText('连接成功')
      expect(successIcon).toHaveClass('text-green-500')
    })

    /**
     * Test: Error indicator has correct styling (destructive color)
     */
    it('should apply destructive color to error indicator', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          connectionStatus="error"
        />
      )

      const errorIcon = screen.getByLabelText('连接失败')
      expect(errorIcon).toHaveClass('text-destructive')
    })
  })

  describe('Combined Scenarios', () => {
    /**
     * Test: Component works correctly with all props provided
     */
    it('should handle all props correctly together', () => {
      const mockOnChange = vi.fn()
      const mockOnTestConnection = vi.fn()

      render(
        <ServerAddressInput
          value="http://test.example.com:8080"
          onChange={mockOnChange}
          error="Test error"
          onTestConnection={mockOnTestConnection}
          isTestingConnection={false}
          connectionStatus="idle"
        />
      )

      // Value should be displayed
      expect(screen.getByRole('textbox')).toHaveValue('http://test.example.com:8080')

      // Error should be displayed
      expect(screen.getByRole('alert')).toHaveTextContent('Test error')

      // Button should be present and enabled
      const button = screen.getByRole('button', { name: '测试连接' })
      expect(button).not.toBeDisabled()

      // Clicking button should call handler
      fireEvent.click(button)
      expect(mockOnTestConnection).toHaveBeenCalled()

      // Changing input should call onChange
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new value' } })
      expect(mockOnChange).toHaveBeenCalledWith('new value')
    })

    /**
     * Test: Error and success status can coexist (error message + success icon)
     */
    it('should display both error message and success status', () => {
      render(
        <ServerAddressInput
          {...defaultProps}
          error="Some validation error"
          connectionStatus="success"
        />
      )

      // Both should be visible
      expect(screen.getByRole('alert')).toHaveTextContent('Some validation error')
      expect(screen.getByLabelText('连接成功')).toBeInTheDocument()
    })
  })
})
