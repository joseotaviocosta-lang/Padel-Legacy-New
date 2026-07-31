import React, { createContext, useCallback, useContext, useState } from 'react';
import { LOCAL_USER } from '@/local/localSeed';

const AuthContext = createContext(null);
export const AuthProvider = ({ children }) => {
  const [user] = useState(LOCAL_USER);
  const checkUserAuth = useCallback(async () => LOCAL_USER, []);
  const checkAppState = useCallback(async () => true, []);
  const logout = useCallback(() => { window.location.href = '/careers'; }, []);
  const navigateToLogin = useCallback(() => { window.location.href = '/careers'; }, []);
  return <AuthContext.Provider value={{
    user, isAuthenticated: true, isLoadingAuth: false, isLoadingPublicSettings: false,
    authError: null, appPublicSettings: { id: 'padel-legacy-offline', public_settings: { offline: true } },
    authChecked: true, localDevMode: true, logout, navigateToLogin, checkUserAuth, checkAppState,
  }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value; };
