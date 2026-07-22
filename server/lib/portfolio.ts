/**
 * Portfolio library — allocation and drift computation utilities.
 */
import { sql } from "../db";

export interface GuruAllocation {
  ticker: string;
  company_name: string;
  guru_name: string;
  guru_slug: string;
  total_value: number;
  allocation_pct: number;
}

export interface UserAllocation {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_value: number;
  allocation_pct: number;
}

export interface DriftAlert {
  guru_name: string;
  guru_slug: string;
  ticker: string;
  guru_allocation_pct: number;
  your_allocation_pct: number;
  drift_pct: number;
  action: "add" | "reduce";
}

/** Get the latest trade per ticker per guru — used to determine current positions.
 *  For each guru, takes the most recent filing_date for each ticker.
 *  If the latest action is "sell", the position is considered gone (excluded).
 */
export async function computeGuruAllocations(guruSlug: string): Promise<GuruAllocation[]> {
  if (!sql) return [];

  // Get latest trade per ticker for this guru
  const rows = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (ticker)
        t.ticker, t.company_name, t.action, t.shares, t.price_estimate, t.filing_date,
        g.name as guru_name, g.slug as guru_slug
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE g.slug = ${guruSlug}
      ORDER BY t.ticker, t.filing_date DESC, t.created_at DESC
    )
    SELECT * FROM latest WHERE action = 'buy'
  `;

  const allocations: GuruAllocation[] = rows.map((r: Record<string, unknown>) => {
    const shares = Number(r.shares ?? 0);
    const price = Number(r.price_estimate ?? 0);
    return {
      ticker: String(r.ticker),
      company_name: String(r.company_name),
      guru_name: String(r.guru_name),
      guru_slug: String(r.guru_slug),
      total_value: shares * price,
      allocation_pct: 0,
    };
  });

  // Calculate percentages
  const totalValue = allocations.reduce((sum, a) => sum + a.total_value, 0);
  if (totalValue > 0) {
    for (const a of allocations) {
      a.allocation_pct = Math.round((a.total_value / totalValue) * 10000) / 100;
    }
  }

  return allocations;
}

/** Compute user's current portfolio allocations.
 *  current_value = shares * avg_cost (MVP: use cost basis as value proxy).
 */
export async function computeUserAllocations(userId: number): Promise<UserAllocation[]> {
  if (!sql) return [];

  const rows = await sql`
    SELECT ticker, shares::text, avg_cost::text
    FROM user_holdings
    WHERE user_id = ${userId}
    ORDER BY ticker
  `;

  const holdings: UserAllocation[] = rows.map((r: Record<string, unknown>) => {
    const shares = Number(r.shares ?? 0);
    const avgCost = Number(r.avg_cost ?? 0);
    return {
      ticker: String(r.ticker),
      shares,
      avg_cost: avgCost,
      current_value: shares * avgCost,
      allocation_pct: 0,
    };
  });

  const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
  if (totalValue > 0) {
    for (const h of holdings) {
      h.allocation_pct = Math.round((h.current_value / totalValue) * 10000) / 100;
    }
  }

  return holdings;
}

const DRIFT_THRESHOLD = 3; // 3% difference triggers alert

/** Compare user's holdings to each guru's allocations. Returns drift alerts. */
export async function computeDrift(userId: number): Promise<DriftAlert[]> {
  if (!sql) return [];

  const userAllocations = await computeUserAllocations(userId);
  if (userAllocations.length === 0) return [];

  // Get all active gurus
  const guruRows = await sql`SELECT id, name, slug FROM gurus WHERE is_active = true`;
  const gurus: { name: string; slug: string }[] = guruRows.map((r: Record<string, unknown>) => ({
    name: String(r.name),
    slug: String(r.slug),
  }));

  const alerts: DriftAlert[] = [];

  // Build user allocation map by ticker
  const userMap = new Map<string, UserAllocation>();
  for (const ua of userAllocations) {
    userMap.set(ua.ticker, ua);
  }

  // For each guru, compare their allocations to user's
  for (const guru of gurus) {
    const guruAllocs = await computeGuruAllocations(guru.slug);
    if (guruAllocs.length === 0) continue;

    // Collect all tickers from both user and this guru
    const allTickers = new Set([
      ...userAllocations.map((u) => u.ticker),
      ...guruAllocs.map((g) => g.ticker),
    ]);

    for (const ticker of allTickers) {
      const userAlloc = userMap.get(ticker);
      const guruAlloc = guruAllocs.find((g) => g.ticker === ticker);

      const userPct = userAlloc?.allocation_pct ?? 0;
      const guruPct = guruAlloc?.allocation_pct ?? 0;

      const diff = guruPct - userPct; // positive = user underweight, negative = user overweight

      if (Math.abs(diff) >= DRIFT_THRESHOLD) {
        alerts.push({
          guru_name: guru.name,
          guru_slug: guru.slug,
          ticker,
          guru_allocation_pct: guruPct,
          your_allocation_pct: userPct,
          drift_pct: Math.abs(diff),
          action: diff > 0 ? "add" : "reduce",
        });
      }
    }
  }

  // Sort by drift magnitude descending
  alerts.sort((a, b) => b.drift_pct - a.drift_pct);

  return alerts;
}
