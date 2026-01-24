import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Home from './pages/Home';
import EventPage from './pages/EventPage';
import DraftSubmission from './pages/DraftSubmission';
import LiveDraft from './pages/LiveDraft';
import Stats from './pages/Stats';
import AdminDashboard from './pages/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';

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
  );
}

export default App;
