import { create } from 'zustand';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('sf_token'),
  user: (() => {
    const cached = localStorage.getItem('sf_user');
    try {
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  })(),
  setAuth: (token, user) => {
    localStorage.setItem('sf_token', token);
    localStorage.setItem('sf_user', JSON.stringify(user));
    set({ token, user });
  },
  clearAuth: () => {
    localStorage.removeItem('sf_token');
    localStorage.removeItem('sf_user');
    set({ token: null, user: null });
  },
}));
