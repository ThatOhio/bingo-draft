import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/auth-context'
import { SocketProvider } from './contexts/socket-context'
import Login from './pages/login'
import AuthCallback from './pages/auth-callback'
import Home from './pages/home'
import EventPage from './pages/event-page'
import DraftSubmission from './pages/draft-submission'
import LiveDraft from './pages/live-draft'
import Stats from './pages/stats'
import AdminDashboard from './pages/admin-dashboard'
import ProtectedRoute from './components/protected-route'

function App() {
	return (
		<AuthProvider>
			<SocketProvider>
				<BrowserRouter>
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
				</BrowserRouter>
			</SocketProvider>
		</AuthProvider>
	)
}

export default App
