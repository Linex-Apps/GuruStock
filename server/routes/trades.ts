/**
 * Trades API — GET /api/trades?guru=slug&limit=20
 *
 * Returns recent trades, optionally filtered by guru slug.
 */
import type { Request } from "bun";
import { sql } from "../db";

export async function handleTrades(req: Request): Promise<Response> {
  if (!sql) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const url = new URL(req.url);
  const guruSlug = url.searchParams.get("guru");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

  try {
    if (guruSlug) {
      // Filtered by guru
      const trades = await sql`
        SELECT t.*, g.name as guru_name, g.slug as guru_slug
        FROM trades t
        JOIN gurus g ON t.guru_id = g.id
        WHERE g.slug = ${guruSlug}
        ORDER BY t.filing_date DESC, t.created_at DESC
        LIMIT ${limit}
      `;
      return Response.json(trades);
    }

    // All trades
    const trades = await sql`
      SELECT t.*, g.name as guru_name, g.slug as guru_slug
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      ORDER BY t.filing_date DESC, t.created_at DESC
      LIMIT ${limit}
    `;
    return Response.json(trades);
  } catch (err) {
    console.error("[trades] Query error:", err);
    return Response.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}
