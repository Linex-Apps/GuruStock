/**
 * Alerts routes — GET /api/alerts
 * Returns recent trades with position sizing recommendation.
 * Free tier: only trades from default guru (warren-buffett), delayed 3 days.
 * Pro tier: all gurus, real-time.
 *
 * Query params:
 *   guru   — filter by guru slug
 *   limit  — max results (default 20, max 100)
 *   sort   — "date" (default: filing_date DESC) or "-date" (same)
 */
import type { Request } from "bun";
import { sql } from "../db";
import { extractToken, getUserFromToken, type AuthUser } from "../lib/auth";

const DEFAULT_FREE_GURU = "warren-buffett";
const MAX_POSITION_PCT = 0.05; // 5% of budget per position
const FREE_TIER_DELAY_DAYS = 3;

function calculateAffordableShares(budget: number, priceEstimate: number): number {
  if (!budget || !priceEstimate || priceEstimate <= 0) return 0;
  const maxDollars = budget * MAX_POSITION_PCT;
  return Math.floor((maxDollars / priceEstimate) * 100) / 100; // fractional-share precision
}

function optionalAuth(req: Request): { user: AuthUser | null; tier: string } {
  const token = extractToken(req);
  if (!token) return { user: null, tier: "free" };
  const user = getUserFromToken(token);
  if (!user) return { user: null, tier: "free" };
  return { user, tier: user.tier };
}

export async function handleAlerts(req: Request): Promise<Response> {
  if (!sql) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/alerts", "");

  // GET /api/alerts
  if (req.method === "GET" && (path === "" || path === "/")) {
    const { user, tier } = optionalAuth(req);
    const guruFilter = url.searchParams.get("guru");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    try {
      let trades;

      if (guruFilter) {
        // Filter by specific guru slug — no tier restrictions when explicitly filtering
        if (tier === "free") {
          // Free tier: delayed + specific guru
          trades = await sql`
            SELECT t.*, g.name as guru_name, g.slug as guru_slug
            FROM trades t
            JOIN gurus g ON t.guru_id = g.id
            WHERE g.slug = ${guruFilter}
              AND t.filing_date < (NOW() - INTERVAL '3 days')
            ORDER BY t.filing_date DESC, t.created_at DESC
            LIMIT ${limit}
          `;
        } else {
          trades = await sql`
            SELECT t.*, g.name as guru_name, g.slug as guru_slug
            FROM trades t
            JOIN gurus g ON t.guru_id = g.id
            WHERE g.slug = ${guruFilter}
            ORDER BY t.filing_date DESC, t.created_at DESC
            LIMIT ${limit}
          `;
        }
      } else if (tier === "pro") {
        // Pro tier: all gurus, real-time
        trades = await sql`
          SELECT t.*, g.name as guru_name, g.slug as guru_slug
          FROM trades t
          JOIN gurus g ON t.guru_id = g.id
          ORDER BY t.filing_date DESC, t.created_at DESC
          LIMIT ${limit}
        `;
      } else {
        // Free tier: default guru only, delayed
        trades = await sql`
          SELECT t.*, g.name as guru_name, g.slug as guru_slug
          FROM trades t
          JOIN gurus g ON t.guru_id = g.id
          WHERE g.slug = ${DEFAULT_FREE_GURU}
            AND t.filing_date < (NOW() - INTERVAL '3 days')
          ORDER BY t.filing_date DESC, t.created_at DESC
          LIMIT ${limit}
        `;
      }

      // Add position sizing recommendation
      const budget = user?.budget ?? 0;
      const enriched = trades.map((t: Record<string, unknown>) => ({
        ...t,
        affordable_shares: calculateAffordableShares(
          budget,
          parseFloat(String(t.price_estimate ?? "0"))
        ),
        user_budget: budget,
      }));

      return Response.json({
        alerts: enriched,
        tier,
        budget,
        default_guru: tier === "free" ? DEFAULT_FREE_GURU : null,
        delayed: tier === "free",
        delay_days: tier === "free" ? FREE_TIER_DELAY_DAYS : 0,
      });
    } catch (err) {
      console.error("[alerts] query error:", err);
      return Response.json({ error: "Failed to fetch alerts" }, { status: 500 });
    }
  }

  // POST /api/alerts/:id/seen
  if (req.method === "POST" && path.endsWith("/seen")) {
    const alertId = path.replace("/", "").replace("/seen", "");
    if (!alertId) return Response.json({ error: "Alert ID required" }, { status: 400 });

    const token = extractToken(req);
    if (!token) return Response.json({ error: "Not authenticated" }, { status: 401 });
    const authUser = getUserFromToken(token);
    if (!authUser) return Response.json({ error: "Session expired" }, { status: 401 });

    try {
      await sql`
        INSERT INTO user_alerts (user_id, trade_id, seen_at)
        VALUES (${authUser.id}, ${parseInt(alertId)}, NOW())
        ON CONFLICT DO NOTHING
      `;
      return Response.json({ success: true });
    } catch (err) {
      console.error("[alerts] mark seen error:", err);
      return Response.json({ error: "Failed to mark alert" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
