import type { Request } from "bun";
import { sql } from "../db";

export async function handleGurus(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/gurus", "");

  if (req.method === "GET" && path === "" && sql) {
    try {
      const gurus = await sql`SELECT * FROM gurus WHERE is_active = true ORDER BY name`;
      return Response.json(gurus);
    } catch (err) {
      return Response.json({ error: "Failed to fetch gurus" }, { status: 500 });
    }
  }

  // GET /api/gurus/:slug — single guru with recent trades
  if (req.method === "GET" && path.startsWith("/") && sql) {
    const slug = path.slice(1);
    try {
      const [guru] = await sql`SELECT * FROM gurus WHERE slug = ${slug}`;
      if (!guru) return Response.json({ error: "Guru not found" }, { status: 404 });

      const trades = await sql`
        SELECT * FROM trades WHERE guru_id = ${guru.id}
        ORDER BY filing_date DESC LIMIT 20
      `;

      return Response.json({ ...guru, trades });
    } catch (err) {
      return Response.json({ error: "Failed to fetch guru" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
