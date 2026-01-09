import { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const THEME_STORAGE_KEY = 'theme'
const VALID_THEMES: Theme[] = ['light', 'dark', 'system']

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored && VALID_THEMES.includes(stored as Theme)) {
      return stored as Theme
    }
  } catch (e) {
    console.warn('Failed to read theme from localStorage:', e)
  }
  return 'system'
}

function getSystemTheme(): 'light' | 'dark' {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch (e) {
    console.warn('Failed to save theme to localStorage:', e)
  }
}

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return defaultTheme ?? getStoredTheme()
  })
  
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme)

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return systemTheme
    }
    return theme
  }, [theme, systemTheme])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  // Persist theme to localStorage
  useEffect(() => {
    saveTheme(theme)
  }, [theme])

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const setTheme = useCallback((newTheme: Theme) => {
    if (VALID_THEMES.includes(newTheme)) {
      setThemeState(newTheme)
    }
  }, [])

  const value = useMemo(() => ({
    theme,
    resolvedTheme,
    setTheme,
  }), [theme, resolvedTheme, setTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// Export for testing
export { THEME_STORAGE_KEY, VALID_THEMES, getStoredTheme, getSystemTheme }
