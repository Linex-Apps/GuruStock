/**
 * Market Data API v1 — live quotes from Yahoo Finance with graceful fallback.
 *
 * GET /api/v1/market/quotes?tickers=AAPL,TSLA
 * GET /api/v1/market/sectors
 */

import { marketData } from "../../lib/market-data";
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

// ── Quotes (live Yahoo Finance) ───────────────────────────────────────────

async function handleQuotes(tickers: string[]): Promise<Response> {
  try {
    const quotes = await marketData.getQuotes(tickers);

    const result = tickers.map((ticker) => {
      const q = quotes.get(ticker);
      if (!q) {
        return {
          ticker,
          price: null,
          price_date: null,
          source: "unavailable",
          dayChange: null,
          dayChangePercent: null,
          volume: null,
          previousClose: null,
          marketCap: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
        };
      }

      const isLive = q.source === "yahoo";
      // For cache hits, include when the data was originally fetched
      return {
        ticker: q.ticker,
        price: q.price,
        price_date: q.cachedAt || null,
        source: q.source,
        dayChange: q.change,
        dayChangePercent: q.changePercent,
        volume: q.volume,
        previousClose: q.previousClose,
        marketCap: q.marketCap,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      };
    });

    const allLive = result.every((r) => r.source === "yahoo" || r.source === "cache");
    const anyLive = result.some((r) => r.source === "yahoo" || r.source === "cache");

    let message: string;
    if (allLive) {
      message = "Live market data from Yahoo Finance.";
    } else if (anyLive) {
      message = "Mixed data: some quotes are live (Yahoo Finance), others from trade estimates.";
    } else {
      message = "Price data sourced from trade price_estimate fallback. Live market data temporarily unavailable.";
    }

    // Collect errors for tickers that failed entirely
    const errors = tickers
      .filter((t) => !quotes.has(t))
      .map((t) => ({ ticker: t, error: "No data available" }));

    return v1Response({
      live: allLive,
      message,
      quotes: result,
      ...(errors.length > 0 ? { errors } : {}),
      meta: {
        provider: process.env.MARKET_DATA_PROVIDER || "yahoo",
        cache_stats: marketData.getCacheStats(),
      },
    });
  } catch (err) {
    console.error("[market/quotes] Error:", err);
    return v1Error("Failed to fetch quotes", 500);
  }
}

// ── Sectors ─────────────────────────────────────────────────────────────

async function handleSectors(): Promise<Response> {
  try {
    const data = await marketData.getSectorPerformance();
    return v1Response(data);
  } catch (err) {
    console.error("[market/sectors] Error:", err);
    return v1Error("Failed to fetch sector data", 500);
  }
}
