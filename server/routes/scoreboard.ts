/**
 * Scoreboard API — Pro-only endpoints for guru performance data.
 *
 * GET /api/scoreboard       → summary for all gurus (pro only)
 * GET /api/scoreboard/:slug → detailed breakdown for single guru (pro only)
 */
import type { Request } from "bun";
import { extractToken, getUserFromToken } from "../lib/auth";
import { computeScoreboard, computeGuruDetail } from "../lib/scoreboard";

function requirePro(req: Request): Response | null {
  const token = extractToken(req);
  if (!token) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  const user = getUserFromToken(token);
  if (!user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }
  if (user.tier !== "pro") {
    return Response.json(
      { error: "Upgrade to Pro to view guru performance" },
      { status: 403 }
    );
  }
  return null; // authorized
}

export async function handleScoreboard(req: Request): Promise<Response> {
  const authError = requirePro(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const path = url.pathname.replace("/api/scoreboard", "");

  // GET /api/scoreboard — all gurus summary
  if (req.method === "GET" && (path === "" || path === "/")) {
    try {
      const data = await computeScoreboard();
      return Response.json(data);
    } catch (err) {
      console.error("[scoreboard] Error:", err);
      return Response.json({ error: "Failed to compute scoreboard" }, { status: 500 });
    }
  }

  // GET /api/scoreboard/:slug — single guru detail
  if (req.method === "GET" && path.startsWith("/")) {
    const slug = path.slice(1);
    try {
      const data = await computeGuruDetail(slug);
      if (!data) {
        return Response.json({ error: "Guru not found" }, { status: 404 });
      }
      return Response.json(data);
    } catch (err) {
      console.error("[scoreboard] Error:", err);
      return Response.json({ error: "Failed to compute guru details" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
