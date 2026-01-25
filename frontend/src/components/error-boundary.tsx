import { Slot } from '@radix-ui/react-slot'
import { Component, ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface ErrorBoundaryProps {
	children: ReactNode
	fallback?: ReactNode
}

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
}

/**
 * Error boundary to catch JavaScript errors in the child tree.
 * Renders a fallback UI when an error occurs, logs to console, and reports to
 * Sentry when VITE_SENTRY_DSN is set.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false, error: null }
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error('ErrorBoundary caught an error:', error, errorInfo)
		Sentry.captureException(error, {
			extra: { componentStack: errorInfo.componentStack },
		})
	}

	handleRefresh = (): void => {
		window.location.reload()
	}

	render(): ReactNode {
		if (this.state.hasError && this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback
			}
			return (
				<div
					className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-6"
					role="alert"
				>
					<h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
						Something went wrong
					</h1>
					<p className="text-gray-600 dark:text-gray-400 mb-4 text-center max-w-md">
						An unexpected error occurred. Please refresh the page or try again later.
					</p>
					<Slot asChild>
						<button
							type="button"
							onClick={this.handleRefresh}
							className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
						>
							Refresh page
						</button>
					</Slot>
				</div>
			)
		}
		return this.props.children
	}
}
