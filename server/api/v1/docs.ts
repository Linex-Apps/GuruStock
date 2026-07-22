/**
 * API Documentation v1 — root info and OpenAPI 3.0 spec.
 *
 * GET /api/v1/      → API version info, endpoints, rate limits
 * GET /api/v1/docs  → OpenAPI 3.0 JSON spec
 */

import { extractV1Auth, checkRateLimit, v1Response, v1RateLimited } from "./_utils";

const API_VERSION = "1.0.0";
const BASE_URL = "https://gurustock.com/api/v1";

interface EndpointInfo {
  method: string;
  path: string;
  description: string;
  auth: string;
  rate_limit_tier: string;
}

const ENDPOINTS: EndpointInfo[] = [
  // Content Engine
  { method: "GET", path: "/content/daily-brief", description: "Today's top trades with AI rationales and hooks", auth: "optional", rate_limit_tier: "free" },
  { method: "GET", path: "/content/video-script", description: "Structured video script for content production", auth: "optional", rate_limit_tier: "free" },
  { method: "GET", path: "/content/weekly-roundup", description: "Week's notable trades, scoreboard changes, consensus", auth: "optional", rate_limit_tier: "free" },
  { method: "GET", path: "/content/infographic-data", description: "Structured data for infographic generation", auth: "optional", rate_limit_tier: "free" },
  // Analytics
  { method: "GET", path: "/analytics/scoreboard", description: "All-guru rankings with win rates and returns", auth: "optional", rate_limit_tier: "free" },
  { method: "GET", path: "/analytics/consensus", description: "Trades where 2+ gurus agree on same ticker/direction", auth: "optional", rate_limit_tier: "free" },
  { method: "GET", path: "/analytics/trending", description: "Most active tickers across all tracked gurus", auth: "optional", rate_limit_tier: "free" },
  // Market Data
  { method: "GET", path: "/market/quotes", description: "Live price data from Yahoo Finance with 5-min cache and trade_estimate fallback", auth: "optional", rate_limit_tier: "free" },
  { method: "GET", path: "/market/sectors", description: "Sector/activity breakdown from guru trade data", auth: "optional", rate_limit_tier: "free" },
  // Docs
  { method: "GET", path: "/", description: "API version info, available endpoints, and rate limits", auth: "none", rate_limit_tier: "unlimited" },
  { method: "GET", path: "/docs", description: "OpenAPI 3.0 JSON specification", auth: "none", rate_limit_tier: "unlimited" },
];

const RATE_LIMITS = {
  free: "60 requests/minute",
  pro: "300 requests/minute",
  enterprise: "1000 requests/minute",
};

export async function handleDocsV1(req: Request): Promise<Response> {
  const auth = extractV1Auth(req);
  // Docs endpoints are exempt from rate limiting
  if (req.url.includes("/api/v1/docs")) {
    // skip rate limit
  } else if (!checkRateLimit(auth, req)) {
    return v1RateLimited();
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1", "");

  // GET /api/v1/
  if (req.method === "GET" && (path === "/" || path === "")) {
    return v1Response({
      api: "GuruStock Financial Intelligence API",
      version: API_VERSION,
      description: "Structured financial intelligence from SEC filings — trade alerts, guru performance, content feeds, and market data.",
      base_url: BASE_URL,
      rate_limits: RATE_LIMITS,
      authentication: {
        methods: ["X-API-Key header", "?api_key query parameter", "Bearer token (session)"],
        note: "Unauthenticated requests are limited to free tier (60 req/min). Use an API key or session token for higher limits.",
      },
      endpoints: ENDPOINTS,
      contact: {
        docs: `${BASE_URL}/docs`,
      },
    });
  }

  // GET /api/v1/docs — OpenAPI 3.0 spec
  if (req.method === "GET" && (path === "/docs" || path === "/docs/")) {
    return v1Response(generateOpenApiSpec());
  }

  return v1Response({ error: "Not found" }, 404);
}

function generateOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "GuruStock Financial Intelligence API",
      version: API_VERSION,
      description:
        "GuruStock transforms raw SEC filings into structured financial intelligence — trade alerts, guru performance rankings, AI rationales, and content-ready data feeds. This API powers the GuruStock consumer app, the Virlo content pipeline, DealBridge articles, and future enterprise integrations.",
      contact: {
        name: "GuruStock API Support",
      },
      license: {
        name: "Proprietary",
      },
    },
    servers: [
      { url: BASE_URL, description: "Production" },
    ],
    security: [
      { ApiKeyAuth: [] },
      { BearerAuth: [] },
    ],
    paths: {
      "/content/daily-brief": {
        get: {
          summary: "Daily brief with top trades",
          description: "Returns today's top trades with AI-generated rationales, suggested hooks, and market summary optimized for content production.",
          operationId: "getDailyBrief",
          parameters: [],
          responses: {
            "200": {
              description: "Daily brief with top trades",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DailyBrief" },
                },
              },
            },
          },
        },
      },
      "/content/video-script": {
        get: {
          summary: "Video script generator",
          description: "Returns a structured video script with hook, body points, overlay data, and CTA optimized for the requested format.",
          operationId: "getVideoScript",
          parameters: [
            { name: "guru", in: "query", schema: { type: "string" }, description: "Guru slug (e.g. warren-buffett)" },
            { name: "format", in: "query", schema: { type: "string", enum: ["tiktok", "youtube", "reel"] }, description: "Video format" },
          ],
          responses: {
            "200": {
              description: "Structured video script",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/VideoScript" },
                },
              },
            },
          },
        },
      },
      "/content/weekly-roundup": {
        get: {
          summary: "Weekly trade roundup",
          description: "Returns notable trades, scoreboard changes, and consensus picks for the specified period.",
          operationId: "getWeeklyRoundup",
          parameters: [
            { name: "days", in: "query", schema: { type: "integer", default: 7 }, description: "Number of days to look back" },
          ],
          responses: {
            "200": {
              description: "Weekly roundup data",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WeeklyRoundup" },
                },
              },
            },
          },
        },
      },
      "/content/infographic-data": {
        get: {
          summary: "Infographic data",
          description: "Returns structured data for infographic generation.",
          operationId: "getInfographicData",
          parameters: [
            { name: "type", in: "query", schema: { type: "string", enum: ["scoreboard", "portfolio", "sectors"] }, description: "Infographic type" },
          ],
          responses: {
            "200": {
              description: "Infographic-ready data",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/InfographicData" },
                },
              },
            },
          },
        },
      },
      "/analytics/scoreboard": {
        get: {
          summary: "Guru performance scoreboard",
          description: "Returns all-guru rankings with win rates, average returns, and trade counts.",
          operationId: "getScoreboard",
          responses: {
            "200": {
              description: "Scoreboard rankings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Scoreboard" },
                },
              },
            },
          },
        },
      },
      "/analytics/consensus": {
        get: {
          summary: "Consensus picks",
          description: "Returns trades where 2+ gurus agree on the same ticker and direction.",
          operationId: "getConsensus",
          responses: {
            "200": {
              description: "Consensus picks with signal strength",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Consensus" },
                },
              },
            },
          },
        },
      },
      "/analytics/trending": {
        get: {
          summary: "Trending tickers",
          description: "Returns the most active tickers across all tracked gurus with sentiment analysis.",
          operationId: "getTrending",
          responses: {
            "200": {
              description: "Trending tickers with sentiment",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Trending" },
                },
              },
            },
          },
        },
      },
      "/market/quotes": {
        get: {
          summary: "Live quote data",
          description: "Returns live price data from Yahoo Finance for requested tickers, with 5-minute caching and graceful fallback to trade price_estimate. live: true indicates real-time Yahoo data.",
          operationId: "getQuotes",
          parameters: [
            { name: "tickers", in: "query", required: true, schema: { type: "string" }, description: "Comma-separated tickers (e.g. AAPL,TSLA)" },
          ],
          responses: {
            "200": {
              description: "Live quote data with fallback support",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Quotes" },
                },
              },
            },
          },
        },
      },
      "/market/sectors": {
        get: {
          summary: "Sector activity",
          description: "Returns sector/activity breakdown derived from guru trade data.",
          operationId: "getSectors",
          responses: {
            "200": {
              description: "Sector activity data",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Sectors" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key for authenticated access. Also accepted as ?api_key query parameter.",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "GuruStock session token from login.",
        },
      },
      schemas: {
        DailyBrief: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            top_trades: { type: "array", items: { $ref: "#/components/schemas/ContentTrade" } },
            market_summary: { type: "string" },
            suggested_hashtags: { type: "array", items: { type: "string" } },
          },
        },
        ContentTrade: {
          type: "object",
          properties: {
            guru: { type: "string" },
            guru_slug: { type: "string" },
            ticker: { type: "string" },
            company_name: { type: "string" },
            action: { type: "string", enum: ["buy", "sell"] },
            rationale: { type: "string" },
            suggested_hook: { type: "string" },
            confidence: { type: "string" },
          },
        },
        VideoScript: {
          type: "object",
          properties: {
            guru: { type: "string" },
            guru_slug: { type: "string" },
            format: { type: "string" },
            script: {
              type: "object",
              properties: {
                hook: { type: "string" },
                body_points: { type: "array", items: { type: "string" } },
                overlay_data: { type: "array", items: { $ref: "#/components/schemas/OverlayData" } },
                cta: { type: "string" },
                estimated_duration_seconds: { type: "integer" },
              },
            },
          },
        },
        OverlayData: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            action: { type: "string" },
            change: { type: "string" },
          },
        },
        WeeklyRoundup: {
          type: "object",
          properties: {
            period: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
            notable_trades: { type: "array" },
            scoreboard_changes: { type: "array" },
            consensus_picks: { type: "array" },
          },
        },
        InfographicData: {
          type: "object",
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            data: { type: "array" },
          },
        },
        Scoreboard: {
          type: "object",
          properties: {
            gurus: { type: "array", items: { $ref: "#/components/schemas/GuruScore" } },
            meta: { type: "object" },
          },
        },
        GuruScore: {
          type: "object",
          properties: {
            guru_id: { type: "integer" },
            name: { type: "string" },
            slug: { type: "string" },
            total_trades: { type: "integer" },
            wins: { type: "integer" },
            win_rate: { type: "number" },
            avg_return_pct: { type: "number" },
            best_trade: { type: "object" },
            worst_trade: { type: "object" },
          },
        },
        Consensus: {
          type: "object",
          properties: {
            consensus_picks: { type: "array", items: { $ref: "#/components/schemas/ConsensusPick" } },
            meta: { type: "object" },
          },
        },
        ConsensusPick: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            direction: { type: "string" },
            guru_count: { type: "integer" },
            gurus: { type: "array", items: { type: "string" } },
            signal_strength: { type: "string", enum: ["moderate", "strong"] },
          },
        },
        Trending: {
          type: "object",
          properties: {
            trending: { type: "array", items: { $ref: "#/components/schemas/TrendingItem" } },
            meta: { type: "object" },
          },
        },
        TrendingItem: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            company_name: { type: "string" },
            guru_count: { type: "integer" },
            sentiment: { type: "string" },
            sentiment_score: { type: "integer" },
          },
        },
        Quotes: {
          type: "object",
          properties: {
            live: { type: "boolean", description: "Whether all quotes are from Yahoo Finance (live:true) or fallback (live:false)" },
            message: { type: "string" },
            quotes: { type: "array", items: { $ref: "#/components/schemas/Quote" } },
            errors: { type: "array", items: { type: "object", properties: { ticker: { type: "string" }, error: { type: "string" } } } },
            meta: {
              type: "object",
              properties: {
                provider: { type: "string" },
                cache_stats: { type: "object", properties: { size: { type: "integer" }, ttlMs: { type: "integer" }, staleTtlMs: { type: "integer" } } },
              },
            },
          },
        },
        Quote: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            price: { type: "number", nullable: true },
            price_date: { type: "string", nullable: true },
            source: { type: "string", enum: ["yahoo", "cache", "fallback", "unavailable"] },
            dayChange: { type: "number", nullable: true },
            dayChangePercent: { type: "number", nullable: true },
            volume: { type: "number", nullable: true },
            previousClose: { type: "number", nullable: true },
            marketCap: { type: "number", nullable: true },
            fiftyTwoWeekHigh: { type: "number", nullable: true },
            fiftyTwoWeekLow: { type: "number", nullable: true },
          },
        },
        Sectors: {
          type: "object",
          properties: {
            live: { type: "boolean" },
            sectors: { type: "array" },
            meta: { type: "object" },
          },
        },
      },
    },
  };
}
