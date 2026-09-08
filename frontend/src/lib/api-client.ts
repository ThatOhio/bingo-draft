import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

/** Base URL of the API. Also used directly by the socket client as its connection URL. */
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const TOKEN_STORAGE_KEY = 'token'

/**
 * Reads the access token. Wrapped because localStorage throws outright in some privacy
 * modes rather than returning null.
 */
export function getStoredToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_STORAGE_KEY)
	} catch {
		return null
	}
}

export function setStoredToken(token: string): void {
	try {
		localStorage.setItem(TOKEN_STORAGE_KEY, token)
	} catch {
		// Non-fatal: the in-memory token still works for this page load.
	}
}

export function clearStoredToken(): void {
	try {
		localStorage.removeItem(TOKEN_STORAGE_KEY)
	} catch {
		// Nothing to do.
	}
}

let onAuthFailure: (() => void) | null = null

/**
 * Registers what to do when the token is rejected and cannot be renewed.
 * AuthProvider uses this to drop its user state; without it the app would keep rendering
 * as though signed in while every request 401s.
 */
export function setAuthFailureHandler(handler: (() => void) | null): void {
	onAuthFailure = handler
}

/** Shared axios instance. Use this rather than the axios default export. */
export const api = axios.create({ baseURL: API_URL })

// Read the token per request instead of mutating axios.defaults, so a renewal mid-flight
// is picked up by the next request without any coordination.
api.interceptors.request.use((config) => {
	const token = getStoredToken()
	if (token) {
		config.headers.Authorization = `Bearer ${token}`
	}
	return config
})

let refreshInFlight: Promise<string | null> | null = null

async function requestNewToken(): Promise<string | null> {
	const token = getStoredToken()
	if (!token) {
		return null
	}
	try {
		// Bare axios on purpose: going through `api` would route a failure back into the
		// response interceptor below and recurse.
		const res = await axios.post(`${API_URL}/api/auth/refresh`, null, {
			headers: { Authorization: `Bearer ${token}` },
		})
		const next: unknown = res.data?.token
		if (typeof next === 'string' && next.length > 0) {
			setStoredToken(next)
			return next
		}
		return null
	} catch {
		return null
	}
}

/**
 * Exchanges the current token for a fresh one carrying the user's current role.
 *
 * Single-flighted: several requests failing with 401 at once (the live draft can easily
 * have three in flight) trigger one refresh between them, not one each.
 */
export function refreshToken(): Promise<string | null> {
	if (!refreshInFlight) {
		refreshInFlight = requestNewToken().finally(() => {
			refreshInFlight = null
		})
	}
	return refreshInFlight
}

interface RetriableConfig extends InternalAxiosRequestConfig {
	_retried?: boolean
}

api.interceptors.response.use(
	(response) => response,
	async (error: AxiosError) => {
		const config = error.config as RetriableConfig | undefined

		// Retry a 401 exactly once, and only if we actually got a new token.
		if (error.response?.status !== 401 || !config || config._retried) {
			return Promise.reject(error)
		}
		config._retried = true

		const token = await refreshToken()
		if (!token) {
			clearStoredToken()
			onAuthFailure?.()
			return Promise.reject(error)
		}

		config.headers.Authorization = `Bearer ${token}`
		return api.request(config)
	},
)
