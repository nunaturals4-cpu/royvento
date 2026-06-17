import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const TOKEN_KEY = "royvento_auth";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "user" | "vendor" | "admin" | "organizer" | "game_organizer";
  createdAt: string;
  phone?: string;
  about?: string;
  profileImage?: string;
  points: number;
  referralCode?: string;
  referredBy?: number | null;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  updateUser: async () => {},
});

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value); } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(key); } catch {}
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
  onAfterLogout?: () => void;
}

export function AuthProvider({ children, onAfterLogout }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const onAfterLogoutRef = useRef(onAfterLogout);
  onAfterLogoutRef.current = onAfterLogout;

  useEffect(() => {
    secureGet(TOKEN_KEY)
      .then(async (stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as StoredAuth;
            setToken(parsed.token);
            const raw = parsed.user as AuthUser & { points?: number };
            setUser({ ...raw, points: raw.points ?? 0 });
          } catch {
            await secureDelete(TOKEN_KEY);
          }
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  const login = useCallback(async (newToken: string, newUser: AuthUser) => {
    const data = JSON.stringify({ token: newToken, user: newUser });
    await secureSet(TOKEN_KEY, data);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await secureDelete(TOKEN_KEY);
    } finally {
      setToken(null);
      setUser(null);
      onAfterLogoutRef.current?.();
    }
  }, []);

  const updateUser = useCallback(async (patch: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      secureGet(TOKEN_KEY).then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as StoredAuth;
            secureSet(TOKEN_KEY, JSON.stringify({ ...parsed, user: next }));
          } catch {}
        }
      });
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
