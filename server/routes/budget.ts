/**
 * Budget routes — GET /api/user/budget, PUT /api/user/budget
 * Both require authentication.
 */
import type { Request } from "bun";
import { sql } from "../db";
import { extractToken, getUserFromToken, type AuthUser } from "../lib/auth";

function requireAuth(req: Request): AuthUser | Response {
  const token = extractToken(req);
  if (!token) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const user = getUserFromToken(token);
  if (!user) return Response.json({ error: "Session expired" }, { status: 401 });
  return user;
}

export async function handleBudget(req: Request): Promise<Response> {
  if (!sql) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  const user = auth;

  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT budget::text, tier FROM users WHERE id = ${user.id}
      `;
      const row = rows[0];
      return Response.json({
        budget: parseFloat(row.budget),
        tier: row.tier,
      });
    } catch (err) {
      console.error("[budget] get error:", err);
      return Response.json({ error: "Failed to fetch budget" }, { status: 500 });
    }
  }

  if (req.method === "PUT") {
    try {
      const body = await req.json();
      const budget = parseFloat(body.budget);

      if (isNaN(budget) || budget < 0) {
        return Response.json({ error: "Invalid budget amount" }, { status: 400 });
      }

      await sql`UPDATE users SET budget = ${budget} WHERE id = ${user.id}`;

      // Update in-memory session
      const token = extractToken(req);
      if (token) {
        const sessionUser = getUserFromToken(token);
        if (sessionUser) {
          sessionUser.budget = budget;
        }
      }

      return Response.json({ budget });
    } catch (err) {
      console.error("[budget] put error:", err);
      return Response.json({ error: "Failed to update budget" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
