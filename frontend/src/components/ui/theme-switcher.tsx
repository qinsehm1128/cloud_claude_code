import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTheme, Theme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

const themeConfig: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: 'Light' },
  dark: { icon: Moon, label: 'Dark' },
  system: { icon: Monitor, label: 'System' },
}

const themeOrder: Theme[] = ['light', 'dark', 'system']

interface ThemeSwitcherProps {
  collapsed?: boolean
  className?: string
}

export function ThemeSwitcher({ collapsed, className }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme()

  const { icon: Icon, label } = themeConfig[theme]

  const cycleTheme = () => {
    const currentIndex = themeOrder.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themeOrder.length
    setTheme(themeOrder[nextIndex])
  }

  const button = (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleTheme}
      className={cn(
        "w-full text-muted-foreground hover:text-foreground",
        collapsed ? "justify-center p-2" : "justify-start gap-3",
        className
      )}
      aria-label={`Current theme: ${label}. Click to switch theme.`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>Theme: {label}</span>}
    </Button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {button}
        </TooltipTrigger>
        <TooltipContent side="right">
          Theme: {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="top">
        Click to switch theme
      </TooltipContent>
    </Tooltip>
  )
}

// Export for testing
export { themeConfig, themeOrder }
