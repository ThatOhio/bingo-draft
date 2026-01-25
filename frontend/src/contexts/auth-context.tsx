import {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
} from 'react'
import axios from 'axios'

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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface AuthProviderProps {
	children: ReactNode
}

/**
 * Provides authentication state and methods. Must wrap the app or any subtree
 * that uses useAuth.
 */
export function AuthProvider({ children }: AuthProviderProps) {
	const [user, setUser] = useState<User | null>(null)
	const [token, setToken] = useState<string | null>(
		localStorage.getItem('token'),
	)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		if (token) {
			axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
			const load = async () => {
				try {
					const res = await axios.get(`${API_URL}/api/auth/me`)
					if (!cancelled) setUser(res.data.user)
				} catch (err) {
					console.error('Failed to fetch user:', err)
					if (!cancelled) {
						localStorage.removeItem('token')
						setToken(null)
						delete axios.defaults.headers.common['Authorization']
					}
				} finally {
					if (!cancelled) setLoading(false)
				}
			}
			load()
		} else {
			setLoading(false)
		}
		return () => {
			cancelled = true
		}
	}, [token])

	const loginWithDiscord = (eventCode?: string) => {
		const params = new URLSearchParams()
		if (eventCode) params.set('eventCode', eventCode)
		axios
			.get(`${API_URL}/api/auth/discord/url?${params.toString()}`)
			.then((res) => {
				window.location.href = res.data.url
			})
			.catch((err) => {
				console.error('Failed to get Discord OAuth URL:', err)
			})
	}

	const logout = () => {
		setToken(null)
		setUser(null)
		localStorage.removeItem('token')
		delete axios.defaults.headers.common['Authorization']
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
