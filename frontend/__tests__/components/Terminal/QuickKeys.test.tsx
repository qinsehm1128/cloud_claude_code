import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import { QuickKeys } from '@/components/Terminal/QuickKeys'
import { QUICK_KEYS, MINIMAL_QUICK_KEYS } from '@/utils/keySequence'

describe('QuickKeys', () => {
  const defaultProps = {
    onKeyPress: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render all quick keys in full mode', () => {
      render(<QuickKeys {...defaultProps} />)
      
      QUICK_KEYS.forEach(key => {
        expect(screen.getByText(key.label)).toBeInTheDocument()
      })
    })

    it('should render only minimal keys in minimal mode', () => {
      render(<QuickKeys {...defaultProps} minimal={true} />)
      
      MINIMAL_QUICK_KEYS.forEach(key => {
        expect(screen.getByText(key.label)).toBeInTheDocument()
      })

      // Check that non-minimal keys are not rendered
      const minimalLabels = MINIMAL_QUICK_KEYS.map(k => k.label)
      QUICK_KEYS.forEach(key => {
        if (!minimalLabels.includes(key.label)) {
          expect(screen.queryByText(key.label)).not.toBeInTheDocument()
        }
      })
    })

    it('should have toolbar role for accessibility', () => {
      render(<QuickKeys {...defaultProps} />)
      
      expect(screen.getByRole('toolbar')).toBeInTheDocument()
    })

    it('should disable all buttons when disabled prop is true', () => {
      render(<QuickKeys {...defaultProps} disabled={true} />)
      
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeDisabled()
      })
    })
  })

  describe('Property 6: Quick Key Sequence Correctness', () => {
    /**
     * For any quick key button, pressing it SHALL send the exact
     * predefined key sequence to the terminal.
     * Validates: Requirements 3.2, 3.4
     */
    it('should send correct key sequence for each quick key', () => {
      // Test all quick keys
      QUICK_KEYS.forEach(key => {
        const onKeyPress = vi.fn()
        const { unmount } = render(<QuickKeys onKeyPress={onKeyPress} />)
        
        const button = screen.getByText(key.label)
        fireEvent.click(button)
        
        expect(onKeyPress).toHaveBeenCalledTimes(1)
        expect(onKeyPress).toHaveBeenCalledWith(key.keys)
        
        unmount()
      })
    })

    it('should send correct key sequence for minimal quick keys', () => {
      MINIMAL_QUICK_KEYS.forEach(key => {
        const onKeyPress = vi.fn()
        const { unmount } = render(<QuickKeys onKeyPress={onKeyPress} minimal={true} />)
        
        const button = screen.getByText(key.label)
        fireEvent.click(button)
        
        expect(onKeyPress).toHaveBeenCalledTimes(1)
        expect(onKeyPress).toHaveBeenCalledWith(key.keys)
        
        unmount()
      })
    })

    it('should have data-keys attribute matching the key sequence', () => {
      render(<QuickKeys {...defaultProps} />)
      
      QUICK_KEYS.forEach(key => {
        const button = screen.getByText(key.label)
        expect(button).toHaveAttribute('data-keys', key.keys)
      })
    })
  })

  describe('specific key sequences', () => {
    it('should send Ctrl+C sequence (\\x03)', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} />)
      
      const ctrlCButton = screen.getByText('Ctrl+C')
      fireEvent.click(ctrlCButton)
      
      expect(onKeyPress).toHaveBeenCalledWith('\x03')
    })

    it('should send Tab sequence (\\t)', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} />)
      
      const tabButton = screen.getByText('Tab')
      fireEvent.click(tabButton)
      
      expect(onKeyPress).toHaveBeenCalledWith('\t')
    })

    it('should send arrow up ANSI sequence (\\x1b[A)', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} />)
      
      const arrowUpButton = screen.getByText('↑')
      fireEvent.click(arrowUpButton)
      
      expect(onKeyPress).toHaveBeenCalledWith('\x1b[A')
    })

    it('should send arrow down ANSI sequence (\\x1b[B)', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} />)
      
      const arrowDownButton = screen.getByText('↓')
      fireEvent.click(arrowDownButton)
      
      expect(onKeyPress).toHaveBeenCalledWith('\x1b[B')
    })

    it('should send arrow left ANSI sequence (\\x1b[D)', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} />)
      
      const arrowLeftButton = screen.getByText('←')
      fireEvent.click(arrowLeftButton)
      
      expect(onKeyPress).toHaveBeenCalledWith('\x1b[D')
    })

    it('should send arrow right ANSI sequence (\\x1b[C)', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} />)
      
      const arrowRightButton = screen.getByText('→')
      fireEvent.click(arrowRightButton)
      
      expect(onKeyPress).toHaveBeenCalledWith('\x1b[C')
    })

    it('should send Escape sequence (\\x1b)', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} />)
      
      const escButton = screen.getByText('Esc')
      fireEvent.click(escButton)
      
      expect(onKeyPress).toHaveBeenCalledWith('\x1b')
    })
  })

  describe('button attributes', () => {
    it('should have title attribute with description', () => {
      render(<QuickKeys {...defaultProps} />)
      
      QUICK_KEYS.forEach(key => {
        if (key.description) {
          const button = screen.getByText(key.label)
          expect(button).toHaveAttribute('title', key.description)
        }
      })
    })

    it('should have minimum touch target size (44x44)', () => {
      render(<QuickKeys {...defaultProps} />)
      
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        // Check that the button has the min-w and min-h classes
        expect(button.className).toContain('min-w-[44px]')
        expect(button.className).toContain('min-h-[44px]')
      })
    })
  })

  describe('disabled state', () => {
    it('should not call onKeyPress when disabled', () => {
      const onKeyPress = vi.fn()
      render(<QuickKeys onKeyPress={onKeyPress} disabled={true} />)
      
      const ctrlCButton = screen.getByText('Ctrl+C')
      fireEvent.click(ctrlCButton)
      
      expect(onKeyPress).not.toHaveBeenCalled()
    })
  })
})
