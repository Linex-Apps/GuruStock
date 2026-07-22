import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

interface Holding {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_value: number;
  allocation_pct: number;
  created_at: string;
  updated_at: string;
}

interface DriftAlertData {
  guru_name: string;
  guru_slug: string;
  ticker: string;
  guru_allocation_pct: number;
  your_allocation_pct: number;
  drift_pct: number;
  action: "add" | "reduce";
}

interface PortfolioResponse {
  holdings: Holding[];
  total_value: number;
}

interface DriftResponse {
  alerts: DriftAlertData[];
}

function GuruInitials({ name }: { name: string }) {
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
      className={`w-8 h-8 ${colors[colorIdx]} rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0`}
    >
      {initials}
    </div>
  );
}

export default function Portfolio() {
  const { user, features } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [driftAlerts, setDriftAlerts] = useState<DriftAlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDrift, setLoadingDrift] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add holding form
  const [tickerInput, setTickerInput] = useState("");
  const [sharesInput, setSharesInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isPro = user?.tier === "pro";

  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("gurustock_token");
      const res = await fetch("/api/portfolio", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      const data: PortfolioResponse = await res.json();
      setHoldings(data.holdings);
      setTotalValue(data.total_value);
    } catch (err) {
      setError("Could not load portfolio data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDrift = useCallback(async () => {
    if (!isPro) return;
    setLoadingDrift(true);
    try {
      const token = localStorage.getItem("gurustock_token");
      const res = await fetch("/api/portfolio/drift", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch drift");
      const data: DriftResponse = await res.json();
      setDriftAlerts(data.alerts);
    } catch {
      // Drift is non-critical; silently fail
    } finally {
      setLoadingDrift(false);
    }
  }, [isPro]);

  useEffect(() => {
    fetchPortfolio();
    fetchDrift();
  }, [fetchPortfolio, fetchDrift]);

  async function handleAddHolding(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const ticker = tickerInput.trim().toUpperCase();
    const shares = parseFloat(sharesInput);
    const avgCost = parseFloat(costInput);

    if (!ticker) {
      setFormError("Ticker is required");
      return;
    }
    if (isNaN(shares) || shares <= 0) {
      setFormError("Valid share count required");
      return;
    }
    if (isNaN(avgCost) || avgCost <= 0) {
      setFormError("Valid average cost required");
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("gurustock_token");
      const res = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticker, shares, avg_cost: avgCost }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      setTickerInput("");
      setSharesInput("");
      setCostInput("");
      await fetchPortfolio();
      await fetchDrift();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to add holding");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(ticker: string) {
    try {
      const token = localStorage.getItem("gurustock_token");
      const res = await fetch(`/api/portfolio/holdings/${ticker}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      await fetchPortfolio();
      await fetchDrift();
    } catch {
      // silently fail
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-xl md:text-2xl font-bold">
            <span className="text-emerald-400">Guru</span>
            <span className="text-white">Stock</span>
          </a>
          {isPro && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500 text-black font-bold uppercase tracking-wide shadow-sm shadow-emerald-500/30">
              Pro
            </span>
          )}
          <span className="text-sm text-gray-500 hidden sm:inline">/ Portfolio</span>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-200 transition">
            Dashboard
          </a>
          <span className="text-sm text-gray-400 hidden md:inline">{user?.email}</span>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6">
        <h1 className="text-2xl font-bold text-white">Your Portfolio</h1>

        {/* ─── Drift Alerts (Pro) ─── */}
        {isPro && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              📊 Drift Alerts
              {loadingDrift && (
                <span className="text-sm text-gray-500 animate-pulse">Loading…</span>
              )}
            </h2>
            {driftAlerts.length === 0 && !loadingDrift ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                <p className="text-gray-500 text-sm">
                  No drift alerts. Your portfolio is in line with guru allocations — or add holdings to see comparisons.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {driftAlerts.slice(0, 6).map((alert, i) => (
                  <div
                    key={`${alert.guru_slug}-${alert.ticker}-${i}`}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition"
                  >
                    <div className="flex items-start gap-3">
                      <GuruInitials name={alert.guru_name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm text-gray-400">{alert.guru_name}</span>
                          <span className="text-lg font-bold text-white">${alert.ticker}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              alert.action === "add"
                                ? "bg-emerald-900/60 text-emerald-400 border border-emerald-800/60"
                                : "bg-red-900/60 text-red-400 border border-red-800/60"
                            }`}
                          >
                            {alert.action === "add" ? "↑ ADD" : "↓ REDUCE"}
                          </span>
                          <span className="text-xs text-gray-500">
                            Drift: {alert.drift_pct.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-2">
                          You're{" "}
                          <span className={alert.action === "add" ? "text-emerald-400" : "text-red-400"}>
                            {alert.action === "add" ? "underweight" : "overweight"}
                          </span>{" "}
                          {alert.ticker} vs. {alert.guru_name.split(" ")[0]} by{" "}
                          <span className="font-semibold text-white">{alert.drift_pct.toFixed(1)}%</span>
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          <span>Guru: {alert.guru_allocation_pct.toFixed(1)}%</span>
                          <span>You: {alert.your_allocation_pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ─── Drift Locked Card (Free) ─── */}
        {!isPro && (
          <section>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 opacity-80">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-1">Portfolio Drift Alerts</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Sync your portfolio and get notified when your positions drift from guru allocations.
                      See exactly where you're underweight or overweight vs. each guru.
                    </p>
                  </div>
                </div>
                <a
                  href="/upgrade"
                  className="shrink-0 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg transition shadow-sm shadow-emerald-500/20"
                >
                  Upgrade — $9.99/mo
                </a>
              </div>
            </div>
          </section>
        )}

        {/* ─── Holdings Table ─── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Your Holdings</h2>

          {/* Add holding form */}
          <form onSubmit={handleAddHolding} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[80px]">
                <label className="block text-xs text-gray-500 mb-1">Ticker</label>
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value)}
                  placeholder="AAPL"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition uppercase"
                  maxLength={5}
                />
              </div>
              <div className="flex-1 min-w-[80px]">
                <label className="block text-xs text-gray-500 mb-1">Shares</label>
                <input
                  type="number"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  placeholder="10"
                  step="0.0001"
                  min="0"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition"
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="block text-xs text-gray-500 mb-1">Avg Cost ($)</label>
                <input
                  type="number"
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  placeholder="150.00"
                  step="0.01"
                  min="0"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-sm shadow-emerald-500/20 shrink-0"
              >
                {submitting ? "Adding…" : "Add"}
              </button>
            </div>
            {formError && (
              <p className="text-red-400 text-xs mt-2">{formError}</p>
            )}
          </form>

          {/* Holdings table */}
          {loading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <div className="animate-pulse text-gray-500">Loading holdings…</div>
            </div>
          ) : error ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : holdings.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <div className="text-5xl mb-4">📋</div>
              <h4 className="text-lg font-semibold text-white mb-2">No holdings yet</h4>
              <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
                Add your holdings to start tracking — we'll compare them to what the gurus are doing.
              </p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-gray-500 text-xs uppercase tracking-wider">
                      <th className="py-3 px-4">Ticker</th>
                      <th className="py-3 px-4">Shares</th>
                      <th className="py-3 px-4">Avg Cost</th>
                      <th className="py-3 px-4">Value</th>
                      <th className="py-3 px-4">% of Portfolio</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.ticker} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                        <td className="py-3 px-4">
                          <span className="font-bold text-white">${h.ticker}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 tabular-nums">{h.shares.toFixed(4)}</td>
                        <td className="py-3 px-4 text-gray-300 tabular-nums">
                          ${h.avg_cost.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-gray-300 tabular-nums">
                          ${h.current_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-800 rounded-full max-w-[80px]">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(h.allocation_pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-gray-400 tabular-nums text-xs">{h.allocation_pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleDelete(h.ticker)}
                            className="text-gray-600 hover:text-red-400 transition text-xs font-medium"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalValue > 0 && (
                <div className="px-4 py-3 border-t border-gray-800 flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="text-white font-bold tabular-nums">
                    ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="text-center py-4 text-gray-600 text-xs border-t border-gray-800">
        &copy; 2026 GuruStock. Not financial advice.
      </footer>
    </div>
  );
}
