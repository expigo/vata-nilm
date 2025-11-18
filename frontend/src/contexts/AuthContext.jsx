import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success && data.authenticated) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.success) {
        setUser(data.user);
        return { success: true, user: data.user };
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  const updateUserProfile = async (userId, updates) => {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (data.success) {
        setUser(prev => ({ ...prev, ...data.user }));
        return { success: true, user: data.user };
      } else {
        throw new Error(data.error || 'Update failed');
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const changePassword = async (userId, currentPassword, newPassword) => {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (data.success) {
        return { success: true };
      } else {
        throw new Error(data.error || 'Password change failed');
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updatePreferences = async (userId, preferences) => {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(preferences)
      });

      const data = await response.json();

      if (data.success) {
        return { success: true, preferences: data.preferences };
      } else {
        throw new Error(data.error || 'Update failed');
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkAuth,
    updateUserProfile,
    changePassword,
    updatePreferences,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager' || user?.role === 'admin',
    siteAccess: user?.siteAccess || null
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
