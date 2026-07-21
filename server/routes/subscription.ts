/**
 * Subscription routes — GET /api/subscription/status, POST /api/subscription/upgrade
 *
 * GET  /api/subscription/status  — returns current user's tier, features, and upgrade URL
 * POST /api/subscription/upgrade — simulates a Stripe webhook upgrade for development;
 *                                   in production, Stripe webhooks would call this endpoint.
 *
 * UPGRADE_URL is set by the lead after creating the Stripe product via platform tools.
 */
import type { Request } from "bun";
import { sql } from "../db";
import { extractToken, getUserFromToken, type AuthUser } from "../lib/auth";

// Placeholder — the lead creates the Stripe product and sets this.
// Format: Stripe Payment Link URL for the $9.99/mo Pro subscription.
const UPGRADE_URL =
  process.env.UPGRADE_URL || "https://buy.stripe.com/28E9AT7zOgqo5739Ey2Ry1a";

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

function requireAuth(req: Request): AuthUser | Response {
  const token = extractToken(req);
  if (!token) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const user = getUserFromToken(token);
  if (!user) return Response.json({ error: "Session expired" }, { status: 401 });
  return user;
}

export async function handleSubscription(req: Request): Promise<Response> {
  if (!sql) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/subscription", "");

  // GET /api/subscription/status
  if (req.method === "GET" && (path === "" || path === "/" || path === "/status")) {
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;
    const user = auth;

    try {
      // Refresh from DB to get latest tier
      const rows = await sql`
        SELECT tier FROM users WHERE id = ${user.id}
      `;
      const tier = rows[0]?.tier ?? "free";

      return Response.json({
        tier,
        features: getFeatures(tier),
        upgrade_url: tier === "free" ? UPGRADE_URL : null,
        price_monthly: tier === "free" ? "$9.99" : null,
      });
    } catch (err) {
      console.error("[subscription] status error:", err);
      return Response.json({ error: "Failed to fetch subscription status" }, { status: 500 });
    }
  }

  // POST /api/subscription/upgrade
  // Simulates a Stripe webhook. In production, this would validate the Stripe
  // signature and extract the customer from the webhook payload.
  if (req.method === "POST" && (path === "/upgrade" || path === "/")) {
    const auth = requireAuth(req);
    if (auth instanceof Response) return auth;
    const user = auth;

    try {
      // Update tier in database
      await sql`UPDATE users SET tier = 'pro' WHERE id = ${user.id}`;

      // Update in-memory session so the change takes effect immediately
      const token = extractToken(req);
      if (token) {
        const sessionUser = getUserFromToken(token);
        if (sessionUser) {
          sessionUser.tier = "pro";
        }
      }

      return Response.json({
        success: true,
        tier: "pro",
        features: PRO_FEATURES,
        message: "Upgraded to Pro! You now have access to all gurus and real-time alerts.",
      });
    } catch (err) {
      console.error("[subscription] upgrade error:", err);
      return Response.json({ error: "Upgrade failed" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
