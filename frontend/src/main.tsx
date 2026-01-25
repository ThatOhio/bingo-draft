import * as Sentry from '@sentry/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from './contexts/theme-context'
import { ErrorBoundary } from './components/error-boundary'

Sentry.init({
	dsn: import.meta.env.VITE_SENTRY_DSN || undefined,
	environment: import.meta.env.MODE,
	enabled: !!import.meta.env.VITE_SENTRY_DSN,
})

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<ThemeProvider>
				<App />
			</ThemeProvider>
		</ErrorBoundary>
	</React.StrictMode>,
)
