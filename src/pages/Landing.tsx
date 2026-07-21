import { useAuth } from "../lib/auth";
import { Link } from "react-router-dom";

const gurus = [
  {
    name: "Warren Buffett",
    firm: "Berkshire Hathaway",
    description: "Legendary value investor with a track record spanning over 60 years.",
    initials: "WB",
    color: "bg-blue-600",
  },
  {
    name: "Ray Dalio",
    firm: "Bridgewater Associates",
    description: "Founder of the world's largest hedge fund, macro investing pioneer.",
    initials: "RD",
    color: "bg-purple-600",
  },
  {
    name: "Cathie Wood",
    firm: "ARK Invest",
    description: "Disruptive innovation investor, known for bold tech convictions.",
    initials: "CW",
    color: "bg-pink-600",
  },
  {
    name: "Bill Ackman",
    firm: "Pershing Square",
    description: "Activist investor known for concentrated, high-conviction bets.",
    initials: "BA",
    color: "bg-amber-600",
  },
];

const features = [
  {
    title: "Real Guru Data",
    desc: "Track live SEC 13F filings from the world's most followed investors — not rumors, actual disclosures.",
    icon: "📊",
  },
  {
    title: "Budget-Smart Sizing",
    desc: "Set your budget and we calculate how many shares you can actually afford, including fractional shares.",
    icon: "💰",
  },
  {
    title: "Multi-Guru Alerts",
    desc: "Follow multiple gurus and see all their moves in one feed. Filter, compare, and act.",
    icon: "🔔",
  },
  {
    title: "Performance Tracking",
    desc: "See each guru's historical hit rate at 3, 6, and 12 months. Know who's hot and who's not.",
    icon: "📈",
  },
  {
    title: "\"Why This Trade?\" AI",
    desc: "Every alert includes a one-paragraph rationale — sector rotation, earnings play, macro hedge — so you act with confidence.",
    icon: "🤖",
  },
  {
    title: "Mobile Ready",
    desc: "Install on your home screen, check markets on the go. Fast, offline-cached, always up to date.",
    icon: "📱",
  },
];

const pricingRows = [
  { feature: "Gurus Tracked", free: "1 (Warren Buffett)", pro: "All Gurus" },
  { feature: "Alert Speed", free: "3-Day Delay", pro: "Real-Time" },
  { feature: "Budget-Aware Sizing", free: "✓", pro: "✓" },
  { feature: "Portfolio Mirroring", free: "—", pro: "✓" },
  { feature: "Drift Alerts", free: "—", pro: "✓" },
  { feature: "Guru Scoreboard", free: "—", pro: "✓" },
  { feature: "AI Trade Rationale", free: "—", pro: "✓" },
  { feature: "Fractional Shares", free: "—", pro: "✓" },
];

export default function Landing() {
  const { user } = useAuth();
  const loggedIn = !!user;
  const ctaLink = loggedIn ? "/dashboard" : "/signup";
  const ctaText = loggedIn ? "Go to Dashboard" : "Start Free";

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-6 py-4">
          <Link to="/" className="text-2xl font-extrabold tracking-tight">
            <span className="text-emerald-400">Guru</span>
            <span className="text-white">Stock</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link to="/login" className="text-sm text-gray-400 hover:text-white transition">
              Log In
            </Link>
            <Link
              to={ctaLink}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition shadow-lg shadow-emerald-500/20"
            >
              {ctaText}
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-20 md:py-28 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Invest Like the{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
              Pros
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Track the public filings and disclosed trades of top investment gurus — Buffett, Dalio, Wood, Ackman —
            and get budget-aware alerts you can actually act on.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to={ctaLink}
              className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3.5 rounded-xl text-lg font-semibold transition shadow-lg shadow-emerald-500/20"
            >
              {ctaText}
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-8 py-3.5 rounded-xl text-lg font-semibold transition"
            >
              Log In
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-lg mx-auto">
            {[
              { value: "4", label: "Top Gurus" },
              { value: "Real-Time", label: "Pro Alerts" },
              { value: "Budget", label: "Aware" },
              { value: "Free", label: "Tier Available" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guru Showcase ── */}
      <section className="py-16 md:py-20 bg-gray-900/50 border-y border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            Track the World's Top Investors
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            Follow every trade filed with the SEC. No delays for Pro users — know what the gurus are doing in real time.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {gurus.map((g) => (
              <div
                key={g.name}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 group"
              >
                <div
                  className={`w-16 h-16 ${g.color} rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 shadow-lg`}
                >
                  {g.initials}
                </div>
                <h3 className="font-semibold text-white text-lg mb-1">{g.name}</h3>
                <p className="text-sm text-emerald-400 font-medium mb-3">{g.firm}</p>
                <p className="text-xs text-gray-500 leading-relaxed mb-4">{g.description}</p>
                <Link
                  to="/signup"
                  className="inline-block text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition group-hover:underline"
                >
                  View Trades →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-16 md:py-20">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            Everything You Need to Invest Smarter
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            From real-time SEC tracking to AI-powered trade explanations — GuruStock has you covered.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors duration-200"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-16 md:py-20 bg-gray-900/50 border-y border-gray-800/50">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            Start free and upgrade when you're ready for the full arsenal.
          </p>

          {/* Price cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* Free */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
              <h3 className="text-lg font-semibold text-white mb-2">Free</h3>
              <div className="flex items-baseline justify-center gap-1 mb-2">
                <span className="text-4xl font-bold text-white">$0</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">Track one guru with delayed alerts.</p>
              <Link
                to="/signup"
                className="block w-full border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white px-6 py-2.5 rounded-lg font-semibold transition"
              >
                Get Started
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-gray-900 border-2 border-emerald-500/40 rounded-2xl p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-4 py-1 rounded-bl-lg">
                RECOMMENDED
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Pro</h3>
              <div className="flex items-baseline justify-center gap-1 mb-2">
                <span className="text-4xl font-bold text-emerald-400">$9.99</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mb-6">All gurus, real-time alerts, and premium features.</p>
              <Link
                to="/signup"
                className="block w-full bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-semibold transition shadow-lg shadow-emerald-500/20"
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>

          {/* Comparison table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <h3 className="text-lg font-semibold text-white p-6 border-b border-gray-800">
              Plan Comparison
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-sm">
                    <th className="text-left py-3 px-6 text-gray-500 font-medium">Feature</th>
                    <th className="text-center py-3 px-6 text-gray-500 font-medium">Free</th>
                    <th className="text-center py-3 px-6 text-emerald-400 font-medium">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRows.map((row) => (
                    <tr key={row.feature} className="border-b border-gray-800/50 last:border-0">
                      <td className="py-3.5 px-6 text-sm text-gray-300">{row.feature}</td>
                      <td className="py-3.5 px-6 text-sm text-center text-gray-500">{row.free}</td>
                      <td className="py-3.5 px-6 text-sm text-center text-emerald-400 font-medium">{row.pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 md:py-20 text-center">
        <div className="max-w-2xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to Invest Like the Pros?</h2>
          <p className="text-gray-500 mb-8">
            Join thousands of retail investors who use GuruStock to follow the world's best investors.
          </p>
          <Link
            to={ctaLink}
            className="inline-block bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-3.5 rounded-xl text-lg font-semibold transition shadow-lg shadow-emerald-500/20"
          >
            {ctaText}
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 bg-gray-950">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2">
                <li><Link to="/signup" className="text-sm text-gray-500 hover:text-gray-300 transition">Sign Up</Link></li>
                <li><Link to="/upgrade" className="text-sm text-gray-500 hover:text-gray-300 transition">Pricing</Link></li>
                <li><Link to="/login" className="text-sm text-gray-500 hover:text-gray-300 transition">Log In</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Gurus</h4>
              <ul className="space-y-2">
                {gurus.map((g) => (
                  <li key={g.name}>
                    <Link to="/signup" className="text-sm text-gray-500 hover:text-gray-300 transition">{g.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Company</h4>
              <ul className="space-y-2">
                <li><span className="text-sm text-gray-500">About</span></li>
                <li><span className="text-sm text-gray-500">Blog</span></li>
                <li><span className="text-sm text-gray-500">Contact</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Legal</h4>
              <ul className="space-y-2">
                <li><span className="text-sm text-gray-500">Privacy Policy</span></li>
                <li><span className="text-sm text-gray-500">Terms of Service</span></li>
                <li><span className="text-sm text-gray-500">Disclaimer</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              &copy; 2026 GuruStock. Not financial advice. Trade responsibly.
            </p>
            <p className="text-sm text-gray-600">
              <span className="text-emerald-500 font-semibold">Guru</span>Stock
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
