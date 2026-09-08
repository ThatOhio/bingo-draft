import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	useRef,
	ReactNode,
} from 'react'
import {
	api,
	clearStoredToken,
	getStoredToken,
	refreshToken,
	setAuthFailureHandler,
} from '../lib/api-client'

interface User {
	id: string
	discordId: string
	discordUsername: string
	role: string
}

interface AuthContextType {
	user: User | null
	token: string | null
	loginWithDiscord: (eventCode?: string) => void
	logout: () => void
	loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * How often to exchange the token for a fresh one. Comfortably inside the server's 24h
 * lifetime, so a session that spans a long draft never expires mid-pick. Each renewal
 * also re-fetches the user, which is how a role change reaches the UI.
 */
const RENEWAL_INTERVAL_MS = 15 * 60 * 1000

interface AuthProviderProps {
	children: ReactNode
}

/**
 * Provides authentication state and methods. Must wrap the app or any subtree
 * that uses useAuth.
 */
export function AuthProvider({ children }: AuthProviderProps) {
	const [user, setUser] = useState<User | null>(null)
	const [token, setToken] = useState<string | null>(() => getStoredToken())
	const [loading, setLoading] = useState(true)
	const didInitialRenewal = useRef(false)

	const logout = useCallback(() => {
		clearStoredToken()
		setToken(null)
		setUser(null)
	}, [])

	// The api client calls this when a request 401s and the token cannot be renewed.
	// Without it the app would keep rendering as signed in while every request failed.
	useEffect(() => {
		setAuthFailureHandler(logout)
		return () => setAuthFailureHandler(null)
	}, [logout])

	useEffect(() => {
		let cancelled = false

		if (!token) {
			setUser(null)
			setLoading(false)
			return
		}

		const load = async () => {
			try {
				const res = await api.get('/api/auth/me')
				if (!cancelled) setUser(res.data.user)
			} catch (err) {
				console.error('Failed to fetch user:', err)
				if (!cancelled) logout()
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		load()

		return () => {
			cancelled = true
		}
	}, [token, logout])

	// Renew once on load so a role change is picked up immediately. Guarded by a ref
	// because setting the token re-runs this effect.
	useEffect(() => {
		if (!token || didInitialRenewal.current) return
		didInitialRenewal.current = true
		refreshToken().then((next) => {
			if (next) setToken(next)
		})
	}, [token])

	// Keyed on signed-in-ness rather than the token itself: keying on the token would
	// tear down and recreate the timer on every renewal.
	const isSignedIn = token !== null
	useEffect(() => {
		if (!isSignedIn) return

		const id = setInterval(() => {
			refreshToken().then((next) => {
				if (next) setToken(next)
			})
		}, RENEWAL_INTERVAL_MS)

		return () => clearInterval(id)
	}, [isSignedIn])

	const loginWithDiscord = (eventCode?: string) => {
		const params = new URLSearchParams()
		if (eventCode) params.set('eventCode', eventCode)
		api
			.get(`/api/auth/discord/url?${params.toString()}`)
			.then((res) => {
				window.location.href = res.data.url
			})
			.catch((err) => {
				console.error('Failed to get Discord OAuth URL:', err)
			})
	}

	return (
		<AuthContext.Provider
			value={{ user, token, loginWithDiscord, logout, loading }}
		>
			{children}
		</AuthContext.Provider>
	)
}

/**
 * Returns the auth context. Throws if used outside AuthProvider.
 */
export function useAuth(): AuthContextType {
	const context = useContext(AuthContext)
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider')
	}
	return context
}
