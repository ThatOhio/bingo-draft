import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export interface ConfirmOptions {
	title: string
	/** Optional detail shown under the title. */
	message?: string
	confirmLabel?: string
	cancelLabel?: string
	/** Styles the confirm button as destructive. */
	destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface PendingConfirm extends ConfirmOptions {
	resolve: (confirmed: boolean) => void
}

interface ConfirmProviderProps {
	children: ReactNode
}

/**
 * Promise-based replacement for window.confirm, so call sites keep reading as
 * `if (!(await confirm({...}))) return`.
 */
export function ConfirmProvider({ children }: ConfirmProviderProps) {
	const [pending, setPending] = useState<PendingConfirm | null>(null)
	const confirmButtonRef = useRef<HTMLButtonElement>(null)

	const confirm = useCallback<ConfirmFn>((options) => {
		return new Promise<boolean>((resolve) => {
			setPending({ ...options, resolve })
		})
	}, [])

	const settle = useCallback(
		(confirmed: boolean) => {
			setPending((current) => {
				current?.resolve(confirmed)
				return null
			})
		},
		[],
	)

	useEffect(() => {
		if (!pending) return

		confirmButtonRef.current?.focus()

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				settle(false)
			}
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [pending, settle])

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			{pending &&
				typeof document !== 'undefined' &&
				createPortal(
					<div
						className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
						onClick={() => settle(false)}
					>
						<div
							role="dialog"
							aria-modal="true"
							aria-labelledby="confirm-dialog-title"
							className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6"
							onClick={(e) => e.stopPropagation()}
						>
							<h2
								id="confirm-dialog-title"
								className="text-lg font-semibold text-gray-900 dark:text-gray-100"
							>
								{pending.title}
							</h2>
							{pending.message && (
								<p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
									{pending.message}
								</p>
							)}
							<div className="mt-6 flex justify-end gap-3">
								<button
									type="button"
									onClick={() => settle(false)}
									className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
								>
									{pending.cancelLabel ?? 'Cancel'}
								</button>
								<button
									ref={confirmButtonRef}
									type="button"
									onClick={() => settle(true)}
									className={`px-4 py-2 rounded-md text-white ${
										pending.destructive
											? 'bg-red-600 hover:bg-red-700'
											: 'bg-indigo-600 hover:bg-indigo-700'
									}`}
								>
									{pending.confirmLabel ?? 'Confirm'}
								</button>
							</div>
						</div>
					</div>,
					document.body,
				)}
		</ConfirmContext.Provider>
	)
}

/**
 * Returns a function that opens a confirmation dialog and resolves to the user's answer.
 * Throws if used outside ConfirmProvider.
 */
export function useConfirm(): ConfirmFn {
	const ctx = useContext(ConfirmContext)
	if (!ctx) {
		throw new Error('useConfirm must be used within a ConfirmProvider')
	}
	return ctx
}
