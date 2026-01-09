import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as fc from 'fast-check'
import { BrowserRouter } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { ThemeProvider } from '@/hooks/useTheme'
import { TooltipProvider } from '@/components/ui/tooltip'

// Wrapper component for testing
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>
    <TooltipProvider>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
)

describe('Sidebar', () => {
  const mockOnLogout = vi.fn()
  const mockOnMobileClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('Property 6: Mobile Sidebar Visibility', () => {
    it('should be hidden by default on mobile (mobileOpen=false)', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (mobileOpen) => {
            const { container, unmount } = render(
              <TestWrapper>
                <Sidebar 
                  onLogout={mockOnLogout} 
                  mobileOpen={mobileOpen}
                  onMobileClose={mockOnMobileClose}
                />
              </TestWrapper>
            )

            const sidebar = container.querySelector('aside')
            
            if (mobileOpen) {
              // When mobileOpen is true, sidebar should have 'fixed' class for mobile
              expect(sidebar?.className).toContain('fixed')
            } else {
              // When mobileOpen is false, sidebar should have 'hidden md:flex' classes
              // meaning it's hidden on mobile but visible on desktop
              expect(sidebar?.className).toContain('hidden')
              expect(sidebar?.className).toContain('md:flex')
            }
            
            unmount()
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Unit Tests', () => {
    it('should render navigation items', () => {
      render(
        <TestWrapper>
          <Sidebar onLogout={mockOnLogout} />
        </TestWrapper>
      )

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Ports')).toBeInTheDocument()
      expect(screen.getByText('Docker')).toBeInTheDocument()
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should render theme switcher', () => {
      render(
        <TestWrapper>
          <Sidebar onLogout={mockOnLogout} />
        </TestWrapper>
      )

      expect(screen.getByText(/Theme:/)).toBeInTheDocument()
    })

    it('should render logout button', () => {
      render(
        <TestWrapper>
          <Sidebar onLogout={mockOnLogout} />
        </TestWrapper>
      )

      expect(screen.getByText('Logout')).toBeInTheDocument()
    })

    it('should show close button when mobile sidebar is open', () => {
      render(
        <TestWrapper>
          <Sidebar 
            onLogout={mockOnLogout} 
            mobileOpen={true}
            onMobileClose={mockOnMobileClose}
          />
        </TestWrapper>
      )

      // Close button should be present
      const closeButtons = screen.getAllByRole('button')
      const closeButton = closeButtons.find(btn => 
        btn.querySelector('svg.lucide-x')
      )
      expect(closeButton).toBeInTheDocument()
    })

    it('should not show close button when mobile sidebar is closed', () => {
      render(
        <TestWrapper>
          <Sidebar 
            onLogout={mockOnLogout} 
            mobileOpen={false}
            onMobileClose={mockOnMobileClose}
          />
        </TestWrapper>
      )

      // Close button should not be present
      const closeButtons = screen.queryAllByRole('button')
      const closeButton = closeButtons.find(btn => 
        btn.querySelector('svg.lucide-x')
      )
      expect(closeButton).toBeUndefined()
    })
  })
})
