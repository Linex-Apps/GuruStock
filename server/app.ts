import { runMigrations, sql } from "./db";
import { handleAuth } from "./routes/auth";
import { handleGurus } from "./routes/gurus";
import { handleAlerts } from "./routes/alerts";
import { handlePortfolio } from "./routes/portfolio";
import { handleBudget } from "./routes/budget";
import { handleTrades } from "./routes/trades";
import { handleAdmin } from "./routes/admin";
import { handleSubscription } from "./routes/subscription";
import { handleUser } from "./routes/user";
import { handleScoreboard } from "./routes/scoreboard";
import { handleApiV1 } from "./api/v1/index";
import { ingestAllGurus } from "./lib/ingest";
import { backfill } from "./scripts/backfill";

// CORS headers for development
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function corsResponse(body?: BodyInit, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: { ...corsHeaders(), ...init?.headers },
  });
}

export async function handleApiRequest(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse(null, { status: 204 });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Health check
  if (path === "/api/health") {
    return corsResponse(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Route to handlers
  try {
    // API v1 — platform API (separate from consumer routes)
    if (path.startsWith("/api/v1/")) {
      const inner = await handleApiV1(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path.startsWith("/api/auth")) {
      const inner = await handleAuth(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/admin")) {
      const inner = await handleAdmin(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/gurus")) {
      const inner = await handleGurus(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/trades")) {
      const inner = await handleTrades(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/alerts")) {
      const inner = await handleAlerts(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/portfolio")) {
      const inner = await handlePortfolio(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/scoreboard")) {
      const inner = await handleScoreboard(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/subscription")) {
      const inner = await handleSubscription(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/user/budget")) {
      const inner = await handleBudget(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.startsWith("/api/user")) {
      const inner = await handleUser(req);
      return corsResponse(await inner.text(), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Route error:", err);
    return corsResponse(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return corsResponse(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

// Run migrations, seed, and initial trade ingestion on module load
export async function initialize() {
  await runMigrations();
  await seedGurus();

  // Backfill: delete placeholder trades and re-ingest with real 13F data
  try {
    console.log("[init] Running backfill — clearing placeholder trades and ingesting real 13F data...");
    await backfill();
    console.log("[init] Backfill complete");
  } catch (err) {
    console.error("[init] Backfill failed:", err);
    // Fall back to regular ingestion if backfill fails
    try {
      console.log("[init] Falling back to regular ingestion...");
      await ingestAllGurus();
    } catch (err2) {
      console.error("[init] Fallback ingestion also failed:", err2);
    }
  }

  // Periodic re-check every 6 hours for new filings
  startPeriodicCheck();
}

function startPeriodicCheck() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  setInterval(() => {
    console.log("[scheduler] Checking for new filings...");
    ingestAllGurus().catch((err) =>
      console.error("[scheduler] Periodic ingestion error:", err)
    );
  }, SIX_HOURS);
}

async function seedGurus() {
  if (!sql) return;
  try {
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM gurus`;
    if (Number(count) === 0) {
      await sql`
        INSERT INTO gurus (name, slug, description, is_active) VALUES
        ('Warren Buffett', 'warren-buffett', 'CEO of Berkshire Hathaway. Legendary value investor known for long-term holdings in quality companies.', true),
        ('Ray Dalio', 'ray-dalio', 'Founder of Bridgewater Associates, the world''s largest hedge fund. Pioneer of the "All Weather" portfolio strategy.', true),
        ('Cathie Wood', 'cathie-wood', 'Founder and CEO of ARK Invest. Focuses on disruptive innovation — AI, genomics, fintech, and space.', true),
        ('Bill Ackman', 'bill-ackman', 'Founder and CEO of Pershing Square Capital Management. Activist investor taking concentrated positions.', true)
      `;
      console.log("Seed data inserted: 4 gurus");
    }
  } catch (err) {
    console.error("Seed failed:", err);
  }
}
