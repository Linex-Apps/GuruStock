/**
 * Widget API v1 — lightweight trade data endpoints for DealBridge embeddable widgets.
 *
 * GET /api/v1/widgets/top-trades?limit=5&guru=slug
 * GET /api/v1/widgets/scoreboard-mini
 * GET /api/v1/widgets/consensus-picks
 */

import { sql } from "../../db";
import { computeScoreboard } from "../../lib/scoreboard";
import { marketData, type Quote } from "../../lib/market-data";
import { extractV1Auth, checkRateLimit, v1Response, v1Error, v1RateLimited } from "./_utils";

// ── Widget-friendly trade type (minimal fields for fast rendering) ─────

interface WidgetTrade {
  guru: string;
  guru_slug: string;
  ticker: string;
  company_name: string;
  action: "buy" | "sell";
  confidence: string;
  live_price: number | null;
  live_change_pct: number | null;
  price_direction: "up" | "down" | "flat";
}

interface WidgetScoreboardEntry {
  name: string;
  slug: string;
  win_rate: number;
  total_trades: number;
  rank: number;
}

interface WidgetConsensusPick {
  ticker: string;
  company_name: string;
  direction: string;
  guru_count: number;
  signal_strength: string;
}

export async function handleWidgetsV1(req: Request): Promise<Response> {
  const auth = extractV1Auth(req);
  if (!checkRateLimit(auth, req)) return v1RateLimited();

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1/widgets", "");

  if (req.method === "GET" && (path === "/top-trades" || path === "/top-trades/")) {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "5"), 20);
    const guru = url.searchParams.get("guru") || "";
    return handleTopTrades(limit, guru, auth.tier);
  }

  if (req.method === "GET" && (path === "/scoreboard-mini" || path === "/scoreboard-mini/")) {
    return handleScoreboardMini();
  }

  if (req.method === "GET" && (path === "/consensus-picks" || path === "/consensus-picks/")) {
    return handleConsensusPicks();
  }

  return v1Error("Not found", 404);
}

// ── Top Trades ──────────────────────────────────────────────────────────

async function handleTopTrades(limit: number, guruSlug: string, tier: string): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    let rows: any[];
    if (guruSlug) {
      rows = await sql`
        SELECT t.*, g.name as guru_name, g.slug as guru_slug
        FROM trades t
        JOIN gurus g ON t.guru_id = g.id
        WHERE g.is_active = true AND g.slug = ${guruSlug}
        ORDER BY t.filing_date DESC, t.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT t.*, g.name as guru_name, g.slug as guru_slug
        FROM trades t
        JOIN gurus g ON t.guru_id = g.id
        WHERE g.is_active = true
        ORDER BY t.filing_date DESC, t.created_at DESC
        LIMIT ${limit}
      `;
    }

    // Fetch live prices
    const tickerList = [...new Set(rows.map((r: any) => r.ticker))];
    let liveQuotes: Map<string, Quote> = new Map();
    if (tier !== "free") {
      try {
        liveQuotes = await marketData.getQuotes(tickerList);
      } catch (err) {
        console.warn("[widgets/top-trades] Market data fetch failed:", err);
      }
    }

    const trades: WidgetTrade[] = rows.map((t: any) => {
      const quote = liveQuotes.get(t.ticker);
      const livePrice = quote?.price ?? null;
      const liveChangePct = quote?.changePercent ?? null;

      let priceDirection: "up" | "down" | "flat" = "flat";
      if (liveChangePct != null) {
        priceDirection = liveChangePct > 0 ? "up" : liveChangePct < 0 ? "down" : "flat";
      }

      return {
        guru: t.guru_name,
        guru_slug: t.guru_slug,
        ticker: t.ticker,
        company_name: t.company_name,
        action: t.action,
        confidence: t.confidence,
        live_price: livePrice,
        live_change_pct: liveChangePct,
        price_direction: priceDirection,
      };
    });

    return v1Response({
      trades,
      meta: {
        total: trades.length,
        generated_at: new Date().toISOString(),
        api_version: "v1",
      },
    });
  } catch (err) {
    console.error("[widgets/top-trades] Error:", err);
    return v1Error("Failed to fetch trades", 500);
  }
}

// ── Scoreboard Mini ─────────────────────────────────────────────────────

async function handleScoreboardMini(): Promise<Response> {
  try {
    const data = await computeScoreboard();
    const top3: WidgetScoreboardEntry[] = data.gurus.slice(0, 3).map((g, i) => ({
      name: g.name,
      slug: g.slug,
      win_rate: g.win_rate,
      total_trades: g.total_trades,
      rank: i + 1,
    }));

    return v1Response({
      top_gurus: top3,
      meta: {
        generated_at: new Date().toISOString(),
        api_version: "v1",
      },
    });
  } catch (err) {
    console.error("[widgets/scoreboard-mini] Error:", err);
    return v1Error("Failed to compute scoreboard", 500);
  }
}

// ── Consensus Picks ─────────────────────────────────────────────────────

async function handleConsensusPicks(): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    const rows = await sql`
      SELECT t.ticker, t.action, t.company_name,
             COUNT(DISTINCT t.guru_id) as guru_count,
             ARRAY_AGG(DISTINCT g.name) as guru_names,
             MAX(t.filing_date) as latest_filing
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.is_active = true
      GROUP BY t.ticker, t.action, t.company_name
      HAVING COUNT(DISTINCT t.guru_id) >= 2
      ORDER BY guru_count DESC, latest_filing DESC
      LIMIT 10
    `;

    const picks: WidgetConsensusPick[] = rows.map((r: any) => ({
      ticker: r.ticker,
      company_name: r.company_name,
      direction: r.action,
      guru_count: Number(r.guru_count),
      signal_strength: Number(r.guru_count) >= 3 ? "strong" : "moderate",
    }));

    return v1Response({
      consensus_picks: picks,
      meta: {
        total: picks.length,
        generated_at: new Date().toISOString(),
        api_version: "v1",
      },
    });
  } catch (err) {
    console.error("[widgets/consensus-picks] Error:", err);
    return v1Error("Failed to compute consensus", 500);
  }
}
