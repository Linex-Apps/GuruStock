/**
 * Content Engine API v1 — structured data for Virlo, Linex Studios, and DealBridge.
 *
 * GET /api/v1/content/daily-brief
 * GET /api/v1/content/video-script?guru=slug&format=tiktok|youtube|reel
 * GET /api/v1/content/weekly-roundup?days=7
 * GET /api/v1/content/infographic-data?type=scoreboard|portfolio|sectors
 */

import { sql } from "../../db";
import { generateRationale } from "../../lib/rationale";
import { computeScoreboard } from "../../lib/scoreboard";
import { marketData, type Quote } from "../../lib/market-data";
import { extractV1Auth, checkRateLimit, v1Response, v1Error, v1RateLimited } from "./_utils";

// ── Response types ──────────────────────────────────────────────────────

interface DailyBriefResponse {
  date: string;
  top_trades: Array<{
    guru: string;
    guru_slug: string;
    ticker: string;
    company_name: string;
    action: "buy" | "sell";
    rationale: string;
    suggested_hook: string;
    confidence: string;
    live_price?: number | null;
    live_change_pct?: number | null;
  }>;
  market_summary: string;
  suggested_hashtags: string[];
}

interface VideoScriptResponse {
  guru: string;
  guru_slug: string;
  format: string;
  script: {
    hook: string;
    body_points: string[];
    overlay_data: Array<{
      ticker: string;
      action: string;
      change: string;
      price?: number | null;
      change_pct?: number | null;
    }>;
    cta: string;
    estimated_duration_seconds: number;
  };
}

interface WeeklyRoundupResponse {
  period: { start: string; end: string };
  notable_trades: Array<{
    guru: string;
    guru_slug: string;
    ticker: string;
    company_name: string;
    action: string;
    filing_date: string;
    rationale: string;
    live_price?: number | null;
    live_change_pct?: number | null;
  }>;
  scoreboard_changes: Array<{
    guru: string;
    slug: string;
    previous_rank: number;
    current_rank: number;
    change_reason: string;
  }>;
  consensus_picks: Array<{ ticker: string; direction: string; guru_count: number; gurus: string[] }>;
}

// ── Hook templates ──────────────────────────────────────────────────────

function generateHook(guruName: string, ticker: string, action: string, livePrice?: number | null, liveChangePct?: number | null): string {
  const hooks: Record<string, string[]> = {
    buy: [
      `🚨 ${guruName} just bought MORE ${ticker} — here's why 👇`,
      `${guruName} is betting BIG on ${ticker} right now`,
      `Why ${guruName} thinks ${ticker} is undervalued 📈`,
      `${guruName}'s newest buy: ${ticker}. Full breakdown 🧵`,
      `Unusual activity: ${guruName} adds ${ticker} to the portfolio`,
    ],
    sell: [
      `⚠️ ${guruName} is SELLING ${ticker} — what do they know?`,
      `${guruName} just cut their ${ticker} position. Red flag? 🚩`,
      `Why ${guruName} is getting out of ${ticker} right now`,
      `${guruName} reduces ${ticker} — smart move or panic sell?`,
      `Portfolio shakeup: ${guruName} exits ${ticker}`,
    ],
  };

  const options = hooks[action] || hooks.buy;
  const seed = `${guruName}:${ticker}:${action}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;

  // If live data available, inject price context into the hook
  if (livePrice != null && liveChangePct != null) {
    const direction = liveChangePct >= 0 ? "📈" : "📉";
    const pctStr = Math.abs(liveChangePct).toFixed(1);
    const priceHook = `${ticker} now at $${livePrice.toFixed(2)} ${direction}${pctStr}%`;
    if (action === "buy") {
      return `${guruName} bought ${ticker} — it's now at $${livePrice.toFixed(2)} ${direction}${pctStr}% since. Worth following?`;
    } else {
      return `${guruName} sold ${ticker} — ${priceHook} since. Smart move?`;
    }
  }

  return options[Math.abs(hash) % options.length];
}

// ── Market summary generator ────────────────────────────────────────────

function generateMarketSummary(tradeCount: number, guruCount: number, topSector: string): string {
  if (tradeCount === 0) return "No new guru trades filed today. Markets steady with no significant insider moves.";

  const templates = [
    `Today's filings show ${tradeCount} notable trades across ${guruCount} tracked gurus, with the most activity in ${topSector}. Investors should watch for follow-through in these names.`,
    `${guruCount} superstar investors filed ${tradeCount} trades today — ${topSector} is seeing the most action. Here's what matters.`,
    `A busy filing day: ${tradeCount} trades from ${guruCount} gurus, with ${topSector} stocks dominating the activity.`,
  ];

  return templates[tradeCount % templates.length];
}

// ── Hashtags ────────────────────────────────────────────────────────────

function generateHashtags(trades: Array<{ ticker: string; guru: string }>): string[] {
  const base = ["#investing", "#stocks", "#gurustock", "#stockmarket", "#trades"];
  const tickerTags = [...new Set(trades.map((t) => `#${t.ticker}`))].slice(0, 5);
  const guruTags = [...new Set(trades.map((t) => `#${t.guru.toLowerCase().replace(/\s+/g, "")}`))].slice(0, 3);
  return [...base, ...tickerTags, ...guruTags];
}

// ── Live price enrichment helper ────────────────────────────────────────

async function enrichWithLivePrices<T extends { ticker: string }>(
  items: T[],
  authTier: string
): Promise<Map<string, Quote>> {
  if (authTier === "free") return new Map(); // Free tier: no live prices
  if (!items.length) return new Map();

  const tickers = [...new Set(items.map((t) => t.ticker))];
  try {
    return await marketData.getQuotes(tickers);
  } catch (err) {
    console.warn("[content] Live quote fetch failed:", err);
    return new Map();
  }
}

// ── Handlers ────────────────────────────────────────────────────────────

export async function handleContentV1(req: Request): Promise<Response> {
  const auth = extractV1Auth(req);
  if (!checkRateLimit(auth, req)) return v1RateLimited();

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1/content", "");

  // GET /api/v1/content/daily-brief
  if (req.method === "GET" && (path === "/daily-brief" || path === "/daily-brief/")) {
    return handleDailyBrief(auth.tier);
  }

  // GET /api/v1/content/video-script
  if (req.method === "GET" && (path === "/video-script" || path === "/video-script/")) {
    const guruSlug = url.searchParams.get("guru") || "";
    const format = url.searchParams.get("format") || "tiktok";
    if (!["tiktok", "youtube", "reel"].includes(format)) {
      return v1Error("Invalid format. Use: tiktok, youtube, or reel", 400);
    }
    return handleVideoScript(guruSlug, format, auth.tier);
  }

  // GET /api/v1/content/weekly-roundup
  if (req.method === "GET" && (path === "/weekly-roundup" || path === "/weekly-roundup/")) {
    const days = parseInt(url.searchParams.get("days") || "7");
    return handleWeeklyRoundup(Math.min(days, 90), auth.tier);
  }

  // GET /api/v1/content/infographic-data
  if (req.method === "GET" && (path === "/infographic-data" || path === "/infographic-data/")) {
    const type = url.searchParams.get("type") || "scoreboard";
    return handleInfographicData(type);
  }

  return v1Error("Not found", 404);
}

// ── Daily Brief ─────────────────────────────────────────────────────────

async function handleDailyBrief(tier: string): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    const today = new Date().toISOString().split("T")[0];

    const rows = await sql`
      SELECT t.*, g.name as guru_name, g.slug as guru_slug
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.is_active = true
      ORDER BY t.filing_date DESC, t.created_at DESC
      LIMIT 20
    `;

    if (!rows.length) {
      const empty: DailyBriefResponse = {
        date: today,
        top_trades: [],
        market_summary: "No trades filed yet. Check back after the next 13F filing window.",
        suggested_hashtags: ["#investing", "#stocks", "#gurustock"],
      };
      return v1Response(empty);
    }

    // Fetch live prices for all tickers in the brief
    const tickerList = [...new Set(rows.map((t: any) => t.ticker))];
    const liveQuotes = await enrichWithLivePrices(
      tickerList.map((t) => ({ ticker: t })),
      tier
    );

    const topTrades = rows.slice(0, 10).map((t: any) => {
      const ticker = t.ticker;
      const quote = liveQuotes.get(ticker);
      const livePrice = quote?.price ?? null;
      const liveChangePct = quote?.changePercent ?? null;

      // Build rationale with live price context if available
      let rationale = generateRationale({
        ticker: t.ticker,
        company_name: t.company_name,
        action: t.action,
        guru_name: t.guru_name,
        guru_slug: t.guru_slug,
      });

      if (livePrice != null && t.price_estimate != null) {
        const estimatedPrice = Number(t.price_estimate);
        const priceDiff = livePrice - estimatedPrice;
        const pctFromEntry = estimatedPrice > 0
          ? ((priceDiff / estimatedPrice) * 100).toFixed(1)
          : null;

        if (pctFromEntry != null) {
          const direction = priceDiff >= 0 ? "up" : "down";
          rationale += ` ${t.guru_name} bought ${ticker} at ~$${estimatedPrice.toFixed(2)}; it's now trading at $${livePrice.toFixed(2)} (${direction} ${Math.abs(Number(pctFromEntry))}%).`;
        }
      }

      return {
        guru: t.guru_name,
        guru_slug: t.guru_slug,
        ticker,
        company_name: t.company_name,
        action: t.action,
        rationale,
        suggested_hook: generateHook(t.guru_name, t.ticker, t.action, livePrice, liveChangePct),
        confidence: t.confidence,
        ...(tier !== "free" && livePrice != null ? {
          live_price: livePrice,
          live_change_pct: liveChangePct,
        } : {}),
      };
    });

    // Determine top sector by counting tickers
    const sectorCount: Record<string, number> = {};
    for (const t of rows) {
      sectorCount[t.ticker] = (sectorCount[t.ticker] || 0) + 1;
    }
    const topSector = Object.entries(sectorCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "various";

    const guruIds = new Set(rows.map((t: any) => t.guru_id));

    const brief: DailyBriefResponse = {
      date: today,
      top_trades: topTrades,
      market_summary: generateMarketSummary(rows.length, guruIds.size, topSector),
      suggested_hashtags: generateHashtags(topTrades),
    };

    return v1Response(brief);
  } catch (err) {
    console.error("[content/daily-brief] Error:", err);
    return v1Error("Failed to generate daily brief", 500);
  }
}

// ── Video Script ────────────────────────────────────────────────────────

async function handleVideoScript(guruSlug: string, format: string, tier: string): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    // Get guru
    const guruQuery = guruSlug
      ? sql`SELECT id, name, slug FROM gurus WHERE slug = ${guruSlug} AND is_active = true`
      : sql`SELECT id, name, slug FROM gurus WHERE is_active = true ORDER BY id LIMIT 1`;

    const [guruRow] = await guruQuery;
    if (!guruRow) return v1Error("Guru not found", 404);

    // Get recent trades for this guru
    const trades = await sql`
      SELECT t.*, g.name as guru_name, g.slug as guru_slug
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.id = ${guruRow.id}
      ORDER BY t.filing_date DESC, t.created_at DESC
      LIMIT 5
    `;

    if (!trades.length) {
      return v1Response({
        guru: guruRow.name,
        guru_slug: guruRow.slug,
        format,
        script: {
          hook: `What is ${guruRow.name} buying right now?`,
          body_points: ["No recent filings available yet.", "Check back after the next 13F filing deadline."],
          overlay_data: [],
          cta: "Follow @GuruStock for real-time trade alerts when new filings drop.",
          estimated_duration_seconds: 15,
        },
      });
    }

    // Fetch live prices for overlay data
    const tickerList = [...new Set(trades.map((t: any) => t.ticker))];
    const liveQuotes = await enrichWithLivePrices(
      tickerList.map((t) => ({ ticker: t })),
      tier
    );

    // Build script based on format
    const durationMap: Record<string, number> = { tiktok: 30, reel: 30, youtube: 60 };
    const estimatedDuration = durationMap[format] || 30;

    const hook = `${guruRow.name} just made ${trades.length} moves you NEED to see 👀`;

    const bodyPoints = trades.map((t: any, i: number) => {
      const ticker = t.ticker;
      const quote = liveQuotes.get(ticker);
      const livePrice = quote?.price;

      let rationale = generateRationale({
        ticker: t.ticker,
        company_name: t.company_name,
        action: t.action,
        guru_name: t.guru_name,
        guru_slug: t.guru_slug,
      });

      // Add live price to rationale for body points
      if (livePrice != null && t.price_estimate != null && tier !== "free") {
        const estimatedPrice = Number(t.price_estimate);
        const pctFromEntry = estimatedPrice > 0
          ? (((livePrice - estimatedPrice) / estimatedPrice) * 100).toFixed(1)
          : null;
        if (pctFromEntry != null) {
          const direction = Number(pctFromEntry) >= 0 ? "▲" : "▼";
          rationale += ` [Now $${livePrice.toFixed(2)} ${direction}${Math.abs(Number(pctFromEntry))}% from entry]`;
        }
      }

      // Truncate rationale for short-form video
      const short = rationale.length > 120 ? rationale.slice(0, 117) + "..." : rationale;
      return `${i + 1}. ${t.action.toUpperCase()} ${ticker} (${t.company_name.slice(0, 20)}) — ${short}`;
    });

    const overlayData = trades.map((t: any) => {
      const quote = liveQuotes.get(t.ticker);
      const livePrice = quote?.price ?? null;
      const liveChangePct = quote?.changePercent ?? null;

      let changeStr = `${t.action === "buy" ? "📈 New Buy" : "📉 New Sell"}`;
      if (livePrice != null && liveChangePct != null && tier !== "free") {
        const dir = liveChangePct >= 0 ? "📈" : "📉";
        changeStr = `${dir} $${livePrice.toFixed(2)} (${liveChangePct >= 0 ? "+" : ""}${liveChangePct.toFixed(2)}%)`;
      }

      return {
        ticker: t.ticker,
        action: t.action,
        change: changeStr,
        price: livePrice,
        change_pct: liveChangePct,
      };
    });

    // YouTube gets extra detail
    if (format === "youtube") {
      bodyPoints.push(`Full analysis and position sizing breakdown at GuruStock.com`);
    }

    const ctaMap: Record<string, string> = {
      tiktok: "Follow for daily guru trade alerts 🔔",
      reel: "Save this for later & follow for more 📌",
      youtube: "Like & subscribe for weekly deep dives into guru portfolios 👍",
    };

    const script: VideoScriptResponse = {
      guru: guruRow.name,
      guru_slug: guruRow.slug,
      format,
      script: {
        hook,
        body_points: bodyPoints,
        overlay_data: overlayData,
        cta: ctaMap[format] || ctaMap.tiktok,
        estimated_duration_seconds: estimatedDuration,
      },
    };

    return v1Response(script);
  } catch (err) {
    console.error("[content/video-script] Error:", err);
    return v1Error("Failed to generate video script", 500);
  }
}

// ── Weekly Roundup ──────────────────────────────────────────────────────

async function handleWeeklyRoundup(days: number, tier: string): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

    const trades = await sql`
      SELECT t.*, g.name as guru_name, g.slug as guru_slug
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.is_active = true
        AND t.filing_date >= ${startDate}
        AND t.filing_date <= ${endDate}
      ORDER BY t.filing_date DESC
    `;

    // Fetch live prices
    const tickerList = [...new Set(trades.map((t: any) => t.ticker))];
    const liveQuotes = await enrichWithLivePrices(
      tickerList.map((t) => ({ ticker: t })),
      tier
    );

    const notableTrades = trades.map((t: any) => {
      const quote = liveQuotes.get(t.ticker);
      const livePrice = quote?.price ?? null;
      const liveChangePct = quote?.changePercent ?? null;

      return {
        guru: t.guru_name,
        guru_slug: t.guru_slug,
        ticker: t.ticker,
        company_name: t.company_name,
        action: t.action,
        filing_date: t.filing_date,
        rationale: generateRationale({
          ticker: t.ticker,
          company_name: t.company_name,
          action: t.action,
          guru_name: t.guru_name,
          guru_slug: t.guru_slug,
        }),
        ...(tier !== "free" && livePrice != null ? {
          live_price: livePrice,
          live_change_pct: liveChangePct,
        } : {}),
      };
    });

    // Consensus picks: tickers with 2+ gurus trading same direction
    const tickerMap = new Map<string, { buys: string[]; sells: string[] }>();
    for (const t of trades) {
      if (!tickerMap.has(t.ticker)) {
        tickerMap.set(t.ticker, { buys: [], sells: [] });
      }
      const entry = tickerMap.get(t.ticker)!;
      if (t.action === "buy") entry.buys.push(t.guru_name);
      else entry.sells.push(t.guru_name);
    }

    const consensusPicks: WeeklyRoundupResponse["consensus_picks"] = [];
    for (const [ticker, data] of tickerMap) {
      if (data.buys.length >= 2) {
        consensusPicks.push({ ticker, direction: "buy", guru_count: data.buys.length, gurus: data.buys });
      }
      if (data.sells.length >= 2) {
        consensusPicks.push({ ticker, direction: "sell", guru_count: data.sells.length, gurus: data.sells });
      }
    }

    // Scoreboard changes — just current ranks (stubbed change tracking)
    const scoreboard = await computeScoreboard();
    const scoreboardChanges = scoreboard.gurus.map((g, i) => ({
      guru: g.name,
      slug: g.slug,
      previous_rank: i + 1, // same for now — real change tracking needs historical snapshots
      current_rank: i + 1,
      change_reason: "Rank unchanged this period",
    }));

    const roundup: WeeklyRoundupResponse = {
      period: { start: startDate, end: endDate },
      notable_trades: notableTrades,
      scoreboard_changes: scoreboardChanges,
      consensus_picks: consensusPicks,
    };

    return v1Response(roundup);
  } catch (err) {
    console.error("[content/weekly-roundup] Error:", err);
    return v1Error("Failed to generate weekly roundup", 500);
  }
}

// ── Infographic Data ────────────────────────────────────────────────────

async function handleInfographicData(type: string): Promise<Response> {
  if (!sql) return v1Error("Database unavailable", 503);

  try {
    if (type === "scoreboard") {
      const scoreboard = await computeScoreboard();
      return v1Response({
        type: "scoreboard",
        title: "Guru Performance Scoreboard",
        data: scoreboard.gurus.map((g) => ({
          label: g.name,
          value: g.win_rate,
          suffix: "% win rate",
          subtitle: `${g.total_trades} trades`,
        })),
      });
    }

    if (type === "portfolio") {
      const rows = await sql`
        SELECT g.name, COUNT(t.id) as trade_count, COUNT(DISTINCT t.ticker) as unique_tickers
        FROM gurus g
        LEFT JOIN trades t ON g.id = t.guru_id
        WHERE g.is_active = true
        GROUP BY g.id, g.name
        ORDER BY trade_count DESC
      `;

      return v1Response({
        type: "portfolio",
        title: "Guru Portfolio Overview",
        data: rows.map((r: any) => ({
          label: r.name,
          value: Number(r.trade_count),
          suffix: "positions",
          subtitle: `${Number(r.unique_tickers)} unique tickers`,
        })),
      });
    }

    if (type === "sectors") {
      const rows = await sql`
        SELECT t.ticker, COUNT(*) as cnt
        FROM trades t
        JOIN gurus g ON t.guru_id = g.id
        WHERE g.is_active = true
        GROUP BY t.ticker
        ORDER BY cnt DESC
        LIMIT 10
      `;

      return v1Response({
        type: "sectors",
        title: "Most Active Tickers",
        data: rows.map((r: any) => ({
          label: r.ticker,
          value: Number(r.cnt),
          suffix: "gurus",
          subtitle: "",
        })),
      });
    }

    return v1Error(`Unknown infographic type: ${type}. Use: scoreboard, portfolio, or sectors`, 400);
  } catch (err) {
    console.error("[content/infographic] Error:", err);
    return v1Error("Failed to generate infographic data", 500);
  }
}
