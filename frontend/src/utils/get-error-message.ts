/**
 * Extracts a user-facing error message from an unknown catch value.
 * Handles Axios-style { response: { data: { error?: string } } } and returns
 * the `error` string when present; otherwise returns the fallback.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
	if (err && typeof err === 'object' && 'response' in err) {
		const res = (err as { response?: { data?: { error?: string } } }).response
		const msg = res?.data?.error
		if (typeof msg === 'string') return msg
	}
	return fallback
}
