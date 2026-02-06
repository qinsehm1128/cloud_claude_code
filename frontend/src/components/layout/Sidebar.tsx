import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { 
  LayoutDashboard, 
  Settings, 
  Terminal,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Network,
  Box,
  MessageSquare,
  X,
  FileCode2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ThemeSwitcher } from '@/components/ui/theme-switcher'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Ports', href: '/ports', icon: Network },
  { name: 'Docker', href: '/docker', icon: Box },
  { name: 'Headless Chat', href: '/chat', icon: MessageSquare },
  { name: 'CLI Config', href: '/claude-config', icon: FileCode2 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  onLogout: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ onLogout, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const handleNavigation = () => {
    // Close mobile sidebar on navigation
    onMobileClose?.()
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside className={cn(
        "flex h-full flex-col bg-card border-r transition-all duration-300 z-50",
        // Desktop: always visible, hidden on mobile by default
        "hidden md:flex",
        collapsed ? "w-16" : "w-64",
        // Mobile: slide in when open
        mobileOpen && "fixed inset-y-0 left-0 flex w-72"
      )}>
        {/* Mobile close button */}
        {mobileOpen && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-3 right-3 h-8 w-8 p-0 md:hidden"
            onClick={onMobileClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {/* Logo */}
        <div className={cn(
          "flex h-16 items-center border-b",
          collapsed && !mobileOpen ? "justify-center px-2" : "gap-2 px-6"
        )}>
          <Terminal className="h-6 w-6 flex-shrink-0" />
          {(!collapsed || mobileOpen) && <span className="font-semibold text-lg">Claude Code</span>}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            const isCollapsedDesktop = collapsed && !mobileOpen
            
            const linkContent = (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={handleNavigation}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors min-h-[44px]",
                  isCollapsedDesktop ? "justify-center p-2" : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!isCollapsedDesktop && item.name}
              </NavLink>
            )

            if (isCollapsedDesktop) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return linkContent
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t space-y-1">
          {/* Theme Switcher */}
          <ThemeSwitcher collapsed={collapsed && !mobileOpen} />
          
          {/* Logout Button */}
          {collapsed && !mobileOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center p-2 text-muted-foreground hover:text-foreground min-h-[44px]"
                  onClick={onLogout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground min-h-[44px]"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          )}
          
          {/* Collapse toggle - only on desktop */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-muted-foreground hover:text-foreground min-h-[44px] hidden md:flex",
              collapsed ? "justify-center p-2" : "justify-start gap-3"
            )}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
