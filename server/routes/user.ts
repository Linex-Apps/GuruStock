/**
 * User routes — GET /api/user/me
 * Returns authenticated user info with tier features.
 */
import type { Request } from "bun";
import { sql } from "../db";
import { extractToken, getUserFromToken, type AuthUser } from "../lib/auth";

const FREE_FEATURES = {
  gurus: ["warren-buffett"],
  all_gurus: false,
  real_time_alerts: false,
  delayed_alerts_days: 3,
  budget_aware_sizing: true,
  portfolio_mirroring: false,
  pro_badge: false,
};

const PRO_FEATURES = {
  gurus: "all",
  all_gurus: true,
  real_time_alerts: true,
  delayed_alerts_days: 0,
  budget_aware_sizing: true,
  portfolio_mirroring: true,
  pro_badge: true,
};

function getFeatures(tier: string) {
  return tier === "pro" ? PRO_FEATURES : FREE_FEATURES;
}

export async function handleUser(req: Request): Promise<Response> {
  if (!sql) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/user", "");

  // GET /api/user/me
  if (req.method === "GET" && path === "/me") {
    const token = extractToken(req);
    if (!token) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = getUserFromToken(token);
    if (!user) {
      return Response.json({ error: "Session expired" }, { status: 401 });
    }

    // Refresh tier from DB
    try {
      const rows = await sql`
        SELECT tier, budget::text FROM users WHERE id = ${user.id}
      `;
      const row = rows[0];
      const tier = row?.tier ?? "free";

      return Response.json({
        user: {
          id: user.id,
          email: user.email,
          tier,
          budget: parseFloat(row.budget),
        },
        features: getFeatures(tier),
      });
    } catch (err) {
      console.error("[user] me error:", err);
      return Response.json({ error: "Failed to fetch user" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
