/**
 * Virlo Content Pipeline — assembles structured content packages for
 * automated video/audio content generation across the Linex ecosystem.
 *
 * A single call to generateDailyContent() produces everything Virlo
 * needs for a day of investing content: trade alerts, scoreboard data,
 * video scripts with platform-specific optimizations, and a suggested
 * posting calendar.
 */

import { sql } from "../db";
import { generateRationale, type TradeForRationale } from "./rationale";
import { computeScoreboard } from "./scoreboard";
import { marketData, type Quote } from "./market-data";

// ── Types ───────────────────────────────────────────────────────────────

export interface VirloDailyPackage {
  generated_at: string;
  api_version: string;
  date: string;
  content_freshness: "realtime" | "delayed";
  trades: VirloEnrichedTrade[];
  scoreboard: VirloScoreboardEntry[];
  video_scripts: VirloVideoScript[];
  suggested_schedule: VirloContentSlot[];
  market_summary: string;
  hashtag_bundle: VirloHashtagBundle;
}

export interface VirloEnrichedTrade {
  guru: string;
  guru_slug: string;
  ticker: string;
  company_name: string;
  action: "buy" | "sell";
  confidence: string;
  filing_date: string;
  rationale: string;
  hook: string;
  live_price: number | null;
  live_change_pct: number | null;
  price_callout: string | null; // formatted price for on-screen overlay
}

export interface VirloScoreboardEntry {
  name: string;
  slug: string;
  win_rate: number;
  total_trades: number;
  rank: number;
  color: string; // brand color hex
}

export interface VirloVideoScript {
  guru: string;
  guru_slug: string;
  format: "tiktok" | "youtube" | "reel";
  brand_color: string;
  script: {
    hook: string;
    body_points: string[];
    overlay_data: Array<{
      ticker: string;
      action: string;
      price_overlay: string; // "AAPL $195.23 ▲2.1%" — ready-to-render
    }>;
    cta: string;
    estimated_duration_seconds: number;
    optimal_posting_time: string; // HH:MM timezone-aware suggestion
    hashtags: string[];
  };
}

export interface VirloContentSlot {
  platform: "tiktok" | "youtube" | "instagram" | "twitter" | "linkedin" | "newsletter";
  time: string; // HH:MM suggestion
  content_type: "video" | "carousel" | "thread" | "post" | "article" | "story";
  script_id: string; // references video_scripts entry or "scoreboard"/"brief"
  priority: "high" | "medium";
}

export interface VirloHashtagBundle {
  core: string[];      // always-include: #investing, #gurustock, etc.
  ticker_tags: string[];
  guru_tags: string[];
  platform_specific: Record<string, string[]>; // per-platform extras
}

// ── Guru brand colors ───────────────────────────────────────────────────

const GURU_COLORS: Record<string, string> = {
  "warren-buffett": "#1E40AF",   // Buffett blue
  "ray-dalio":     "#DC2626",   // Dalio red
  "cathie-wood":   "#7C3AED",   // Wood purple
  "bill-ackman":   "#059669",   // Ackman green
};

const DEFAULT_COLOR = "#6B7280";

function getGuruColor(slug: string): string {
  return GURU_COLORS[slug] || DEFAULT_COLOR;
}

// ── Optimal posting times (ET) ──────────────────────────────────────────

const OPTIMAL_TIMES: Record<string, string> = {
  tiktok:     "07:30 ET",   // morning commute scroll
  youtube:    "09:00 ET",   // market open
  instagram:  "08:15 ET",   // pre-market
  twitter:    "09:30 ET",   // market open
  linkedin:   "08:00 ET",   // professionals checking in
  newsletter: "07:00 ET",   // inbox before market
};

// ── Platform-specific hashtags ──────────────────────────────────────────

const PLATFORM_HASHTAGS: Record<string, string[]> = {
  tiktok:    ["#fintok", "#stocktok", "#investing101"],
  youtube:   ["#stockmarket", "#valueinvesting", "#financialeducation"],
  instagram: ["#investing", "#wealthbuilding", "#stockmarket"],
  twitter:   ["#stocks", "#investing", "#markets", "$SPY"],
  linkedin:  ["#finance", "#investmentstrategy", "#capitalmarkets"],
};

// ── Hook generator (with live price enrichment) ─────────────────────────

function generateTradeHook(
  guruName: string,
  ticker: string,
  action: string,
  livePrice: number | null,
  liveChangePct: number | null
): string {
  if (livePrice != null && liveChangePct != null) {
    const direction = liveChangePct >= 0 ? "📈" : "📉";
    const pctStr = Math.abs(liveChangePct).toFixed(1);
    if (action === "buy") {
      return `${guruName} bought ${ticker} — now at $${livePrice.toFixed(2)} ${direction}${pctStr}%. Worth following?`;
    } else {
      return `${guruName} sold ${ticker} — $${livePrice.toFixed(2)} ${direction}${pctStr}% since. Smart move?`;
    }
  }

  const buyHooks = [
    `🚨 ${guruName} just bought MORE ${ticker} — here's why 👇`,
    `${guruName} is betting BIG on ${ticker} right now`,
    `Why ${guruName} thinks ${ticker} is undervalued 📈`,
  ];
  const sellHooks = [
    `⚠️ ${guruName} is SELLING ${ticker} — what do they know?`,
    `${guruName} just cut their ${ticker} position. Red flag? 🚩`,
    `Why ${guruName} is getting out of ${ticker} right now`,
  ];

  const hooks = action === "buy" ? buyHooks : sellHooks;
  let hash = 0;
  const seed = `${guruName}:${ticker}:${action}`;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return hooks[Math.abs(hash) % hooks.length];
}

function formatPriceCallout(quote: Quote | undefined, action: string): string | null {
  if (!quote || quote.price == null) return null;
  const price = quote.price.toFixed(2);
  const pct = quote.changePercent != null
    ? (quote.changePercent >= 0 ? "+" : "") + quote.changePercent.toFixed(1) + "%"
    : null;
  const dir = quote.changePercent != null && quote.changePercent >= 0 ? "▲" : "▼";
  if (pct) return `$${price} ${dir}${pct}`;
  return `$${price}`;
}

// ── Content freshness ───────────────────────────────────────────────────

function getContentFreshness(trades: Array<{ filing_date: string }>): "realtime" | "delayed" {
  if (!trades.length) return "delayed";
  const now = new Date();
  const currentQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return trades.some((t) => new Date(t.filing_date) >= currentQuarterStart) ? "realtime" : "delayed";
}

// ── Daily content package ───────────────────────────────────────────────

export async function generateDailyContent(): Promise<VirloDailyPackage> {
  const today = new Date().toISOString().split("T")[0];
  const generatedAt = new Date().toISOString();

  if (!sql) {
    return {
      generated_at: generatedAt,
      api_version: "v1",
      date: today,
      content_freshness: "delayed",
      trades: [],
      scoreboard: [],
      video_scripts: [],
      suggested_schedule: [],
      market_summary: "Database unavailable. Check back later.",
      hashtag_bundle: { core: ["#investing", "#gurustock"], ticker_tags: [], guru_tags: [], platform_specific: {} },
    };
  }

  // ── 1. Fetch trades ──────────────────────────────────────────────────
  const rows = await sql`
    SELECT t.*, g.name as guru_name, g.slug as guru_slug
    FROM trades t
    JOIN gurus g ON t.guru_id = g.id
    WHERE g.is_active = true
    ORDER BY t.filing_date DESC, t.created_at DESC
    LIMIT 20
  `;

  const tickerList = [...new Set(rows.map((r: any) => r.ticker))];
  let liveQuotes: Map<string, Quote> = new Map();
  try {
    liveQuotes = await marketData.getQuotes(tickerList);
  } catch (err) {
    console.warn("[virlo-pipeline] Market data fetch failed:", err);
  }

  const trades: VirloEnrichedTrade[] = rows.map((t: any) => {
    const quote = liveQuotes.get(t.ticker);
    const livePrice = quote?.price ?? null;
    const liveChangePct = quote?.changePercent ?? null;
    const priceCallout = formatPriceCallout(quote, t.action);

    let rationale = generateRationale({
      ticker: t.ticker,
      company_name: t.company_name,
      action: t.action,
      guru_name: t.guru_name,
      guru_slug: t.guru_slug,
    });

    // Enrich rationale with live price context
    if (livePrice != null && t.price_estimate != null) {
      const estimatedPrice = Number(t.price_estimate);
      const pctFromEntry = estimatedPrice > 0
        ? (((livePrice - estimatedPrice) / estimatedPrice) * 100).toFixed(1)
        : null;
      if (pctFromEntry != null) {
        const direction = Number(pctFromEntry) >= 0 ? "up" : "down";
        rationale += ` ${t.guru_name} entered ${t.ticker} at ~$${estimatedPrice.toFixed(2)}; it's now ${direction} ${Math.abs(Number(pctFromEntry))}%.`;
      }
    }

    return {
      guru: t.guru_name,
      guru_slug: t.guru_slug,
      ticker: t.ticker,
      company_name: t.company_name,
      action: t.action,
      confidence: t.confidence,
      filing_date: t.filing_date,
      rationale,
      hook: generateTradeHook(t.guru_name, t.ticker, t.action, livePrice, liveChangePct),
      live_price: livePrice,
      live_change_pct: liveChangePct,
      price_callout: priceCallout,
    };
  });

  // ── 2. Scoreboard ────────────────────────────────────────────────────
  const scoreboard = await computeScoreboard();
  const scoreboardEntries: VirloScoreboardEntry[] = scoreboard.gurus.map((g, i) => ({
    name: g.name,
    slug: g.slug,
    win_rate: g.win_rate,
    total_trades: g.total_trades,
    rank: i + 1,
    color: getGuruColor(g.slug),
  }));

  // ── 3. Video scripts (top 2 gurus by activity) ───────────────────────
  const topGurus = scoreboard.gurus.slice(0, 2).map((g) => g.slug);
  const videoScripts: VirloVideoScript[] = [];

  for (const guruSlug of topGurus) {
    for (const format of ["tiktok", "youtube", "reel"] as const) {
      const script = await buildVideoScript(guruSlug, format, rows, liveQuotes);
      if (script) videoScripts.push(script);
    }
  }

  // ── 4. Suggested schedule ────────────────────────────────────────────
  const suggestedSchedule: VirloContentSlot[] = [
    {
      platform: "twitter",
      time: OPTIMAL_TIMES.twitter,
      content_type: "thread",
      script_id: "daily-brief",
      priority: "high",
    },
    {
      platform: "tiktok",
      time: OPTIMAL_TIMES.tiktok,
      content_type: "video",
      script_id: videoScripts.find((s) => s.format === "tiktok")?.guru_slug || "scoreboard",
      priority: "high",
    },
    {
      platform: "instagram",
      time: OPTIMAL_TIMES.instagram,
      content_type: "carousel",
      script_id: "scoreboard",
      priority: "medium",
    },
    {
      platform: "youtube",
      time: OPTIMAL_TIMES.youtube,
      content_type: "video",
      script_id: videoScripts.find((s) => s.format === "youtube")?.guru_slug || "scoreboard",
      priority: "high",
    },
    {
      platform: "linkedin",
      time: OPTIMAL_TIMES.linkedin,
      content_type: "article",
      script_id: "daily-brief",
      priority: "medium",
    },
    {
      platform: "newsletter",
      time: OPTIMAL_TIMES.newsletter,
      content_type: "article",
      script_id: "daily-brief",
      priority: "medium",
    },
  ];

  if (videoScripts.some((s) => s.format === "reel")) {
    suggestedSchedule.push({
      platform: "instagram",
      time: OPTIMAL_TIMES.instagram,
      content_type: "story",
      script_id: videoScripts.find((s) => s.format === "reel")!.guru_slug,
      priority: "medium",
    });
  }

  // ── 5. Market summary ────────────────────────────────────────────────
  const marketSummary = rows.length === 0
    ? "No new guru trades filed today. Markets steady with no significant insider moves."
    : `Today's filings show ${rows.length} notable trades across ${new Set(rows.map((r: any) => r.guru_id)).size} tracked gurus. Key tickers: ${[...new Set(rows.slice(0, 5).map((r: any) => r.ticker))].join(", ")}.`;

  // ── 6. Hashtags ─────────────────────────────────────────────────────
  const tickerTags = [...new Set(trades.map((t) => `#${t.ticker}`))].slice(0, 5);
  const guruTags = [...new Set(trades.map((t) => `#${t.guru_slug.replace(/-/g, "")}`))].slice(0, 3);

  const hashtagBundle: VirloHashtagBundle = {
    core: ["#investing", "#stocks", "#gurustock", "#stockmarket", "#13F"],
    ticker_tags: tickerTags,
    guru_tags: guruTags,
    platform_specific: PLATFORM_HASHTAGS,
  };

  return {
    generated_at: generatedAt,
    api_version: "v1",
    date: today,
    content_freshness: getContentFreshness(rows),
    trades,
    scoreboard: scoreboardEntries,
    video_scripts: videoScripts,
    suggested_schedule: suggestedSchedule,
    market_summary: marketSummary,
    hashtag_bundle: hashtagBundle,
  };
}

// ── Video script builder ────────────────────────────────────────────────

async function buildVideoScript(
  guruSlug: string,
  format: "tiktok" | "youtube" | "reel",
  allTrades: any[],
  liveQuotes: Map<string, Quote>
): Promise<VirloVideoScript | null> {
  const guruTrades = allTrades.filter((t: any) => t.guru_slug === guruSlug);
  if (!guruTrades.length) return null;

  const guru = guruTrades[0]; // representative row
  const brandColor = getGuruColor(guru.guru_slug);
  const durationMap: Record<string, number> = { tiktok: 30, reel: 30, youtube: 60 };
  const duration = durationMap[format];

  const hook = `${guru.guru_name} just made ${guruTrades.length} moves you NEED to see 👀`;

  const bodyPoints = guruTrades.map((t: any, i: number) => {
    const quote = liveQuotes.get(t.ticker);
    const livePrice = quote?.price;
    let rationale = generateRationale({
      ticker: t.ticker,
      company_name: t.company_name,
      action: t.action,
      guru_name: t.guru_name,
      guru_slug: t.guru_slug,
    });
    if (livePrice != null && t.price_estimate != null) {
      const estimatedPrice = Number(t.price_estimate);
      const pctDiff = estimatedPrice > 0 ? (((livePrice - estimatedPrice) / estimatedPrice) * 100).toFixed(1) : null;
      if (pctDiff) {
        const dir = Number(pctDiff) >= 0 ? "▲" : "▼";
        rationale += ` [Now $${livePrice.toFixed(2)} ${dir}${Math.abs(Number(pctDiff))}% from entry]`;
      }
    }
    const short = rationale.length > 120 ? rationale.slice(0, 117) + "..." : rationale;
    return `${i + 1}. ${t.action.toUpperCase()} ${t.ticker} — ${short}`;
  });

  if (format === "youtube") {
    bodyPoints.push(`Full position sizing breakdown and historical performance at GuruStock.com`);
  }

  const overlayData = guruTrades.map((t: any) => {
    const quote = liveQuotes.get(t.ticker);
    const callout = formatPriceCallout(quote, t.action);
    return {
      ticker: t.ticker,
      action: t.action,
      price_overlay: callout || `${t.action.toUpperCase()} ${t.ticker}`,
    };
  });

  const ctaMap: Record<string, string> = {
    tiktok: "Follow for daily guru trade alerts 🔔",
    reel: "Save this for later & follow for more 📌",
    youtube: "Like & subscribe for weekly deep dives 👍",
  };

  // Hashtags per format
  const formatHashtags: Record<string, string[]> = {
    tiktok: ["#fintok", "#stocktok", `#${guru.guru_slug.replace(/-/g, "")}`, "#investing"],
    youtube: ["#investing", "#stocks", "#gurustock", `#${guru.guru_slug.replace(/-/g, "")}`],
    reel: ["#investing", "#stockmarket", `#${guru.guru_slug.replace(/-/g, "")}`],
  };

  return {
    guru: guru.guru_name,
    guru_slug: guru.guru_slug,
    format,
    brand_color: brandColor,
    script: {
      hook,
      body_points: bodyPoints,
      overlay_data: overlayData,
      cta: ctaMap[format] || ctaMap.tiktok,
      estimated_duration_seconds: duration,
      optimal_posting_time: OPTIMAL_TIMES[format] || "09:00 ET",
      hashtags: formatHashtags[format],
    },
  };
}
