import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'bingo-draft-theme'

function getInitialTheme(): Theme {
	if (typeof window === 'undefined') return 'light'
	const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
	if (stored === 'dark' || stored === 'light') return stored
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeContextValue {
	theme: Theme
	isDark: boolean
	toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
	children: ReactNode
}

/**
 * Provides light/dark theme state and toggle. Syncs to document classes and
 * localStorage. Must wrap any subtree that uses useTheme.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
	const [theme, setTheme] = useState<Theme>(getInitialTheme)
	const isDark = theme === 'dark'

	useEffect(() => {
		const root = document.documentElement
		if (theme === 'dark') {
			root.classList.add('dark')
		} else {
			root.classList.remove('dark')
		}
		root.style.colorScheme = theme
		localStorage.setItem(STORAGE_KEY, theme)
	}, [theme])

	const toggleTheme = useCallback(() => {
		setTheme((t) => (t === 'light' ? 'dark' : 'light'))
	}, [])

	return (
		<ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	)
}

/**
 * Returns the theme context. Throws if used outside ThemeProvider.
 */
export function useTheme() {
	const ctx = useContext(ThemeContext)
	if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
	return ctx
}
