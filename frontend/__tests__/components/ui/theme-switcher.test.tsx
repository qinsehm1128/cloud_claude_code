import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import { ThemeSwitcher, themeConfig, themeOrder } from '@/components/ui/theme-switcher'
import { ThemeProvider, Theme } from '@/hooks/useTheme'
import { TooltipProvider } from '@/components/ui/tooltip'

// Wrapper component for testing
const TestWrapper = ({ children, defaultTheme }: { children: React.ReactNode; defaultTheme?: Theme }) => (
  <ThemeProvider defaultTheme={defaultTheme}>
    <TooltipProvider>
      {children}
    </TooltipProvider>
  </ThemeProvider>
)

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('light', 'dark')
  })

  describe('Property 4: Theme Icon Consistency', () => {
    it('should display correct icon for each theme state', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<Theme>('light', 'dark', 'system'),
          (theme) => {
            localStorage.clear()
            
            const { unmount } = render(
              <TestWrapper defaultTheme={theme}>
                <ThemeSwitcher />
              </TestWrapper>
            )

            const button = screen.getByRole('button')
            const expectedLabel = themeConfig[theme].label
            
            // Check that the button contains the correct theme label
            expect(button.textContent).toContain(`Theme: ${expectedLabel}`)
            
            // Check aria-label contains the theme
            expect(button.getAttribute('aria-label')).toContain(expectedLabel)
            
            unmount()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should cycle through themes in correct order', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2 }),
          (startIndex) => {
            localStorage.clear()
            const startTheme = themeOrder[startIndex]
            
            const { unmount } = render(
              <TestWrapper defaultTheme={startTheme}>
                <ThemeSwitcher />
              </TestWrapper>
            )

            const button = screen.getByRole('button')
            
            // Click to cycle to next theme
            fireEvent.click(button)
            
            const expectedNextIndex = (startIndex + 1) % themeOrder.length
            const expectedNextTheme = themeOrder[expectedNextIndex]
            const expectedLabel = themeConfig[expectedNextTheme].label
            
            expect(button.textContent).toContain(`Theme: ${expectedLabel}`)
            
            unmount()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Unit Tests', () => {
    it('should render with default theme', () => {
      render(
        <TestWrapper>
          <ThemeSwitcher />
        </TestWrapper>
      )

      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(button.textContent).toContain('Theme:')
    })

    it('should show collapsed view when collapsed prop is true', () => {
      render(
        <TestWrapper>
          <ThemeSwitcher collapsed />
        </TestWrapper>
      )

      const button = screen.getByRole('button')
      // In collapsed mode, text should not be visible
      expect(button.textContent).not.toContain('Theme:')
    })

    it('should show expanded view when collapsed prop is false', () => {
      render(
        <TestWrapper>
          <ThemeSwitcher collapsed={false} />
        </TestWrapper>
      )

      const button = screen.getByRole('button')
      expect(button.textContent).toContain('Theme:')
    })

    it('should cycle through all themes on repeated clicks', () => {
      render(
        <TestWrapper defaultTheme="light">
          <ThemeSwitcher />
        </TestWrapper>
      )

      const button = screen.getByRole('button')
      
      // Start with light
      expect(button.textContent).toContain('Light')
      
      // Click to dark
      fireEvent.click(button)
      expect(button.textContent).toContain('Dark')
      
      // Click to system
      fireEvent.click(button)
      expect(button.textContent).toContain('System')
      
      // Click back to light
      fireEvent.click(button)
      expect(button.textContent).toContain('Light')
    })

    it('should have accessible aria-label', () => {
      render(
        <TestWrapper defaultTheme="dark">
          <ThemeSwitcher />
        </TestWrapper>
      )

      const button = screen.getByRole('button')
      expect(button.getAttribute('aria-label')).toContain('Dark')
      expect(button.getAttribute('aria-label')).toContain('Click to switch theme')
    })
  })
})
