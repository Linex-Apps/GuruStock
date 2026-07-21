import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import type { Trade, Guru, GuruScore, ScoreboardResponse } from "../lib/api";
import { MiniScoreboard } from "./Scoreboard";

interface AlertData {
  alerts: Trade[];
  tier: string;
  budget: number;
  default_guru: string | null;
  delayed?: boolean;
  delay_days?: number;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function GuruAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const colors = [
    "bg-blue-600", "bg-purple-600", "bg-pink-600", "bg-amber-600",
    "bg-teal-600", "bg-indigo-600", "bg-rose-600",
  ];
  const colorIdx = name.length % colors.length;
  return (
    <div
      className={`w-10 h-10 ${colors[colorIdx]} rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md`}
    >
      {initials}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-gray-800 rounded-full shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-gray-800 rounded w-20" />
            <div className="h-5 bg-gray-800 rounded w-14" />
            <div className="h-4 bg-gray-800 rounded w-12" />
          </div>
          <div className="h-3 bg-gray-800 rounded w-32" />
          <div className="flex gap-4">
            <div className="h-3 bg-gray-800 rounded w-24" />
            <div className="h-3 bg-gray-800 rounded w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

const PRO_FEATURES = [
  {
    title: "Guru Performance Scoreboard",
    desc: "See each guru's historical hit rate at 3, 6, and 12 months. Know who's performing.",
    icon: "🏆",
  },
  {
    title: "AI Trade Rationale",
    desc: "Get a one-paragraph AI summary explaining the likely reasoning behind every trade.",
    icon: "🧠",
  },
  {
    title: "Portfolio Drift Alerts",
    desc: "Sync your portfolio and get notified when your positions drift from guru allocations.",
    icon: "📊",
  },
  {
    title: "Fractional Share Sizing",
    desc: "Budget recommendations that handle partial shares so you never miss a trade.",
    icon: "🔢",
  },
];

export default function Dashboard() {
  const { user, logout, setBudget } = useAuth();
  const [alerts, setAlerts] = useState<Trade[]>([]);
  const [gurus, setGurus] = useState<Guru[]>([]);
  const [selectedGuru, setSelectedGuru] = useState<string>("");
  const [tier, setTier] = useState("free");
  const [delayed, setDelayed] = useState(false);
  const [delayDays, setDelayDays] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  // Budget editing
  const [budgetInput, setBudgetInput] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetDisplay, setBudgetDisplay] = useState(user?.budget ?? 0);
  const [scoreboardGurus, setScoreboardGurus] = useState<GuruScore[]>([]);

  useEffect(() => {
    setBudgetDisplay(user?.budget ?? 0);
  }, [user?.budget]);

  // Fetch gurus
  useEffect(() => {
    fetch("/api/gurus")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGurus(data);
      })
      .catch(() => {});
  }, []);

  // Fetch scoreboard for pro users
  useEffect(() => {
    if (!isPro) return;
    const token = localStorage.getItem("gurustock_token");
    fetch("/api/scoreboard", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error("Not authorized");
        return r.json();
      })
      .then((data: ScoreboardResponse) => setScoreboardGurus(data.gurus))
      .catch(() => {});
  }, [isPro]);

  // Fetch alerts
  const fetchAlerts = useCallback(async (guruSlug?: string) => {
    setLoadingAlerts(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (guruSlug) params.set("guru", guruSlug);

      const token = localStorage.getItem("gurustock_token");
      const res = await fetch(`/api/alerts?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      const data: AlertData = await res.json();
      setAlerts(data.alerts);
      setTier(data.tier);
      setDelayed(data.delayed ?? false);
      setDelayDays(data.delay_days ?? 0);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts(selectedGuru || undefined);
  }, [selectedGuru, fetchAlerts]);

  // Save budget
  async function handleSaveBudget(e: FormEvent) {
    e.preventDefault();
    const amt = parseFloat(budgetInput);
    if (isNaN(amt) || amt < 0) return;

    setSavingBudget(true);
    try {
      const token = localStorage.getItem("gurustock_token");
      const res = await fetch("/api/user/budget", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ budget: amt }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setBudgetDisplay(data.budget);
      setBudget(data.budget);
      setEditingBudget(false);
      setBudgetInput("");

      // Refresh alerts with new budget
      fetchAlerts(selectedGuru || undefined);
    } catch (err) {
      console.error("Failed to save budget:", err);
    } finally {
      setSavingBudget(false);
    }
  }

  function startEditing() {
    setBudgetInput(String(budgetDisplay));
    setEditingBudget(true);
  }

  // Stats
  const uniqueGurus = [...new Set(alerts.map((a) => a.guru_name).filter(Boolean))];
  const lastUpdated =
    alerts.length > 0 ? timeAgo(alerts[0].filing_date) : "N/A";
  const isPro = user?.tier === "pro" || tier === "pro";

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold">
            <span className="text-emerald-400">Guru</span>
            <span className="text-white">Stock</span>
          </h1>
          {isPro && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500 text-black font-bold uppercase tracking-wide shadow-sm shadow-emerald-500/30">
              Pro
            </span>
          )}
          {isPro && (
            <a
              href="/scoreboard"
              className="text-sm text-emerald-400 hover:text-emerald-300 transition font-medium ml-2"
            >
              🏆 Scoreboard
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 hidden sm:inline">
            {isPro ? "Pro Tier" : "Free Tier"}
          </span>
          <span className="text-sm text-gray-400 hidden md:inline">{user?.email}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-300 transition"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Upgrade Banner (free tier only) */}
      {!isPro && !dismissedBanner && (
        <div className="bg-gradient-to-r from-emerald-900/30 to-emerald-800/10 border-b border-emerald-800/50">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚡</span>
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  Upgrade to GuruStock Pro
                </p>
                <p className="text-xs text-emerald-400/70">
                  All gurus, real-time alerts, portfolio mirroring &mdash; $9.99/mo
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/upgrade"
                className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition shadow-md shadow-emerald-500/20"
              >
                Upgrade
              </a>
              <button
                onClick={() => setDismissedBanner(true)}
                className="text-gray-400 hover:text-gray-200 text-xl leading-none px-2 transition"
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Delay notice for free tier */}
        {delayed && delayDays > 0 && (
          <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-3 flex items-center gap-3">
            <span className="text-amber-400 text-xl shrink-0">⏳</span>
            <div>
              <p className="text-sm text-amber-300 font-medium">
                Alerts are delayed by {delayDays} days on the Free plan
              </p>
              <p className="text-xs text-amber-400/60">
                <a href="/upgrade" className="underline hover:text-amber-300 transition">
                  Upgrade to Pro
                </a>{" "}
                for real-time trade alerts.
              </p>
            </div>
          </div>
        )}

        {/* ─── Stats Cards ─── */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-5 flex flex-col items-center justify-center text-center group hover:border-gray-700 transition-colors duration-200">
            <span className="text-2xl mb-1">📋</span>
            <p className="text-2xl md:text-3xl font-bold text-white tabular-nums">
              {loadingAlerts ? (
                <span className="inline-block w-10 h-7 bg-gray-800 rounded animate-pulse align-middle" />
              ) : (
                alerts.length
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">Trades Tracked</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-5 flex flex-col items-center justify-center text-center group hover:border-gray-700 transition-colors duration-200">
            <span className="text-2xl mb-1">👥</span>
            <p className="text-2xl md:text-3xl font-bold text-white tabular-nums">
              {loadingAlerts ? (
                <span className="inline-block w-8 h-7 bg-gray-800 rounded animate-pulse align-middle" />
              ) : (
                uniqueGurus.length
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">Gurus Followed</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-5 flex flex-col items-center justify-center text-center group hover:border-gray-700 transition-colors duration-200">
            <span className="text-2xl mb-1">🕐</span>
            <p className="text-lg md:text-xl font-bold text-white">
              {loadingAlerts ? (
                <span className="inline-block w-16 h-5 bg-gray-800 rounded animate-pulse align-middle" />
              ) : (
                lastUpdated
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">Last Updated</p>
          </div>
        </div>

        {/* ─── Budget Card ─── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">💵</span>
            <h3 className="text-lg font-semibold text-white">Your Budget</h3>
          </div>
          {editingBudget ? (
            <form onSubmit={handleSaveBudget} className="flex items-center gap-3">
              <span className="text-gray-400 text-xl">$</span>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xl w-48 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition"
                placeholder="5000"
                min="0"
                step="100"
                autoFocus
              />
              <button
                type="submit"
                disabled={savingBudget}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm shadow-emerald-500/20"
              >
                {savingBudget ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditingBudget(false)}
                className="text-gray-500 hover:text-gray-300 text-sm transition"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-4">
              <p className="text-3xl md:text-4xl font-bold text-emerald-400 tabular-nums">
                {budgetDisplay.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <button
                onClick={startEditing}
                className="text-sm text-gray-500 hover:text-emerald-400 transition underline underline-offset-2"
              >
                Edit
              </button>
            </div>
          )}
          <p className="text-gray-500 text-sm mt-3">
            {budgetDisplay > 0
              ? `Max ${(budgetDisplay * 0.05).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} per position (5%)`
              : "Set your budget to get position-size recommendations"}
          </p>
        </div>

        {/* ─── Pro: Mini Scoreboard ─── */}
        {isPro && scoreboardGurus.length > 0 && (
          <MiniScoreboard gurus={scoreboardGurus} />
        )}

        {/* ─── Guru Filter ─── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 mr-1">Filter:</span>
          <button
            onClick={() => setSelectedGuru("")}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              selectedGuru === ""
                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            {isPro ? "All Gurus" : "Warren Buffett"}
          </button>
          {isPro &&
            gurus.map((g) => (
              <button
                key={g.slug}
                onClick={() => setSelectedGuru(g.slug)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedGuru === g.slug
                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                }`}
              >
                {g.name.split(" ")[0]}
              </button>
            ))}
        </div>

        {/* ─── Alerts Feed ─── */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Recent Trades</h3>
          {loadingAlerts ? (
            <div className="space-y-3 transition-opacity duration-200">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <div className="text-5xl mb-4">📭</div>
              <h4 className="text-lg font-semibold text-white mb-2">No trades yet</h4>
              <p className="text-gray-500 max-w-md mx-auto text-sm leading-relaxed">
                {delayed
                  ? "Free tier shows trades older than 3 days. Guru trades will appear here as SEC filings age past the delay window."
                  : "Guru trades will appear here as SEC filings are processed. Check back soon!"}
              </p>
              {delayed && (
                <a
                  href="/upgrade"
                  className="inline-block mt-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
                >
                  Upgrade to Pro for Real-Time Alerts
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((trade) => (
                <div
                  key={trade.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 md:p-5 hover:border-gray-700 hover:shadow-lg hover:shadow-gray-900/50 transition-all duration-200"
                >
                  <div className="flex items-start gap-4">
                    {/* Guru Avatar */}
                    <GuruAvatar name={trade.guru_name || "Unknown"} />

                    <div className="flex-1 min-w-0">
                      {/* Top row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm text-gray-400">
                          {trade.guru_name}
                        </span>
                        <span className="text-lg font-bold text-white">
                          ${trade.ticker}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            trade.action === "buy"
                              ? "bg-emerald-900/60 text-emerald-400 border border-emerald-800/60"
                              : "bg-red-900/60 text-red-400 border border-red-800/60"
                          }`}
                        >
                          {trade.action === "buy" ? "BUY" : "SELL"}
                        </span>
                        <span className="text-xs text-gray-600 ml-auto">
                          {timeAgo(trade.filing_date)}
                        </span>
                      </div>

                      {/* Company name */}
                      <p className="text-sm text-gray-500 mb-2">
                        {trade.company_name}
                      </p>

                      {/* Details row */}
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <span className="text-gray-400">
                          Price:{" "}
                          <span className="text-white font-medium">
                            {parseFloat(trade.price_estimate).toLocaleString("en-US", {
                              style: "currency",
                              currency: "USD",
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </span>
                        <span className="text-gray-400">
                          Shares:{" "}
                          <span className="text-white font-medium">
                            {Number(trade.shares).toLocaleString()}
                          </span>
                        </span>
                      </div>

                      {/* Position sizing callout */}
                      {budgetDisplay > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-800">
                          {trade.affordable_shares !== undefined &&
                          trade.affordable_shares > 0 ? (
                            <span className="text-sm text-emerald-400 font-medium">
                              You can afford{" "}
                              <span className="font-bold">
                                {trade.affordable_shares.toFixed(2)} shares
                              </span>{" "}
                              (~{(
                                parseFloat(trade.price_estimate) *
                                (trade.affordable_shares ?? 0)
                              ).toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              )
                            </span>
                          ) : (
                            <span className="text-sm text-gray-600">
                              Price exceeds your 5% position limit
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Pro Feature Teasers (free users only) ─── */}
        {!isPro && !loadingAlerts && (
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🔒</span>
              <h3 className="text-lg font-semibold text-white">Pro Features</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                Locked
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRO_FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-5 opacity-70 hover:opacity-90 transition-opacity group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0 grayscale">{f.icon}</span>
                      <div>
                        <h4 className="font-semibold text-white text-sm mb-1">{f.title}</h4>
                        <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                      </div>
                    </div>
                    <a
                      href="/upgrade"
                      className="shrink-0 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                    >
                      Unlock
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-gray-600 text-xs border-t border-gray-800">
        &copy; 2026 GuruStock. Not financial advice.
      </footer>
    </div>
  );
}
