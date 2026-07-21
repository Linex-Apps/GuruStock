/**
 * Admin API — POST /api/admin/ingest
 *
 * Triggers trade ingestion for all gurus.
 * No auth for MVP — this is an internal/dev endpoint.
 */
import type { Request } from "bun";
import { ingestAllGurus, ingestGuruTrades } from "../lib/ingest";

export async function handleAdmin(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/admin", "");

  // POST /api/admin/ingest — trigger full ingestion
  if (req.method === "POST" && path === "/ingest") {
    try {
      const results = await ingestAllGurus();
      return Response.json({
        success: true,
        message: "Ingestion complete",
        results,
      });
    } catch (err) {
      console.error("[admin] Ingestion failed:", err);
      return Response.json(
        { error: "Ingestion failed", details: String(err) },
        { status: 500 }
      );
    }
  }

  // POST /api/admin/ingest/:slug — trigger ingestion for a single guru
  if (req.method === "POST" && path.startsWith("/ingest/")) {
    const slug = path.slice("/ingest/".length);
    try {
      const result = await ingestGuruTrades(slug);
      return Response.json({ success: true, result });
    } catch (err) {
      console.error(`[admin] Ingestion failed for ${slug}:`, err);
      return Response.json(
        { error: `Ingestion failed for ${slug}`, details: String(err) },
        { status: 500 }
      );
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
