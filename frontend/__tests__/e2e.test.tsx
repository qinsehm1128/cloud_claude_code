import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/hooks/useTheme'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'
import { Sidebar } from '@/components/layout/Sidebar'

/**
 * End-to-End Integration Tests
 * 
 * Validates: Requirements 1.1-1.6, 2.1-2.5
 * - Theme switching flow
 * - Mobile navigation flow
 * - Responsive layout behavior
 */

// Mock matchMedia
const createMatchMedia = (matches: boolean) => {
  return (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
}

// Test wrapper with all providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <TooltipProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </TooltipProvider>
  </BrowserRouter>
)

describe('E2E Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'light')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Theme Switching Flow', () => {
    it('should complete full theme switching cycle', async () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia

      render(
        <TestWrapper>
          <ThemeSwitcher />
        </TestWrapper>
      )

      const button = screen.getByRole('button')
      
      // Initial state should be system (light since matchMedia returns false)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      
      // Click to switch to light
      fireEvent.click(button)
      await waitFor(() => {
        expect(localStorage.getItem('theme')).toBe('light')
      })
      
      // Click to switch to dark
      fireEvent.click(button)
      await waitFor(() => {
        expect(localStorage.getItem('theme')).toBe('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })
      
      // Click to switch back to system
      fireEvent.click(button)
      await waitFor(() => {
        expect(localStorage.getItem('theme')).toBe('system')
      })
    })

    it('should persist theme preference across renders', async () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia
      localStorage.setItem('theme', 'dark')

      const { unmount } = render(
        <TestWrapper>
          <ThemeSwitcher />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })

      unmount()

      // Re-render and verify persistence
      render(
        <TestWrapper>
          <ThemeSwitcher />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })
    })

    it('should respond to system theme changes', async () => {
      let mediaQueryCallback: ((e: { matches: boolean }) => void) | null = null
      
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, callback: (e: { matches: boolean }) => void) => {
          if (event === 'change') {
            mediaQueryCallback = callback
          }
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      localStorage.setItem('theme', 'system')

      render(
        <TestWrapper>
          <ThemeSwitcher />
        </TestWrapper>
      )

      // Initially light (system prefers light)
      expect(document.documentElement.classList.contains('dark')).toBe(false)

      // Simulate system theme change to dark
      if (mediaQueryCallback) {
        mediaQueryCallback({ matches: true })
      }

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })
    })
  })

  describe('Mobile Navigation Flow', () => {
    it('should open and close mobile sidebar', async () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia

      const onMobileClose = vi.fn()
      const onLogout = vi.fn()

      render(
        <TestWrapper>
          <Sidebar 
            onLogout={onLogout}
            mobileOpen={true}
            onMobileClose={onMobileClose}
          />
        </TestWrapper>
      )

      // Sidebar should be visible when mobileOpen is true
      const sidebar = screen.getByRole('complementary')
      expect(sidebar).toBeInTheDocument()

      // Click close button (X icon button)
      const closeButton = sidebar.querySelector('button.md\\:hidden')
      expect(closeButton).toBeInTheDocument()
      if (closeButton) {
        fireEvent.click(closeButton)
        expect(onMobileClose).toHaveBeenCalled()
      }
    })

    it('should close sidebar when navigation item is clicked on mobile', async () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia

      const onMobileClose = vi.fn()
      const onLogout = vi.fn()

      render(
        <TestWrapper>
          <Sidebar 
            onLogout={onLogout}
            mobileOpen={true}
            onMobileClose={onMobileClose}
          />
        </TestWrapper>
      )

      // Click a navigation link
      const dashboardLink = screen.getByText('Dashboard')
      fireEvent.click(dashboardLink)

      expect(onMobileClose).toHaveBeenCalled()
    })
  })

  describe('Responsive Layout Behavior', () => {
    it('should render sidebar correctly', () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia

      const onLogout = vi.fn()

      render(
        <TestWrapper>
          <Sidebar 
            onLogout={onLogout}
            mobileOpen={false}
            onMobileClose={() => {}}
          />
        </TestWrapper>
      )

      const sidebar = screen.getByRole('complementary')
      expect(sidebar).toBeInTheDocument()
    })

    it('should integrate theme switcher in sidebar', () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia

      const onLogout = vi.fn()

      render(
        <TestWrapper>
          <Sidebar 
            onLogout={onLogout}
            mobileOpen={false}
            onMobileClose={() => {}}
          />
        </TestWrapper>
      )

      // Theme switcher should be present in sidebar (using aria-label)
      const themeSwitcher = screen.getByLabelText(/Current theme/)
      expect(themeSwitcher).toBeInTheDocument()
    })
  })

  describe('Theme and Navigation Integration', () => {
    it('should maintain theme state during navigation', async () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia
      localStorage.setItem('theme', 'dark')

      const onMobileClose = vi.fn()
      const onLogout = vi.fn()

      render(
        <TestWrapper>
          <Sidebar 
            onLogout={onLogout}
            mobileOpen={true}
            onMobileClose={onMobileClose}
          />
        </TestWrapper>
      )

      // Verify dark theme is applied
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })

      // Navigate
      const settingsLink = screen.getByText('Settings')
      fireEvent.click(settingsLink)

      // Theme should still be dark after navigation
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should allow theme switching from sidebar', async () => {
      window.matchMedia = createMatchMedia(false) as typeof window.matchMedia

      const onLogout = vi.fn()

      render(
        <TestWrapper>
          <Sidebar 
            onLogout={onLogout}
            mobileOpen={false}
            onMobileClose={() => {}}
          />
        </TestWrapper>
      )

      // Find and click theme switcher (using aria-label)
      const themeSwitcher = screen.getByLabelText(/Current theme/)
      fireEvent.click(themeSwitcher)

      await waitFor(() => {
        expect(localStorage.getItem('theme')).toBe('light')
      })

      fireEvent.click(themeSwitcher)

      await waitFor(() => {
        expect(localStorage.getItem('theme')).toBe('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      })
    })
  })
})
