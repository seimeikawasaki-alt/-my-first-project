import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const { user, isAuthenticated, isLoading, fetchMe } = useAuthStore();

  useEffect(() => {
    if (isLoading) {
      fetchMe();
    }
  }, [isLoading, fetchMe]);

  return { user, isAuthenticated, isLoading };
}
