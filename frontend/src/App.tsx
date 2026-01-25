import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/auth-context'
import { SocketProvider } from './contexts/socket-context'
import ProtectedRoute from './components/protected-route'

const Login = lazy(() => import('./pages/login'))
const AuthCallback = lazy(() => import('./pages/auth-callback'))
const Home = lazy(() => import('./pages/home'))
const EventPage = lazy(() => import('./pages/event-page'))
const DraftSubmission = lazy(() => import('./pages/draft-submission'))
const LiveDraft = lazy(() => import('./pages/live-draft'))
const Stats = lazy(() => import('./pages/stats'))
const AdminDashboard = lazy(() => import('./pages/admin-dashboard'))

function RouteFallback() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
			<div className="text-lg text-gray-600 dark:text-gray-400">Loading...</div>
		</div>
	)
}

/**
 * Root app component. Renders auth and socket providers, router with lazy-loaded
 * route components, and a Suspense fallback for code-split chunks.
 */
function App() {
	return (
		<AuthProvider>
			<SocketProvider>
				<BrowserRouter>
					<Suspense fallback={<RouteFallback />}>
						<Routes>
							<Route path="/login" element={<Login />} />
							<Route path="/auth/callback" element={<AuthCallback />} />
							<Route path="/" element={<Home />} />
							<Route path="/event/:eventCode" element={<EventPage />} />
							<Route
								path="/event/:eventCode/submit"
								element={
									<ProtectedRoute>
										<DraftSubmission />
									</ProtectedRoute>
								}
							/>
							<Route
								path="/event/:eventCode/draft"
								element={<LiveDraft />}
							/>
							<Route
								path="/event/:eventCode/stats"
								element={<Stats />}
							/>
							<Route
								path="/admin"
								element={
									<ProtectedRoute requiredRole="ADMIN">
										<AdminDashboard />
									</ProtectedRoute>
								}
							/>
							<Route path="*" element={<Navigate to="/" replace />} />
						</Routes>
					</Suspense>
				</BrowserRouter>
			</SocketProvider>
		</AuthProvider>
	)
}

export default App
