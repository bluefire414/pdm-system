import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pdm_token');
    const savedUser = localStorage.getItem('pdm_user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      client.get('/auth/me').then((res) => {
        if (res.data.user) {
          setUser(res.data.user);
          localStorage.setItem('pdm_user', JSON.stringify(res.data.user));
        }
      }).catch(() => {
        logout();
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const res = await client.post('/auth/login', { username, password });
    const { token, user } = res.data;
    localStorage.setItem('pdm_token', token);
    localStorage.setItem('pdm_user', JSON.stringify(user));
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('pdm_token');
    localStorage.removeItem('pdm_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
