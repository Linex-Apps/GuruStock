/**
 * Analytics API v1 — guru rankings, consensus picks, trending tickers.
 *
 * GET /api/v1/analytics/scoreboard
 * GET /api/v1/analytics/consensus
 * GET /api/v1/analytics/trending
 */

import { sql } from "../../db";
import { computeScoreboard } from "../../lib/scoreboard";
import { extractV1Auth, checkRateLimit, v1Response, v1Error, v1RateLimited } from "./_utils";

export async function handleAnalyticsV1(req: Request): Promise<Response> {
  const auth = extractV1Auth(req);
  if (!checkRateLimit(auth, req)) return v1RateLimited();

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1/analytics", "");

  if (req.method === "GET" && (path === "/scoreboard" || path === "/scoreboard/")) {
    return handleScoreboard();
  }

  if (req.method === "GET" && (path === "/consensus" || path === "/consensus/")) {
    return handleConsensus();
  }

  if (req.method === "GET" && (path === "/trending" || path === "/trending/")) {
    return handleTrending();
  }

  return v1Error("Not found", 404);
}

// ── Scoreboard ──────────────────────────────────────────────────────────

async function handleScoreboard(): Promise<Response> {
  try {
    const data = await computeScoreboard();

    // Augment with trade recency
    if (sql) {
      const recencyRows = await sql`
        SELECT g.slug, MAX(t.filing_date) as last_trade_date, COUNT(t.id) as recent_trades
        FROM gurus g
        LEFT JOIN trades t ON g.id = t.guru_id AND t.filing_date >= CURRENT_DATE - INTERVAL '90 days'
        WHERE g.is_active = true
        GROUP BY g.id, g.slug
      `;

      const recencyMap = new Map<string, { last_trade_date: string | null; recent_trades: number }>();
      for (const r of recencyRows) {
        recencyMap.set(r.slug, {
          last_trade_date: r.last_trade_date,
          recent_trades: Number(r.recent_trades),
        });
      }

      const gurusWithRecency = data.gurus.map((g) => {
        const recency = recencyMap.get(g.slug);
        return {
          ...g,
          last_trade_date: recency?.last_trade_date || null,
          recent_trades_90d: recency?.recent_trades || 0,
          activity_status: recency?.recent_trades ? (recency.recent_trades > 0 ? "active" : "inactive") : "unknown",
        };
      });

      return v1Response({
        gurus: gurusWithRecency,
        meta: { ...data.meta, generated_at: new Date().toISOString() },
      });
    }

    return v1Response({
      ...data,
      meta: { ...data.meta, generated_at: new Date().toISOString() },
    });
  } catch (err) {
    console.error("[analytics/scoreboard] Error:", err);
    return v1Error("Failed to compute scoreboard", 500);
  }
}

// ── Consensus ───────────────────────────────────────────────────────────

async function handleConsensus(): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    // Find tickers where 2+ gurus have traded the same direction
    const rows = await sql`
      SELECT t.ticker, t.action, t.company_name,
             COUNT(DISTINCT t.guru_id) as guru_count,
             ARRAY_AGG(DISTINCT g.name) as guru_names,
             ARRAY_AGG(DISTINCT g.slug) as guru_slugs,
             MAX(t.filing_date) as latest_filing
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.is_active = true
      GROUP BY t.ticker, t.action, t.company_name
      HAVING COUNT(DISTINCT t.guru_id) >= 2
      ORDER BY guru_count DESC, latest_filing DESC
    `;

    const consensus = rows.map((r: any) => ({
      ticker: r.ticker,
      company_name: r.company_name,
      direction: r.action,
      guru_count: Number(r.guru_count),
      gurus: r.guru_names,
      guru_slugs: r.guru_slugs,
      latest_filing: r.latest_filing,
      signal_strength: Number(r.guru_count) >= 3 ? "strong" : "moderate",
    }));

    return v1Response({
      consensus_picks: consensus,
      meta: {
        total: consensus.length,
        strong_signals: consensus.filter((c: any) => c.signal_strength === "strong").length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[analytics/consensus] Error:", err);
    return v1Error("Failed to compute consensus", 500);
  }
}

// ── Trending ────────────────────────────────────────────────────────────

async function handleTrending(): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    // Most active tickers by number of gurus trading them
    const rows = await sql`
      SELECT t.ticker, t.company_name,
             COUNT(DISTINCT t.guru_id) as guru_count,
             COUNT(t.id) as total_trades,
             ARRAY_AGG(DISTINCT g.name) as guru_names,
             MAX(t.filing_date) as latest_activity,
             SUM(CASE WHEN t.action = 'buy' THEN 1 ELSE 0 END) as buy_count,
             SUM(CASE WHEN t.action = 'sell' THEN 1 ELSE 0 END) as sell_count
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.is_active = true
      GROUP BY t.ticker, t.company_name
      ORDER BY guru_count DESC, latest_activity DESC
      LIMIT 20
    `;

    const trending = rows.map((r: any) => {
      const total = Number(r.buy_count) + Number(r.sell_count);
      const buyRatio = total > 0 ? Number(r.buy_count) / total : 0;
      return {
        ticker: r.ticker,
        company_name: r.company_name,
        guru_count: Number(r.guru_count),
        total_trades: Number(r.total_trades),
        buy_count: Number(r.buy_count),
        sell_count: Number(r.sell_count),
        sentiment: buyRatio > 0.6 ? "bullish" : buyRatio < 0.4 ? "bearish" : "mixed",
        sentiment_score: +(buyRatio * 100).toFixed(0),
        gurus: r.guru_names,
        latest_activity: r.latest_activity,
      };
    });

    return v1Response({
      trending,
      meta: {
        total_tickers: trending.length,
        most_bullish: trending.filter((t: any) => t.sentiment === "bullish").map((t: any) => t.ticker),
        most_bearish: trending.filter((t: any) => t.sentiment === "bearish").map((t: any) => t.ticker),
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[analytics/trending] Error:", err);
    return v1Error("Failed to compute trending", 500);
  }
}
