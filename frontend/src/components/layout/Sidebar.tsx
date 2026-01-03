import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { 
  LayoutDashboard, 
  Settings, 
  FolderGit2,
  Terminal,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Repositories', href: '/repositories', icon: FolderGit2 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  onLogout: () => void
}

export function Sidebar({ onLogout }: SidebarProps) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn(
        "flex h-full flex-col bg-card border-r transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}>
        {/* Logo */}
        <div className={cn(
          "flex h-16 items-center border-b",
          collapsed ? "justify-center px-2" : "gap-2 px-6"
        )}>
          <Terminal className="h-6 w-6 flex-shrink-0" />
          {!collapsed && <span className="font-semibold text-lg">Claude Code</span>}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            const linkContent = (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors",
                  collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && item.name}
              </NavLink>
            )

            if (collapsed) {
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
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center p-2 text-muted-foreground hover:text-foreground"
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
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          )}
          
          {/* Collapse toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-muted-foreground hover:text-foreground",
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
      </div>
    </TooltipProvider>
  )
}
