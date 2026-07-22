/**
 * Portfolio routes
 *   GET    /api/portfolio             — user's holdings
 *   POST   /api/portfolio/holdings    — add/update a holding
 *   DELETE /api/portfolio/holdings/:ticker — remove a holding
 *   GET    /api/portfolio/drift       — Pro only: drift alerts vs guru allocations
 */
import type { Request } from "bun";
import { sql } from "../db";
import { extractToken, getUserFromToken } from "../lib/auth";
import { computeDrift } from "../lib/portfolio";

function requireAuth(req: Request) {
  const token = extractToken(req);
  if (!token) return { user: null, response: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const user = getUserFromToken(token);
  if (!user) return { user: null, response: Response.json({ error: "Session expired" }, { status: 401 }) };
  return { user, response: null };
}

function requirePro(user: { tier: string }) {
  if (user.tier !== "pro") {
    return Response.json({ error: "Pro tier required for this feature" }, { status: 403 });
  }
  return null;
}

export async function handlePortfolio(req: Request): Promise<Response> {
  if (!sql) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/portfolio", "");

  // GET /api/portfolio — user's holdings
  if (req.method === "GET" && (path === "" || path === "/")) {
    const { user, response } = requireAuth(req);
    if (response) return response;
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    try {
      const rows = await sql`
        SELECT ticker, shares::text, avg_cost::text, created_at, updated_at
        FROM user_holdings
        WHERE user_id = ${user.id}
        ORDER BY ticker
      `;

      const holdings = rows.map((r: Record<string, unknown>) => {
        const shares = Number(r.shares ?? 0);
        const avgCost = Number(r.avg_cost ?? 0);
        const currentValue = shares * avgCost;
        return {
          ticker: String(r.ticker),
          shares,
          avg_cost: avgCost,
          current_value: currentValue,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      });

      // Calculate allocation percentages
      const totalValue = holdings.reduce((sum: number, h: { current_value: number }) => sum + h.current_value, 0);
      const enriched = holdings.map((h: { current_value: number; allocation_pct?: number; [key: string]: unknown }) => ({
        ...h,
        allocation_pct: totalValue > 0 ? Math.round((h.current_value / totalValue) * 10000) / 100 : 0,
      }));

      return Response.json({ holdings: enriched, total_value: totalValue });
    } catch (err) {
      console.error("[portfolio] get holdings error:", err);
      return Response.json({ error: "Failed to fetch holdings" }, { status: 500 });
    }
  }

  // GET /api/portfolio/drift — Pro only: drift alerts
  if (req.method === "GET" && path === "/drift") {
    const { user, response } = requireAuth(req);
    if (response) return response;
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const proError = requirePro(user);
    if (proError) return proError;

    try {
      const alerts = await computeDrift(user.id);
      return Response.json({ alerts });
    } catch (err) {
      console.error("[portfolio] drift error:", err);
      return Response.json({ error: "Failed to compute drift alerts" }, { status: 500 });
    }
  }

  // POST /api/portfolio/holdings — add/update a holding
  if (req.method === "POST" && path === "/holdings") {
    const { user, response } = requireAuth(req);
    if (response) return response;
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    try {
      const body = await req.json();
      const { ticker, shares, avg_cost } = body;

      if (!ticker || shares === undefined || avg_cost === undefined) {
        return Response.json({ error: "ticker, shares, and avg_cost are required" }, { status: 400 });
      }

      const tickerUpper = String(ticker).toUpperCase();
      const sharesNum = Number(shares);
      const costNum = Number(avg_cost);

      if (isNaN(sharesNum) || isNaN(costNum)) {
        return Response.json({ error: "shares and avg_cost must be numbers" }, { status: 400 });
      }

      // Upsert
      const rows = await sql`
        INSERT INTO user_holdings (user_id, ticker, shares, avg_cost, updated_at)
        VALUES (${user.id}, ${tickerUpper}, ${sharesNum}, ${costNum}, NOW())
        ON CONFLICT (user_id, ticker)
        DO UPDATE SET shares = EXCLUDED.shares, avg_cost = EXCLUDED.avg_cost, updated_at = NOW()
        RETURNING ticker, shares::text, avg_cost::text, created_at, updated_at
      `;

      const h = rows[0] as Record<string, unknown>;
      return Response.json({
        holding: {
          ticker: String(h.ticker),
          shares: Number(h.shares ?? 0),
          avg_cost: Number(h.avg_cost ?? 0),
          current_value: Number(h.shares ?? 0) * Number(h.avg_cost ?? 0),
          created_at: h.created_at,
          updated_at: h.updated_at,
        },
      });
    } catch (err) {
      console.error("[portfolio] add holding error:", err);
      return Response.json({ error: "Failed to add holding" }, { status: 500 });
    }
  }

  // DELETE /api/portfolio/holdings/:ticker — remove a holding
  if (req.method === "DELETE" && path.startsWith("/holdings/")) {
    const { user, response } = requireAuth(req);
    if (response) return response;
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const ticker = path.replace("/holdings/", "").toUpperCase();
    if (!ticker) {
      return Response.json({ error: "Ticker required" }, { status: 400 });
    }

    try {
      await sql`
        DELETE FROM user_holdings
        WHERE user_id = ${user.id} AND ticker = ${ticker}
      `;
      return Response.json({ success: true, ticker });
    } catch (err) {
      console.error("[portfolio] delete holding error:", err);
      return Response.json({ error: "Failed to delete holding" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
