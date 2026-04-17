import { useEffect, useState } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 768px)'

function getMediaQueryMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => getMediaQueryMatch(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQueryList = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    setMatches(mediaQueryList.matches)

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)

      return () => {
        mediaQueryList.removeEventListener('change', handleChange)
      }
    }

    if (typeof mediaQueryList.addListener === 'function') {
      mediaQueryList.addListener(handleChange)

      return () => {
        mediaQueryList.removeListener(handleChange)
      }
    }

    return
  }, [query])

  return matches
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY)
}