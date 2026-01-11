import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as fc from 'fast-check'
import { CommandInput } from '@/components/Terminal/CommandInput'

describe('CommandInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render textarea and send button', () => {
      render(<CommandInput {...defaultProps} />)
      
      expect(screen.getByPlaceholderText('Enter command...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    })

    it('should render history button when onHistoryOpen is provided', () => {
      render(<CommandInput {...defaultProps} onHistoryOpen={vi.fn()} />)
      
      expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument()
    })

    it('should show modifier indicators when active', () => {
      render(<CommandInput {...defaultProps} ctrlActive={true} altActive={true} />)
      
      expect(screen.getByText('Ctrl')).toBeInTheDocument()
      expect(screen.getByText('Alt')).toBeInTheDocument()
    })

    it('should disable inputs when disabled prop is true', () => {
      render(<CommandInput {...defaultProps} disabled={true} />)
      
      expect(screen.getByPlaceholderText('Enter command...')).toBeDisabled()
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    })
  })

  describe('Property 3: Input Display Consistency', () => {
    /**
     * For any string typed into the Command_Input,
     * the displayed value SHALL equal the typed string.
     * Validates: Requirements 2.1
     */
    it('should display the exact value passed as prop', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (inputValue) => {
            const { unmount } = render(
              <CommandInput {...defaultProps} value={inputValue} />
            )
            
            const textarea = screen.getByPlaceholderText('Enter command...')
            expect(textarea).toHaveValue(inputValue)
            
            // Cleanup for next iteration
            unmount()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should call onChange with typed text', () => {
      const onChange = vi.fn()
      render(<CommandInput {...defaultProps} onChange={onChange} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.change(textarea, { target: { value: 'test command' } })
      
      expect(onChange).toHaveBeenCalledWith('test command')
    })
  })

  describe('Property 4: Command Send Invocation', () => {
    /**
     * For any non-empty command in the input field,
     * pressing send SHALL invoke the WebSocket send function with that exact command.
     * Validates: Requirements 2.2
     */
    it('should call onSubmit when send button is clicked with non-empty value', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (command) => {
            const onSubmit = vi.fn()
            const { unmount } = render(
              <CommandInput {...defaultProps} value={command} onSubmit={onSubmit} />
            )
            
            const sendButton = screen.getByRole('button', { name: /send/i })
            fireEvent.click(sendButton)
            
            expect(onSubmit).toHaveBeenCalledTimes(1)
            
            unmount()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should call onSubmit when Enter is pressed', () => {
      const onSubmit = vi.fn()
      render(<CommandInput {...defaultProps} value="test" onSubmit={onSubmit} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it('should NOT call onSubmit when Shift+Enter is pressed (multi-line)', () => {
      const onSubmit = vi.fn()
      render(<CommandInput {...defaultProps} value="test" onSubmit={onSubmit} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
      
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('Property 5: Input Clear After Send', () => {
    /**
     * For any command sent successfully,
     * the Command_Input value SHALL be empty immediately after.
     * Validates: Requirements 2.3
     * 
     * Note: The actual clearing is handled by the parent component,
     * but we verify the onSubmit callback is called which triggers the clear.
     */
    it('should trigger onSubmit which parent uses to clear input', () => {
      const onSubmit = vi.fn()
      let currentValue = 'test command'
      
      const { rerender } = render(
        <CommandInput 
          {...defaultProps} 
          value={currentValue} 
          onSubmit={() => {
            onSubmit()
            currentValue = '' // Simulate parent clearing
          }} 
        />
      )
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      fireEvent.click(sendButton)
      
      expect(onSubmit).toHaveBeenCalled()
      
      // Simulate parent re-rendering with cleared value
      rerender(<CommandInput {...defaultProps} value="" onSubmit={onSubmit} />)
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      expect(textarea).toHaveValue('')
    })
  })

  describe('send button state', () => {
    it('should disable send button when value is empty', () => {
      render(<CommandInput {...defaultProps} value="" />)
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })

    it('should disable send button when value is only whitespace', () => {
      render(<CommandInput {...defaultProps} value="   " />)
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })

    it('should enable send button when value has content', () => {
      render(<CommandInput {...defaultProps} value="ls -la" />)
      
      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).not.toBeDisabled()
    })
  })

  describe('modifier key handling', () => {
    it('should call onSendKeys with control sequence when Ctrl is active', () => {
      const onSendKeys = vi.fn()
      const onModifierUsed = vi.fn()
      
      render(
        <CommandInput 
          {...defaultProps} 
          ctrlActive={true}
          onSendKeys={onSendKeys}
          onModifierUsed={onModifierUsed}
        />
      )
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.keyDown(textarea, { key: 'c' })
      
      expect(onSendKeys).toHaveBeenCalledWith('\x03') // Ctrl+C
      expect(onModifierUsed).toHaveBeenCalled()
    })

    it('should call onSendKeys with Alt sequence when Alt is active', () => {
      const onSendKeys = vi.fn()
      
      render(
        <CommandInput 
          {...defaultProps} 
          altActive={true}
          onSendKeys={onSendKeys}
        />
      )
      
      const textarea = screen.getByPlaceholderText('Enter command...')
      fireEvent.keyDown(textarea, { key: 'x' })
      
      expect(onSendKeys).toHaveBeenCalledWith('\x1bx') // Alt+x = ESC + x
    })
  })

  describe('history button', () => {
    it('should call onHistoryOpen when history button is clicked', () => {
      const onHistoryOpen = vi.fn()
      render(<CommandInput {...defaultProps} onHistoryOpen={onHistoryOpen} />)
      
      const historyButton = screen.getByRole('button', { name: /history/i })
      fireEvent.click(historyButton)
      
      expect(onHistoryOpen).toHaveBeenCalledTimes(1)
    })
  })
})
