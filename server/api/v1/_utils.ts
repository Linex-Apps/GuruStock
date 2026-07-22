/**
 * Shared utilities for API v1 endpoints.
 *
 * - Bearer / API key auth extraction
 * - Rate limiting (in-memory, per key/IP)
 * - Response helpers
 */

import { getUserFromToken } from "../../lib/auth";

// ── API key store (in-memory MVP) ──────────────────────────────────────

interface ApiKeyRecord {
  tier: "free" | "pro" | "enterprise";
  owner: string;
  created_at: string;
}

const apiKeys = new Map<string, ApiKeyRecord>();

/** Register an API key (for future admin UI) */
export function registerApiKey(key: string, tier: ApiKeyRecord["tier"], owner: string): void {
  apiKeys.set(key, { tier, owner, created_at: new Date().toISOString() });
}

// Seed a demo enterprise key
registerApiKey("gurustock-demo-enterprise", "enterprise", "demo");

// ── Auth extraction ─────────────────────────────────────────────────────

export interface V1AuthContext {
  tier: "free" | "pro" | "enterprise";
  userId?: number;
  source: "bearer" | "api_key" | "none";
}

/**
 * Extract auth context from a request.
 * Priority: X-API-Key header > ?api_key query param > Bearer token > none (free)
 */
export function extractV1Auth(req: Request): V1AuthContext {
  // 1. X-API-Key header
  const headerKey = req.headers.get("X-API-Key");
  if (headerKey) {
    const record = apiKeys.get(headerKey);
    if (record) return { tier: record.tier, source: "api_key" };
  }

  // 2. ?api_key query param
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("api_key");
  if (queryKey) {
    const record = apiKeys.get(queryKey);
    if (record) return { tier: record.tier, source: "api_key" };
  }

  // 3. Bearer token (session)
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = getUserFromToken(token);
    if (user) {
      const tier = user.tier === "pro" ? "pro" : "free";
      return { tier, userId: user.id, source: "bearer" };
    }
  }

  // 4. Unauthenticated — free tier
  return { tier: "free", source: "none" };
}

// ── Rate limiting ──────────────────────────────────────────────────────

const RATE_LIMITS: Record<string, number> = {
  free: 60,
  pro: 300,
  enterprise: 1000,
};

// In-memory rate-limit buckets: key → { count, resetAt }
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit and increment. Returns true if allowed, false if exceeded.
 * Keys are per-tier + per-IP for unauthenticated, per-tier + per-user for auth'd.
 */
export function checkRateLimit(auth: V1AuthContext, req: Request): boolean {
  const limit = RATE_LIMITS[auth.tier];
  const windowMs = 60_000; // 1-minute window

  // Build a rate-limit key
  const ip = req.headers.get("X-Forwarded-For") || req.headers.get("X-Real-IP") || "127.0.0.1";
  const key = `${auth.tier}:${auth.userId ?? ip}`;

  const now = Date.now();
  let bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count++;
  return true;
}

/** Cleanup old rate-limit buckets periodically */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 60_000).unref();

// ── Response helpers ────────────────────────────────────────────────────

export function v1Response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-API-Version": "1.0.0",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function v1Error(message: string, status = 400): Response {
  return v1Response({ error: message }, status);
}

export function v1RateLimited(): Response {
  return new Response(JSON.stringify({
    error: "Rate limit exceeded. Upgrade to Pro or Enterprise for higher limits.",
    retry_after_seconds: 60,
  }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "60",
      "X-API-Version": "1.0.0",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
