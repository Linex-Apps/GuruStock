/**
 * Market Data Service — Live quotes from Yahoo Finance via yahoo-finance2.
 *
 * Uses an in-memory cache with configurable TTL. Falls back gracefully:
 * cache hit → stale cache (extended) → Yahoo live → trade price_estimate.
 *
 * Provider can be swapped by changing MARKET_DATA_PROVIDER in .env.
 * No API key required for Yahoo Finance.
 */

import YahooFinance from "yahoo-finance2";
import { sql } from "../db";

// yahoo-finance2 v4 requires creating an instance
const yahooFinance = new YahooFinance();

// ── Types ──────────────────────────────────────────────────────────────────

export interface Quote {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  previousClose: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  source: "yahoo" | "cache" | "fallback";
  cachedAt?: string;
}

interface CacheEntry {
  quote: Quote;
  fetchedAt: number;
}

// ── Config ─────────────────────────────────────────────────────────────────

const CACHE_TTL = parseInt(process.env.MARKET_CACHE_TTL || "300") * 1000; // ms
const PROVIDER = process.env.MARKET_DATA_PROVIDER || "yahoo";
const STALE_TTL = CACHE_TTL * 2; // serve stale if Yahoo fails

// ── QuoteCache ─────────────────────────────────────────────────────────────

class QuoteCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Get a single quote for a ticker. Returns live data or cached fallback.
   */
  async getQuote(ticker: string): Promise<Quote | null> {
    const quotes = await this.getQuotes([ticker]);
    return quotes.get(ticker.toUpperCase()) || null;
  }

  /**
   * Batch-fetch quotes. Returns Map<ticker, Quote>.
   * Tickers not found in Yahoo or fallback won't appear in the map.
   */
  async getQuotes(tickers: string[]): Promise<Map<string, Quote>> {
    const upperTickers = tickers.map((t) => t.trim().toUpperCase()).filter(Boolean);
    const result = new Map<string, Quote>();

    if (!upperTickers.length) return result;

    const now = Date.now();
    const toFetch: string[] = [];
    const toFetchFromCache: string[] = [];

    // Check cache first
    for (const ticker of upperTickers) {
      const cached = this.cache.get(ticker);
      if (cached && now - cached.fetchedAt < CACHE_TTL) {
        // Fresh cache
        result.set(ticker, { ...cached.quote, source: "cache" });
      } else if (cached && now - cached.fetchedAt < STALE_TTL) {
        // Stale but usable — serve it, but also re-fetch in background
        result.set(ticker, { ...cached.quote, source: "cache" });
        toFetchFromCache.push(ticker);
      } else {
        toFetch.push(ticker);
      }
    }

    // Merge items needing background refresh into fetch list
    const allToFetch = [...new Set([...toFetch, ...toFetchFromCache])];

    if (allToFetch.length > 0) {
      try {
        await this.fetchAndCache(allToFetch, result);
      } catch (err) {
        console.warn("[market-data] Yahoo fetch failed, serving stale cache:", err);
        // Already populated stale entries above in result; missing ones remain missing
      }
    }

    // Any tickers still missing? Try price_estimate fallback from trades table
    const missing = upperTickers.filter((t) => !result.has(t));
    if (missing.length > 0) {
      await this.fallbackFromTrades(missing, result);
    }

    return result;
  }

  /**
   * Fetch from Yahoo Finance and update cache.
   */
  private async fetchAndCache(tickers: string[], result: Map<string, Quote>): Promise<void> {
    if (PROVIDER !== "yahoo") {
      // Future: swap in Polygon.io or other provider here
      console.warn(`[market-data] Unknown provider: ${PROVIDER}, skipping live fetch`);
      return;
    }

    const now = Date.now();
    const quoteSummaries = await yahooFinance.quote(tickers, {
      fields: [
        "regularMarketPrice",
        "regularMarketChange",
        "regularMarketChangePercent",
        "regularMarketVolume",
        "regularMarketPreviousClose",
        "marketCap",
        "fiftyTwoWeekHigh",
        "fiftyTwoWeekLow",
      ],
    });

    // yahoo-finance2 may return a single object or array
    const summaries = Array.isArray(quoteSummaries) ? quoteSummaries : [quoteSummaries];

    for (const q of summaries) {
      const ticker = (q.symbol || "").toUpperCase();
      if (!ticker) continue;

      const quote: Quote = {
        ticker,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent
          ? Math.round(q.regularMarketChangePercent * 10000) / 10000
          : null,
        volume: q.regularMarketVolume ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        marketCap: q.marketCap ?? null,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
        source: "yahoo",
        cachedAt: new Date(now).toISOString(),
      };

      this.cache.set(ticker, { quote, fetchedAt: now });
      result.set(ticker, quote);
    }
  }

  /**
   * Fallback: use the most recent trade price_estimate from the DB.
   */
  private async fallbackFromTrades(tickers: string[], result: Map<string, Quote>): Promise<void> {
    if (!sql) return;

    try {
      const rows = await sql`
        SELECT t.ticker, t.price_estimate, t.filing_date
        FROM trades t
        JOIN gurus g ON t.guru_id = g.id
        WHERE g.is_active = true AND t.ticker = ANY(${tickers})
        ORDER BY t.filing_date DESC
      `;

      const seen = new Set<string>();
      for (const row of rows) {
        const ticker = row.ticker as string;
        if (seen.has(ticker)) continue;
        seen.add(ticker);

        const quote: Quote = {
          ticker,
          price: row.price_estimate ? Number(row.price_estimate) : null,
          change: null,
          changePercent: null,
          volume: null,
          previousClose: null,
          marketCap: null,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          source: "fallback",
          cachedAt: new Date().toISOString(),
        };

        result.set(ticker, quote);
      }
    } catch (err) {
      console.warn("[market-data] Trade fallback failed:", err);
    }
  }

  /**
   * Get sector performance. Yahoo Finance provides sector data via
   * sectorTrends if available; otherwise derive from guru trade activity.
   */
  async getSectorPerformance(): Promise<{
    live: boolean;
    sectors: Array<{ ticker: string; company_name: string; guru_count: number; trade_count: number; buy_count: number; sell_count: number; net_sentiment: string }>;
    meta: { total_tickers: number; total_trades: number; generated_at: string; source: string };
  }> {
    if (!sql) {
      return {
        live: false,
        sectors: [],
        meta: { total_tickers: 0, total_trades: 0, generated_at: new Date().toISOString(), source: "none" },
      };
    }

    try {
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

      return {
        live: false,
        sectors,
        meta: {
          total_tickers: sectors.length,
          total_trades: sectors.reduce((s: number, sc: any) => s + sc.trade_count, 0),
          generated_at: new Date().toISOString(),
          source: "trade_derived",
        },
      };
    } catch (err) {
      console.error("[market-data/sectors] Error:", err);
      return {
        live: false,
        sectors: [],
        meta: { total_tickers: 0, total_trades: 0, generated_at: new Date().toISOString(), source: "error" },
      };
    }
  }

  /**
   * Clear all cached entries. Useful for testing or forced refresh.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Return cache stats for monitoring.
   */
  getCacheStats(): { size: number; ttlMs: number; staleTtlMs: number } {
    return { size: this.cache.size, ttlMs: CACHE_TTL, staleTtlMs: STALE_TTL };
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const marketData = new QuoteCache();
