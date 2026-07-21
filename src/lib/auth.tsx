import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface User {
  id: number;
  email: string;
  tier: string;
  budget: number;
}

export interface Features {
  all_gurus: boolean;
  real_time_alerts: boolean;
  delayed_alerts_days: number;
  budget_aware_sizing: boolean;
  portfolio_mirroring: boolean;
  pro_badge: boolean;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  features: Features | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setBudget: (budget: number) => void;
  upgradeToPro: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "gurustock_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<Features | null>(null);

  // On mount, verify token is still valid
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("invalid");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        if (data.features) setFeatures(data.features);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(email: string, password: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function signup(email: string, password: string) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Signup failed");
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  function setBudget(budget: number) {
    if (user) {
      setUser({ ...user, budget });
    }
  }

  async function upgradeToPro() {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/subscription/upgrade", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Upgrade failed");
    }
    const data = await res.json();
    // Update local state immediately
    if (user) {
      setUser({ ...user, tier: "pro" });
    }
    if (data.features) setFeatures(data.features);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, features, login, signup, logout, setBudget, upgradeToPro }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
