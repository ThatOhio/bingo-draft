import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
	id: number
	message: string
	variant: ToastVariant
}

interface ToastContextValue {
	showToast: (message: string, variant?: ToastVariant) => void
	showSuccess: (message: string) => void
	showError: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DISMISS_AFTER_MS = 5000

const VARIANT_CLASSES: Record<ToastVariant, string> = {
	success:
		'bg-green-50 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100',
	error:
		'bg-red-50 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100',
	info:
		'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100',
}

interface ToastProviderProps {
	children: ReactNode
}

/**
 * Non-blocking replacement for window.alert.
 *
 * Beyond the look: alert() blocks the event loop for as long as it is open, which on the
 * live draft page stalled incoming socket updates behind whatever dialog was showing.
 */
export function ToastProvider({ children }: ToastProviderProps) {
	const [toasts, setToasts] = useState<Toast[]>([])
	const nextId = useRef(0)

	const dismiss = useCallback((id: number) => {
		setToasts((current) => current.filter((t) => t.id !== id))
	}, [])

	const showToast = useCallback(
		(message: string, variant: ToastVariant = 'info') => {
			const id = nextId.current++
			setToasts((current) => [...current, { id, message, variant }])
			window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS)
		},
		[dismiss],
	)

	const value = useMemo<ToastContextValue>(
		() => ({
			showToast,
			showSuccess: (message: string) => showToast(message, 'success'),
			showError: (message: string) => showToast(message, 'error'),
		}),
		[showToast],
	)

	return (
		<ToastContext.Provider value={value}>
			{children}
			{typeof document !== 'undefined' &&
				createPortal(
					<div
						className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-[min(24rem,90vw)]"
						role="region"
						aria-label="Notifications"
					>
						{toasts.map((toast) => (
							<div
								key={toast.id}
								role="status"
								aria-live="polite"
								className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm ${VARIANT_CLASSES[toast.variant]}`}
							>
								<span className="flex-1">{toast.message}</span>
								<button
									type="button"
									onClick={() => dismiss(toast.id)}
									aria-label="Dismiss notification"
									className="shrink-0 opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
								>
									✕
								</button>
							</div>
						))}
					</div>,
					document.body,
				)}
		</ToastContext.Provider>
	)
}

/**
 * Returns the toast context. Throws if used outside ToastProvider.
 */
export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext)
	if (!ctx) {
		throw new Error('useToast must be used within a ToastProvider')
	}
	return ctx
}
