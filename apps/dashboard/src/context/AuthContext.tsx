import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';

export enum PermissionsEnum {
  WORKFLOW_READ = 'workflow:read',
  WORKFLOW_WRITE = 'workflow:write',
  WORKFLOW_DELETE = 'workflow:delete',
  SUBSCRIBER_READ = 'subscriber:read',
  SUBSCRIBER_WRITE = 'subscriber:write',
  SUBSCRIBER_DELETE = 'subscriber:delete',
  ACTIVITY_READ = 'activity:read',
  INBOX_READ = 'inbox:read',
  INBOX_WRITE = 'inbox:write',
  ENVIRONMENT_READ = 'environment:read',
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  permissions?: PermissionsEnum[];
  environments?: Environment[];
}

export interface Environment {
  id: string;
  name: string;
  key?: 'dev' | 'prod' | string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  environmentId: string | null;
  environments: Environment[];
  isAuthenticated: boolean;
  isLoading: boolean;
  signin: (email: string, password: string) => Promise<void>;
  signup: (data: { email: string; password: string; firstName?: string; lastName?: string; organizationName?: string }) => Promise<void>;
  signout: () => void;
  setEnvironmentId: (id: string) => void;
  hasPermission: (permission: PermissionsEnum | PermissionsEnum[]) => boolean;
}

const JWT_KEY = 'campus_jwt';
const USER_KEY = 'campus_user';
const ENV_KEY = 'campus_env';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(JWT_KEY));
  const [environmentId, setEnvironmentIdState] = useState<string | null>(() => localStorage.getItem(ENV_KEY));
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const persistEnvironment = useCallback((id: string) => {
    localStorage.setItem(ENV_KEY, id);
    setEnvironmentIdState(id);
  }, []);

  const loadEnvironments = useCallback(async () => {
    try {
      const { data } = await api.get<{ data?: Environment[] } | Environment[]>('/v1/environments');
      const list: Environment[] = Array.isArray(data) ? data : (data?.data ?? []);
      setEnvironments(list);
      if (list.length && !environmentId) {
        const preferred = list.find((e) => e.key === 'dev') || list.find((e) => e.name?.toLowerCase().includes('dev')) || list[0];
        if (preferred?.id) persistEnvironment(preferred.id);
      } else if (list.length && environmentId) {
        const exists = list.some((e) => e.id === environmentId);
        if (!exists) {
          const fallback = list[0];
          if (fallback?.id) persistEnvironment(fallback.id);
        }
      }
    } catch {
      // ignore environments loading errors
    }
  }, [environmentId, persistEnvironment]);

  useEffect(() => {
    if (token) {
      void loadEnvironments();
    } else {
      setEnvironments([]);
    }
  }, [token, loadEnvironments]);

  const commitAuth = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(JWT_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const signin = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data } = await api.post<{ token: string; user: User }>('/auth/signin', { email, password });
      commitAuth(data.token, data.user);
    } finally {
      setIsLoading(false);
    }
  }, [commitAuth]);

  const signup = useCallback(async (payload: { email: string; password: string; firstName?: string; lastName?: string }) => {
    setIsLoading(true);
    try {
      const { data } = await api.post<{ token: string; user: User }>('/auth/signup', payload);
      commitAuth(data.token, data.user);
    } finally {
      setIsLoading(false);
    }
  }, [commitAuth]);

  const signout = useCallback(() => {
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ENV_KEY);
    setToken(null);
    setUser(null);
    setEnvironmentIdState(null);
    setEnvironments([]);
  }, []);

  const hasPermission = useCallback((permission: PermissionsEnum | PermissionsEnum[]) => {
    if (!user?.permissions) return true;
    const list = Array.isArray(permission) ? permission : [permission];
    return list.every((p) => user.permissions?.includes(p));
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      environmentId,
      environments,
      isAuthenticated: Boolean(token),
      isLoading,
      signin,
      signup,
      signout,
      setEnvironmentId: persistEnvironment,
      hasPermission,
    }),
    [user, token, environmentId, environments, isLoading, signin, signup, signout, persistEnvironment, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
