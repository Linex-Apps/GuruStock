const API_BASE = "/api";

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function getToken(): string | null {
  return localStorage.getItem("gurustock_token");
}

async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = opts;
  const token = getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Typed API wrappers

export interface Guru {
  id: number;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
}

export interface Trade {
  id: number;
  guru_id: number;
  ticker: string;
  company_name: string;
  action: "buy" | "sell";
  shares: string;
  price_estimate: string;
  filing_date: string;
  source_url: string;
  created_at: string;
  confidence: string;
  guru_name?: string;
  guru_slug?: string;
  affordable_shares?: number;
  user_budget?: number;
}

export interface AlertResponse {
  alerts: Trade[];
  tier: string;
  budget: number;
  default_guru: string | null;
}

export interface UserAlert {
  id: number;
  user_id: number;
  trade_id: number;
  seen_at: string | null;
  acted_at: string | null;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: number; email: string; tier: string; budget: number } }>(
      "/auth/login",
      { method: "POST", body: { email, password } }
    ),

  signup: (email: string, password: string) =>
    request<{ token: string; user: { id: number; email: string; tier: string; budget: number } }>(
      "/auth/signup",
      { method: "POST", body: { email, password } }
    ),

  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),

  getMe: () => request<{ user: { id: number; email: string; tier: string; budget: number } }>("/auth/me"),

  // Gurus
  getGurus: () => request<Guru[]>("/gurus"),

  getGuru: (slug: string) => request<Guru & { trades: Trade[] }>(`/gurus/${slug}`),

  // Alerts
  getAlerts: (opts?: { guru?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.guru) params.set("guru", opts.guru);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<AlertResponse>(`/alerts${qs ? `?${qs}` : ""}`);
  },

  markAlertSeen: (alertId: number) =>
    request<void>(`/alerts/${alertId}/seen`, { method: "POST" }),

  // Portfolio
  getPortfolio: () =>
    request<{ holdings: unknown[] }>("/portfolio"),

  // Budget
  getBudget: () => request<{ budget: number; tier: string }>("/user/budget"),

  setBudget: (budget: number) =>
    request<{ budget: number }>("/user/budget", {
      method: "PUT",
      body: { budget },
    }),

  // Subscription
  getSubscriptionStatus: () =>
    request<{
      tier: string;
      features: SubscriptionFeatures;
      upgrade_url: string | null;
      price_monthly: string | null;
    }>("/subscription/status"),

  upgradeToPro: () =>
    request<{
      success: boolean;
      tier: string;
      features: SubscriptionFeatures;
      message: string;
    }>("/subscription/upgrade", { method: "POST" }),
};

export interface SubscriptionFeatures {
  all_gurus: boolean;
  real_time_alerts: boolean;
  delayed_alerts_days: number;
  budget_aware_sizing: boolean;
  portfolio_mirroring: boolean;
  pro_badge: boolean;
}
