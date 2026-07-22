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
    overlay_data: Array<{ ticker: string; action: string; change: string }>;
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

function generateHook(guruName: string, ticker: string, action: string): string {
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

// ── Handlers ────────────────────────────────────────────────────────────

export async function handleContentV1(req: Request): Promise<Response> {
  const auth = extractV1Auth(req);
  if (!checkRateLimit(auth, req)) return v1RateLimited();

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1/content", "");

  // GET /api/v1/content/daily-brief
  if (req.method === "GET" && (path === "/daily-brief" || path === "/daily-brief/")) {
    return handleDailyBrief();
  }

  // GET /api/v1/content/video-script
  if (req.method === "GET" && (path === "/video-script" || path === "/video-script/")) {
    const guruSlug = url.searchParams.get("guru") || "";
    const format = url.searchParams.get("format") || "tiktok";
    if (!["tiktok", "youtube", "reel"].includes(format)) {
      return v1Error("Invalid format. Use: tiktok, youtube, or reel", 400);
    }
    return handleVideoScript(guruSlug, format);
  }

  // GET /api/v1/content/weekly-roundup
  if (req.method === "GET" && (path === "/weekly-roundup" || path === "/weekly-roundup/")) {
    const days = parseInt(url.searchParams.get("days") || "7");
    return handleWeeklyRoundup(Math.min(days, 90));
  }

  // GET /api/v1/content/infographic-data
  if (req.method === "GET" && (path === "/infographic-data" || path === "/infographic-data/")) {
    const type = url.searchParams.get("type") || "scoreboard";
    return handleInfographicData(type);
  }

  return v1Error("Not found", 404);
}

// ── Daily Brief ─────────────────────────────────────────────────────────

async function handleDailyBrief(): Promise<Response> {
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

    const topTrades = rows.slice(0, 10).map((t: any) => ({
      guru: t.guru_name,
      guru_slug: t.guru_slug,
      ticker: t.ticker,
      company_name: t.company_name,
      action: t.action,
      rationale: generateRationale({
        ticker: t.ticker,
        company_name: t.company_name,
        action: t.action,
        guru_name: t.guru_name,
        guru_slug: t.guru_slug,
      }),
      suggested_hook: generateHook(t.guru_name, t.ticker, t.action),
      confidence: t.confidence,
    }));

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

async function handleVideoScript(guruSlug: string, format: string): Promise<Response> {
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

    // Build script based on format
    const durationMap: Record<string, number> = { tiktok: 30, reel: 30, youtube: 60 };
    const estimatedDuration = durationMap[format] || 30;

    const hook = `${guruRow.name} just made ${trades.length} moves you NEED to see 👀`;

    const bodyPoints = trades.map((t: any, i: number) => {
      const rationale = generateRationale({
        ticker: t.ticker,
        company_name: t.company_name,
        action: t.action,
        guru_name: t.guru_name,
        guru_slug: t.guru_slug,
      });
      // Truncate rationale for short-form video
      const short = rationale.length > 150 ? rationale.slice(0, 147) + "..." : rationale;
      return `${i + 1}. ${t.action.toUpperCase()} ${t.ticker} (${t.company_name.slice(0, 20)}) — ${short}`;
    });

    const overlayData = trades.map((t: any) => ({
      ticker: t.ticker,
      action: t.action,
      change: `${t.action === "buy" ? "📈 New Buy" : "📉 New Sell"}`,
    }));

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

async function handleWeeklyRoundup(days: number): Promise<Response> {
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

    const notableTrades = trades.map((t: any) => ({
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
    }));

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
