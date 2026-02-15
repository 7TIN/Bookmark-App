'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const THEME_STORAGE_KEY = 'bookmark-theme'
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): Theme {
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light'
}

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme
  return null
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'

  return readStoredTheme() ?? getSystemTheme()
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const body = document.body

  root.classList.remove('light', 'dark')
  body.classList.remove('light', 'dark')

  root.classList.add(theme)
  body.classList.add(theme)
  root.setAttribute('data-theme', theme)
  body.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY)

    const onSystemThemeChange = () => {
      const storedTheme = readStoredTheme()
      if (storedTheme) return
      setTheme(getSystemTheme())
    }

    mediaQuery.addEventListener('change', onSystemThemeChange)

    return () => {
      mediaQuery.removeEventListener('change', onSystemThemeChange)
    }
  }, [])

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [theme]
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
