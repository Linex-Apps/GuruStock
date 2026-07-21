/**
 * Auth routes — signup, login, logout, me
 */
import type { Request } from "bun";
import { sql } from "../db";
import {
  createSession,
  deleteSession,
  extractToken,
  getUserFromToken,
  getUserByEmail,
  hashPassword,
  verifyPassword,
} from "../lib/auth";

export async function handleAuth(req: Request): Promise<Response> {
  if (!sql) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/auth", "");

  // POST /api/auth/signup
  if (req.method === "POST" && path === "/signup") {
    try {
      const body = await req.json();
      const { email, password } = body;

      if (!email || !password) {
        return Response.json({ error: "Email and password required" }, { status: 400 });
      }
      if (password.length < 6) {
        return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }

      // Check for existing user
      const existing = await getUserByEmail(email);
      if (existing) {
        return Response.json({ error: "Email already registered" }, { status: 409 });
      }

      const passwordHash = await hashPassword(password);
      const rows = await sql`
        INSERT INTO users (email, password_hash, budget, tier)
        VALUES (${email}, ${passwordHash}, 0, 'free')
        RETURNING id, email, tier, budget::text
      `;
      const user = rows[0];

      const token = createSession({
        id: user.id,
        email: user.email,
        tier: user.tier,
        budget: parseFloat(user.budget),
      });

      return Response.json({
        token,
        user: { id: user.id, email: user.email, tier: user.tier, budget: parseFloat(user.budget) },
      });
    } catch (err) {
      console.error("[auth] signup error:", err);
      return Response.json({ error: "Signup failed" }, { status: 500 });
    }
  }

  // POST /api/auth/login
  if (req.method === "POST" && path === "/login") {
    try {
      const body = await req.json();
      const { email, password } = body;

      if (!email || !password) {
        return Response.json({ error: "Email and password required" }, { status: 400 });
      }

      const user = await getUserByEmail(email);
      if (!user) {
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return Response.json({ error: "Invalid email or password" }, { status: 401 });
      }

      const token = createSession({
        id: user.id,
        email: user.email,
        tier: user.tier,
        budget: parseFloat(user.budget),
      });

      return Response.json({
        token,
        user: { id: user.id, email: user.email, tier: user.tier, budget: parseFloat(user.budget) },
      });
    } catch (err) {
      console.error("[auth] login error:", err);
      return Response.json({ error: "Login failed" }, { status: 500 });
    }
  }

  // POST /api/auth/logout
  if (req.method === "POST" && path === "/logout") {
    const token = extractToken(req);
    if (token) deleteSession(token);
    return Response.json({ success: true });
  }

  // GET /api/auth/me
  if (req.method === "GET" && path === "/me") {
    const token = extractToken(req);
    if (!token) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = getUserFromToken(token);
    if (!user) {
      return Response.json({ error: "Session expired" }, { status: 401 });
    }

    // Build features object based on tier
    const features = user.tier === "pro"
      ? {
          all_gurus: true,
          real_time_alerts: true,
          delayed_alerts_days: 0,
          budget_aware_sizing: true,
          portfolio_mirroring: true,
          pro_badge: true,
        }
      : {
          all_gurus: false,
          real_time_alerts: false,
          delayed_alerts_days: 3,
          budget_aware_sizing: true,
          portfolio_mirroring: false,
          pro_badge: false,
        };

    return Response.json({ user, features });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
