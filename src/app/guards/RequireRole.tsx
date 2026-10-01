import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type AppRole } from '../AuthProvider';

/**
 * A courtesy, not a security boundary. RLS is the boundary — this only stops
 * someone being shown a screen that would come back empty.
 */
export function RequireRole({ roles }: { roles: AppRole[] }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile || !roles.includes(profile.role)) return <Navigate to="/notifications" replace />;
  return <Outlet />;
}
