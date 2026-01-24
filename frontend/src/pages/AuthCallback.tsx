import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      navigate('/login?error=' + error);
      return;
    }

    if (token) {
      localStorage.setItem('token', token);
      const eventCode = searchParams.get('eventCode');
      // Return to event page if user signed in from an event
      window.location.href = eventCode ? `/event/${eventCode}` : '/';
    } else {
      navigate('/login');
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-lg text-gray-600 dark:text-gray-400">Completing login...</div>
    </div>
  );
};

export default AuthCallback;
