import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Navigate } from "react-router-dom";

export default function Upgrade() {
  const { user, upgradeToPro } = useAuth();
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [error, setError] = useState("");

  // If already pro, redirect to dashboard
  if (user?.tier === "pro" && !upgrading) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleUpgrade() {
    setUpgrading(true);
    setError("");
    try {
      await upgradeToPro();
      setUpgraded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  }

  const features = [
    { name: "Gurus Tracked", free: "1 (Warren Buffett)", pro: "All Gurus" },
    { name: "Alert Speed", free: "3-Day Delay", pro: "Real-Time" },
    { name: "Budget-Aware Sizing", free: "✓", pro: "✓" },
    { name: "Portfolio Mirroring", free: "—", pro: "✓" },
    { name: "Drift Alerts", free: "—", pro: "✓" },
    { name: "Guru Scoreboard", free: "—", pro: "✓" },
    { name: "AI Trade Rationale", free: "—", pro: "✓" },
  ];

  if (upgraded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Pro!</h1>
          <p className="text-gray-400 mb-6">
            You now have access to all gurus, real-time alerts, and premium features.
          </p>
          <a
            href="/dashboard"
            className="inline-block bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-lg font-semibold transition"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950">
        <a href="/dashboard" className="text-2xl font-bold text-emerald-400">
          GuruStock
        </a>
        <a
          href="/dashboard"
          className="text-sm text-gray-400 hover:text-gray-300 transition"
        >
          ← Back to Dashboard
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          {/* Pricing Card */}
          <div className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-8 mb-8 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-4 py-1 rounded-bl-lg">
              RECOMMENDED
            </div>
            <h2 className="text-xl font-bold text-white mb-2">GuruStock Pro</h2>
            <div className="flex items-baseline justify-center gap-1 mb-2">
              <span className="text-5xl font-bold text-emerald-400">$9.99</span>
              <span className="text-gray-500">/month</span>
            </div>
            <p className="text-gray-400 mb-6">
              Unlock all gurus, real-time alerts, and premium features.
            </p>

            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-700 text-white px-6 py-3 rounded-lg font-semibold text-lg transition"
            >
              {upgrading ? "Upgrading..." : "Subscribe to Pro"}
            </button>
            <p className="text-gray-600 text-xs mt-3">
              Cancel anytime. In production, you'll be redirected to Stripe checkout.
            </p>
          </div>

          {/* Feature Comparison */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <h3 className="text-lg font-semibold text-white p-6 border-b border-gray-800">
              Plan Comparison
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-sm">
                    <th className="text-left py-3 px-6 text-gray-400 font-medium">
                      Feature
                    </th>
                    <th className="text-center py-3 px-6 text-gray-400 font-medium">
                      Free
                    </th>
                    <th className="text-center py-3 px-6 text-emerald-400 font-medium">
                      Pro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr
                      key={f.name}
                      className="border-b border-gray-800/50 last:border-0"
                    >
                      <td className="py-3 px-6 text-sm text-gray-300">{f.name}</td>
                      <td className="py-3 px-6 text-sm text-center text-gray-500">
                        {f.free}
                      </td>
                      <td className="py-3 px-6 text-sm text-center text-emerald-400 font-medium">
                        {f.pro}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-gray-600 text-xs border-t border-gray-800">
        &copy; 2026 GuruStock. Not financial advice.
      </footer>
    </div>
  );
}
