/**
 * API v1 Router — dispatches to content, analytics, market, and docs handlers.
 *
 * Mounted at /api/v1/ in server/app.ts.
 */

import { handleContentV1 } from "./content";
import { handleAnalyticsV1 } from "./analytics";
import { handleMarketV1 } from "./market";
import { handleDocsV1 } from "./docs";
import { handleWidgetsV1 } from "./widgets";
import { v1Error } from "./_utils";

export async function handleApiV1(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Strip /api/v1 prefix — route to appropriate handler
  const subPath = path.replace("/api/v1", "");

  // Content engine endpoints (highest priority)
  if (subPath.startsWith("/content")) {
    return handleContentV1(req);
  }

  // Analytics endpoints
  if (subPath.startsWith("/analytics")) {
    return handleAnalyticsV1(req);
  }

  // Market data endpoints
  if (subPath.startsWith("/market")) {
    return handleMarketV1(req);
  }

  // Widget endpoints
  if (subPath.startsWith("/widgets")) {
    return handleWidgetsV1(req);
  }

  // Root and docs
  if (subPath === "/" || subPath === "" || subPath.startsWith("/docs")) {
    return handleDocsV1(req);
  }

  return v1Error("Not found", 404);
}
