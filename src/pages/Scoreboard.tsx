import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import type { ScoreboardResponse, GuruScore, GuruScoreDetail } from "../lib/api";

// ── Helpers ──────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="py-4 px-4"><div className="h-4 bg-gray-800 rounded w-6" /></td>
      <td className="py-4 px-4"><div className="h-4 bg-gray-800 rounded w-28" /></td>
      <td className="py-4 px-4"><div className="h-2 bg-gray-800 rounded w-full" /></td>
      <td className="py-4 px-4"><div className="h-4 bg-gray-800 rounded w-14" /></td>
      <td className="py-4 px-4"><div className="h-4 bg-gray-800 rounded w-8" /></td>
      <td className="py-4 px-4 hidden md:table-cell"><div className="h-4 bg-gray-800 rounded w-16" /></td>
      <td className="py-4 px-4 hidden md:table-cell"><div className="h-4 bg-gray-800 rounded w-16" /></td>
    </tr>
  );
}

function WinRateBar({ pct }: { pct: number }) {
  let color = "bg-red-500";
  if (pct >= 70) color = "bg-emerald-500";
  else if (pct >= 55) color = "bg-amber-500";
  else if (pct >= 40) color = "bg-orange-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-sm font-mono font-bold text-white w-12 text-right tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

function PctBadge({ pct, isWin }: { pct: number; isWin?: boolean }) {
  const positive = pct > 0;
  const winStyle = isWin !== undefined
    ? (isWin ? "text-emerald-400 bg-emerald-900/30 border-emerald-800/50" : "text-red-400 bg-red-900/30 border-red-800/50")
    : "";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${
        winStyle || (positive
          ? "text-emerald-400 bg-emerald-900/30 border-emerald-800/50"
          : "text-red-400 bg-red-900/30 border-red-800/50")
      }`}
    >
      {positive ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
        action === "buy"
          ? "bg-emerald-900/60 text-emerald-400 border border-emerald-800/60"
          : "bg-red-900/60 text-red-400 border border-red-800/60"
      }`}
    >
      {action === "buy" ? "BUY" : "SELL"}
    </span>
  );
}

// ── Mini Scoreboard Widget (for dashboard) ──────────────────────

export function MiniScoreboard({ gurus }: { gurus: GuruScore[] }) {
  if (gurus.length === 0) return null;
  const top2 = gurus.slice(0, 2);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <h3 className="text-lg font-semibold text-white">Guru Performance</h3>
        </div>
        <a
          href="/scoreboard"
          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
        >
          View All →
        </a>
      </div>
      <div className="space-y-3">
        {top2.map((g) => (
          <div key={g.guru_id} className="flex items-center gap-3">
            <span className="text-sm text-gray-400 w-24 truncate">{g.name.split(" ")[0]}</span>
            <div className="flex-1">
              <WinRateBar pct={g.win_rate} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Scoreboard Page ─────────────────────────────────────────

export default function Scoreboard() {
  const { user } = useAuth();
  const isPro = user?.tier === "pro";
  const [data, setData] = useState<ScoreboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<GuruScoreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isPro) {
      setLoading(false);
      return;
    }
    const token = localStorage.getItem("gurustock_token");
    fetch("/api/scoreboard", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(err.error || "Failed to load scoreboard");
        }
        return res.json();
      })
      .then((d: ScoreboardResponse) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isPro]);

  async function toggleExpand(slug: string) {
    if (expanded === slug) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(slug);
    setDetail(null);
    setDetailLoading(true);
    try {
      const token = localStorage.getItem("gurustock_token");
      const res = await fetch(`/api/scoreboard/${slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      const d: GuruScoreDetail = await res.json();
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Free tier view ──────────────────────────────────────────

  if (!isPro) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-xl md:text-2xl font-bold">
              <span className="text-emerald-400">Guru</span>
              <span className="text-white">Stock</span>
            </a>
          </div>
          <a
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-gray-300 transition"
          >
            ← Dashboard
          </a>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
              <div className="text-5xl mb-4">🔒</div>
              <h1 className="text-2xl font-bold text-white mb-3">
                Guru Performance Scoreboard
              </h1>
              <p className="text-gray-400 mb-6 leading-relaxed">
                See each guru's historical hit rate, best and worst trades, and detailed performance breakdown.
              </p>
              <a
                href="/upgrade"
                className="inline-block bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-lg font-semibold text-lg transition shadow-lg shadow-emerald-500/20"
              >
                Upgrade to Pro — $9.99/mo
              </a>
              <p className="text-gray-600 text-xs mt-3">
                Unlock real-time alerts, all gurus, and premium features.
              </p>
            </div>
          </div>
        </main>

        <footer className="text-center py-4 text-gray-600 text-xs border-t border-gray-800">
          &copy; 2026 GuruStock. Not financial advice.
        </footer>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-xl md:text-2xl font-bold">
              <span className="text-emerald-400">Guru</span>
              <span className="text-white">Stock</span>
            </a>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500 text-black font-bold uppercase tracking-wide shadow-sm shadow-emerald-500/30">
              Pro
            </span>
          </div>
          <a
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-gray-300 transition"
          >
            ← Dashboard
          </a>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-800 rounded w-64" />
            <div className="h-5 bg-gray-800 rounded w-96" />
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {["#", "Guru", "Win Rate", "Avg Return", "Trades", "Best", "Worst"].map((h) => (
                      <th key={h} className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="text-xl md:text-2xl font-bold">
              <span className="text-emerald-400">Guru</span>
              <span className="text-white">Stock</span>
            </a>
          </div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-300 transition">
            ← Dashboard
          </a>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || "No data available"}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-emerald-400 hover:text-emerald-300 transition"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Pro view ─────────────────────────────────────────────────

  const { gurus, meta } = data;

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-xl md:text-2xl font-bold">
            <span className="text-emerald-400">Guru</span>
            <span className="text-white">Stock</span>
          </a>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500 text-black font-bold uppercase tracking-wide shadow-sm shadow-emerald-500/30">
            Pro
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-gray-300 transition"
          >
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">
        {/* Title */}
        <div className="mb-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <span>🏆</span> Guru Performance Scoreboard
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Deterministic historical trade accuracy metrics based on simulated returns.
          </p>
        </div>

        {/* Stats summary bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-lg font-bold text-white tabular-nums">{meta.avg_win_rate}%</p>
              <p className="text-xs text-gray-500">Average win rate</p>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">🥇</span>
            <div>
              <p className="text-lg font-bold text-emerald-400">
                {meta.top_guru?.name ?? "—"}
              </p>
              <p className="text-xs text-gray-500">
                Top guru {meta.top_guru ? `at ${meta.top_guru.win_rate}%` : ""}
              </p>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">👥</span>
            <div>
              <p className="text-lg font-bold text-white tabular-nums">{meta.total_gurus}</p>
              <p className="text-xs text-gray-500">Gurus ranked</p>
            </div>
          </div>
        </div>

        {/* Leaderboard table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">#</th>
                <th className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Guru</th>
                <th className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Win Rate</th>
                <th className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Avg Return</th>
                <th className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider">Trades</th>
                <th className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Best Trade</th>
                <th className="py-3 px-4 text-left text-xs text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Worst Trade</th>
              </tr>
            </thead>
            <tbody>
              {gurus.map((g, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === gurus.length - 1;
                const isExpanded = expanded === g.slug;

                return (
                  <React.Fragment key={g.guru_id}>
                    <tr
                      onClick={() => toggleExpand(g.slug)}
                      className={`border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/50 transition-colors ${
                        isExpanded ? "bg-gray-800/30" : ""
                      }`}
                    >
                      <td className="py-4 px-4">
                        <span className={`text-sm font-bold ${
                          isFirst ? "text-emerald-400" : isLast ? "text-amber-400" : "text-gray-400"
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm font-semibold text-white">{g.name}</span>
                      </td>
                      <td className="py-4 px-4">
                        <WinRateBar pct={g.win_rate} />
                      </td>
                      <td className="py-4 px-4">
                        <PctBadge pct={g.avg_return_pct} />
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-400 tabular-nums">{g.total_trades}</span>
                      </td>
                      <td className="py-4 px-4 hidden md:table-cell">
                        <span className="text-sm text-gray-300">
                          ${g.best_trade.ticker}{" "}
                          <span className={g.best_trade.pct > 0 ? "text-emerald-400" : "text-red-400"}>
                            +{g.best_trade.pct}%
                          </span>
                        </span>
                      </td>
                      <td className="py-4 px-4 hidden md:table-cell">
                        <span className="text-sm text-gray-300">
                          ${g.worst_trade.ticker}{" "}
                          <span className={g.worst_trade.pct > 0 ? "text-emerald-400" : "text-red-400"}>
                            {g.worst_trade.pct}%
                          </span>
                        </span>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-gray-800/20 border-b border-gray-800/50">
                          <div className="p-4">
                            {detailLoading ? (
                              <div className="animate-pulse space-y-2">
                                {[1, 2, 3].map((i) => (
                                  <div key={i} className="h-8 bg-gray-800 rounded" />
                                ))}
                              </div>
                            ) : detail && detail.trades.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-medium">
                                  Trade History ({detail.wins}/{detail.total_trades} wins)
                                </p>
                                {detail.trades.map((t) => (
                                  <div
                                    key={t.trade_id}
                                    className="flex items-center gap-3 text-sm bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5"
                                  >
                                    <span className="text-white font-semibold w-16">${t.ticker}</span>
                                    <ActionBadge action={t.action} />
                                    <span className="text-gray-500 text-xs flex-1 truncate hidden sm:inline">
                                      {t.company_name}
                                    </span>
                                    <PctBadge pct={t.result_change_pct} isWin={t.is_win} />
                                    <span className="text-xs text-gray-600 w-20 text-right hidden sm:inline">
                                      {t.filing_date}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No trades found for this guru.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile best/worst cards — visible on small screens */}
        <div className="mt-6 space-y-3 md:hidden">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Best & Worst Trades</p>
          {gurus.map((g) => (
            <div key={g.guru_id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-sm font-semibold text-white mb-2">{g.name}</p>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Best: </span>
                  <span className="text-white">${g.best_trade.ticker}</span>{" "}
                  <span className={g.best_trade.pct > 0 ? "text-emerald-400" : "text-red-400"}>
                    +{g.best_trade.pct}%
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Worst: </span>
                  <span className="text-white">${g.worst_trade.ticker}</span>{" "}
                  <span className={g.worst_trade.pct > 0 ? "text-emerald-400" : "text-red-400"}>
                    {g.worst_trade.pct}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="text-center py-4 text-gray-600 text-xs border-t border-gray-800">
        &copy; 2026 GuruStock. Not financial advice.
      </footer>
    </div>
  );
}
