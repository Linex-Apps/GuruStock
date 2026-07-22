/**
 * Market Data API v1 — quotes and sector data (stubs with trade fallbacks).
 *
 * GET /api/v1/market/quotes?tickers=AAPL,TSLA
 * GET /api/v1/market/sectors
 */

import { sql } from "../../db";
import { extractV1Auth, checkRateLimit, v1Response, v1Error, v1RateLimited } from "./_utils";

export async function handleMarketV1(req: Request): Promise<Response> {
  const auth = extractV1Auth(req);
  if (!checkRateLimit(auth, req)) return v1RateLimited();

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1/market", "");

  if (req.method === "GET" && (path === "/quotes" || path === "/quotes/")) {
    const tickersParam = url.searchParams.get("tickers") || "";
    const tickers = tickersParam.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (!tickers.length) return v1Error("tickers query parameter required (e.g. ?tickers=AAPL,TSLA)", 400);
    return handleQuotes(tickers);
  }

  if (req.method === "GET" && (path === "/sectors" || path === "/sectors/")) {
    return handleSectors();
  }

  return v1Error("Not found", 404);
}

// ── Quotes (stub) ───────────────────────────────────────────────────────

async function handleQuotes(tickers: string[]): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    // Use trade price_estimate as a fallback — live market data not integrated yet
    const rows = await sql`
      SELECT t.ticker, t.price_estimate, t.filing_date
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.is_active = true AND t.ticker = ANY(${tickers})
      ORDER BY t.filing_date DESC
    `;

    // Build response: each ticker gets most recent price_estimate
    const tickerMap = new Map<string, { price: number | null; filing_date: string | null }>();
    for (const row of rows) {
      if (!tickerMap.has(row.ticker)) {
        tickerMap.set(row.ticker, {
          price: row.price_estimate ? Number(row.price_estimate) : null,
          filing_date: row.filing_date,
        });
      }
    }

    const quotes = tickers.map((ticker) => {
      const data = tickerMap.get(ticker);
      return {
        ticker,
        price: data?.price || null,
        price_date: data?.filing_date || null,
        source: "trade_estimate",
      };
    });

    return v1Response({
      live: false,
      message: "Price data is sourced from the most recent trade price_estimate. Live market data integration is planned.",
      quotes,
    });
  } catch (err) {
    console.error("[market/quotes] Error:", err);
    return v1Error("Failed to fetch quotes", 500);
  }
}

// ── Sectors ─────────────────────────────────────────────────────────────

async function handleSectors(): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    // Group trades by ticker as sector proxy (no real sector taxonomy yet)
    const rows = await sql`
      SELECT t.ticker, t.company_name,
             COUNT(DISTINCT t.guru_id) as guru_count,
             COUNT(t.id) as trade_count,
             SUM(CASE WHEN t.action = 'buy' THEN 1 ELSE 0 END) as buys,
             SUM(CASE WHEN t.action = 'sell' THEN 1 ELSE 0 END) as sells
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.is_active = true
      GROUP BY t.ticker, t.company_name
      ORDER BY guru_count DESC, trade_count DESC
    `;

    const sectors = rows.map((r: any) => ({
      ticker: r.ticker,
      company_name: r.company_name,
      guru_count: Number(r.guru_count),
      trade_count: Number(r.trade_count),
      buy_count: Number(r.buys),
      sell_count: Number(r.sells),
      net_sentiment: Number(r.buys) >= Number(r.sells) ? "net_buy" : "net_sell",
    }));

    return v1Response({
      live: false,
      message: "Sector data derived from guru trade activity. Formal sector classification is planned.",
      sectors,
      meta: {
        total_tickers: sectors.length,
        total_trades: sectors.reduce((s: number, sc: any) => s + sc.trade_count, 0),
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[market/sectors] Error:", err);
    return v1Error("Failed to fetch sector data", 500);
  }
}
