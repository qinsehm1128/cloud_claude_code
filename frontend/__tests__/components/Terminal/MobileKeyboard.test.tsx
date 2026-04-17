import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as fc from 'fast-check'
import { MobileKeyboard } from '@/components/Terminal/MobileKeyboard'

describe('MobileKeyboard', () => {
  const defaultProps = {
    onSendCommand: vi.fn(),
    onSendKeys: vi.fn(),
    visible: true,
    onVisibilityChange: vi.fn(),
    connected: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('rendering', () => {
    it('should render when visible is true', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      expect(screen.getByText('Virtual Keyboard')).toBeInTheDocument()
    })

    it('should not render when visible is false', () => {
      render(<MobileKeyboard {...defaultProps} visible={false} />)
      
      expect(screen.queryByText('Virtual Keyboard')).not.toBeInTheDocument()
    })

    it('should show disconnected indicator when not connected', () => {
      render(<MobileKeyboard {...defaultProps} connected={false} />)
      
      expect(screen.getByText('(Disconnected)')).toBeInTheDocument()
    })

    it('should render quick keys', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      expect(screen.getByText('Ctrl+C')).toBeInTheDocument()
      expect(screen.getByText('Tab')).toBeInTheDocument()
    })

    it('should render modifier buttons', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      expect(screen.getByTitle('Toggle Ctrl modifier')).toBeInTheDocument()
      expect(screen.getByTitle('Toggle Alt modifier')).toBeInTheDocument()
    })
  })

  describe('collapse/expand', () => {
    it('should toggle collapsed state when clicking collapse button', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      // Initially expanded - should show full quick keys
      expect(screen.getByText('Ctrl+D')).toBeInTheDocument()
      
      // Click collapse button
      const collapseButton = screen.getByTitle('Collapse keyboard')
      fireEvent.click(collapseButton)
      
      // Should now be collapsed - Ctrl+D should not be visible (only minimal keys)
      expect(screen.queryByText('Ctrl+D')).not.toBeInTheDocument()
    })

    it('should show minimal quick keys when collapsed', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      // Collapse
      const collapseButton = screen.getByTitle('Collapse keyboard')
      fireEvent.click(collapseButton)
      
      // Should still show essential keys
      expect(screen.getByText('Ctrl+C')).toBeInTheDocument()
      expect(screen.getByText('Tab')).toBeInTheDocument()
    })
  })

  describe('modifier keys', () => {
    it('should toggle Ctrl modifier when clicking Ctrl button', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      const ctrlButton = screen.getByRole('button', { name: /^ctrl$/i })
      
      // Initially not active
      expect(ctrlButton).not.toHaveClass('ring-2')
      
      // Click to activate
      fireEvent.click(ctrlButton)
      
      // Should show activation hint
      expect(screen.getByText('Type a key to send combination')).toBeInTheDocument()
    })

    it('should toggle Alt modifier when clicking Alt button', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      const altButton = screen.getByRole('button', { name: /^alt$/i })
      
      // Click to activate
      fireEvent.click(altButton)
      
      // Should show activation hint
      expect(screen.getByText('Type a key to send combination')).toBeInTheDocument()
    })

    /**
     * Property 12: Modifier Auto-Deactivation
     * For any key combination sent with an active modifier,
     * the modifier SHALL be inactive immediately after.
     * Validates: Requirements 5.3
     */
    it('Property 12: should deactivate modifier after sending key combination', async () => {
      const onSendKeys = vi.fn()
      render(<MobileKeyboard {...defaultProps} onSendKeys={onSendKeys} />)
      
      // Activate Ctrl
      const ctrlButton = screen.getByRole('button', { name: /^ctrl$/i })
      fireEvent.click(ctrlButton)
      
      // Type a key in the input
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.keyDown(textarea, { key: 'c' })
      
      // Should have sent Ctrl+C
      expect(onSendKeys).toHaveBeenCalledWith('\x03')
      
      // Modifier should be deactivated - hint should change back
      await waitFor(() => {
        expect(screen.getByText('Click to activate modifier')).toBeInTheDocument()
      })
    })

    it('should deactivate both modifiers after use', async () => {
      const onSendKeys = vi.fn()
      render(<MobileKeyboard {...defaultProps} onSendKeys={onSendKeys} />)
      
      // Activate both Ctrl and Alt
      const ctrlButton = screen.getByRole('button', { name: /^ctrl$/i })
      const altButton = screen.getByRole('button', { name: /^alt$/i })
      fireEvent.click(ctrlButton)
      fireEvent.click(altButton)
      
      // Type a key
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.keyDown(textarea, { key: 'x' })
      
      // Both modifiers should be deactivated
      await waitFor(() => {
        expect(screen.getByText('Click to activate modifier')).toBeInTheDocument()
      })
    })
  })

  describe('command sending', () => {
    it('should send command with newline when clicking send', () => {
      const onSendCommand = vi.fn()
      render(<MobileKeyboard {...defaultProps} onSendCommand={onSendCommand} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.change(textarea, { target: { value: 'ls -la' } })
      
      const sendButton = screen.getByTitle('Send command (Enter)')
      fireEvent.click(sendButton)
      
      expect(onSendCommand).toHaveBeenCalledWith('ls -la\r')
    })

    it('should clear input after sending command', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.change(textarea, { target: { value: 'test' } })
      
      const sendButton = screen.getByTitle('Send command (Enter)')
      fireEvent.click(sendButton)
      
      expect(textarea).toHaveValue('')
    })

    it('should add command to history after sending', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.change(textarea, { target: { value: 'history-test' } })
      
      const sendButton = screen.getByTitle('Send command (Enter)')
      fireEvent.click(sendButton)
      
      // Open history
      const historyButton = screen.getByTitle('Command history')
      fireEvent.click(historyButton)
      
      expect(screen.getByText('history-test')).toBeInTheDocument()
    })
  })

  describe('quick keys', () => {
    it('should send key sequence when clicking quick key', () => {
      const onSendKeys = vi.fn()
      render(<MobileKeyboard {...defaultProps} onSendKeys={onSendKeys} />)
      
      const ctrlCButton = screen.getByText('Ctrl+C')
      fireEvent.click(ctrlCButton)
      
      expect(onSendKeys).toHaveBeenCalledWith('\x03')
    })
  })

  describe('history', () => {
    it('should open history panel when clicking history button', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      const historyButton = screen.getByTitle('Command history')
      fireEvent.click(historyButton)
      
      expect(screen.getByText('Command History')).toBeInTheDocument()
    })

    it('should populate input when selecting from history', () => {
      render(<MobileKeyboard {...defaultProps} />)
      
      // Send a command first
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.change(textarea, { target: { value: 'previous-command' } })
      const sendButton = screen.getByTitle('Send command (Enter)')
      fireEvent.click(sendButton)
      
      // Open history and select
      const historyButton = screen.getByTitle('Command history')
      fireEvent.click(historyButton)
      
      const historyItem = screen.getByText('previous-command')
      fireEvent.click(historyItem)
      
      expect(textarea).toHaveValue('previous-command')
    })
  })

  describe('disabled state', () => {
    it('should disable all interactive elements when not connected', () => {
      render(<MobileKeyboard {...defaultProps} connected={false} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      expect(textarea).toBeDisabled()
      
      const ctrlButton = screen.getByRole('button', { name: /^ctrl$/i })
      expect(ctrlButton).toBeDisabled()
      
      const altButton = screen.getByRole('button', { name: /^alt$/i })
      expect(altButton).toBeDisabled()
    })
  })
})

describe('MobileKeyboard - Property 13: Touch Target Size', () => {
  const defaultProps = {
    onSendCommand: vi.fn(),
    onSendKeys: vi.fn(),
    visible: true,
    onVisibilityChange: vi.fn(),
    connected: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  /**
   * Property 13: Touch Target Size
   * For any interactive button in the keyboard,
   * its dimensions SHALL be at least 44x44 pixels.
   * Validates: Requirements 6.4
   */
  it('should have minimum touch target size for modifier buttons', () => {
    render(<MobileKeyboard {...defaultProps} />)
    
    // Check modifier buttons
    const ctrlButton = screen.getByTitle('Toggle Ctrl modifier')
    expect(ctrlButton.className).toContain('min-w-[44px]')
    expect(ctrlButton.className).toContain('min-h-[44px]')
    
    const altButton = screen.getByTitle('Toggle Alt modifier')
    expect(altButton.className).toContain('min-w-[44px]')
    expect(altButton.className).toContain('min-h-[44px]')
  })

  it('should have minimum touch target size for send and history buttons', () => {
    render(<MobileKeyboard {...defaultProps} />)
    
    // Check send button
    const sendButton = screen.getByTitle('Send command (Enter)')
    expect(sendButton.className).toContain('min-w-[44px]')
    expect(sendButton.className).toContain('min-h-[44px]')
    
    // Check history button
    const historyButton = screen.getByTitle('Command history')
    expect(historyButton.className).toContain('min-w-[44px]')
    expect(historyButton.className).toContain('min-h-[44px]')
  })

  it('should have minimum touch target size for quick keys', () => {
    render(<MobileKeyboard {...defaultProps} />)
    
    // Check all quick key buttons in the toolbar
    const toolbar = screen.getByRole('toolbar')
    const buttons = toolbar.querySelectorAll('button')
    
    buttons.forEach(button => {
      expect(button.className).toContain('min-w-[44px]')
      expect(button.className).toContain('min-h-[44px]')
    })
  })
})
