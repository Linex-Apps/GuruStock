/**
 * Scoreboard Engine — deterministic performance scoring for guru trades.
 *
 * Each trade gets a simulated "result_change_pct" based on a deterministic hash
 * of the trade identity (guru_id + ticker + filing_date).
 *
 * Win logic:
 *   - Buy:  result_change_pct > 0  → good call (price went up)
 *   - Sell: result_change_pct < 0  → good call (price went down)
 *
 * Returns aggregate stats per guru identical for every call (same input → same output).
 */

import { sql } from "../db";

export interface TradeResult {
  trade_id: number;
  ticker: string;
  company_name: string;
  action: "buy" | "sell";
  price_estimate: string;
  filing_date: string;
  result_change_pct: number;
  is_win: boolean;
}

export interface GuruScore {
  guru_id: number;
  name: string;
  slug: string;
  total_trades: number;
  wins: number;
  win_rate: number; // 0–100
  avg_return_pct: number;
  best_trade: { ticker: string; pct: number };
  worst_trade: { ticker: string; pct: number };
}

export interface GuruScoreDetail extends GuruScore {
  trades: TradeResult[];
}

export interface ScoreboardResponse {
  gurus: GuruScore[];
  meta: {
    avg_win_rate: number;
    top_guru: { name: string; win_rate: number } | null;
    total_gurus: number;
  };
}

// ── Deterministic hash ──────────────────────────────────────────────

/**
 * djb2-like hash returning a 32-bit integer from the input string.
 * Deterministic across runs and platforms.
 */
function hash32(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // unsigned
}

/**
 * Deterministic result percentage for a trade.
 *   Returns a value in roughly [-40, +60] range, biased slightly positive
 *   so gurus look decent but not flawless.
 */
function deterministicResult(guruId: number, ticker: string, filingDate: string): number {
  const seed = `${guruId}:${ticker}:${filingDate}`;
  const h = hash32(seed);
  // Normalize to [-30, +55] — most trades have small-to-moderate wins
  const range = 85;
  const offset = -30;
  // Use modulus to get value in [0, range)
  const raw = h % (range * 1000);
  return +(offset + raw / 1000).toFixed(1);
}

/**
 * Given a result_change_pct and action, is it a "win"?
 *   Buy  → positive return = win (price went up)
 *   Sell → negative return = win (sold before it dropped)
 */
function isWin(action: string, resultPct: number): boolean {
  if (action === "buy") return resultPct > 0;
  if (action === "sell") return resultPct < 0;
  return false;
}

// ── Public API ──────────────────────────────────────────────────────

export async function computeScoreboard(): Promise<ScoreboardResponse> {
  if (!sql) {
    return { gurus: [], meta: { avg_win_rate: 0, top_guru: null, total_gurus: 0 } };
  }

  const rows = await sql`
    SELECT t.id, t.guru_id, t.ticker, t.company_name, t.action, t.price_estimate::text, t.filing_date::text,
           g.name, g.slug
    FROM trades t
    JOIN gurus g ON t.guru_id = g.id
    WHERE g.is_active = true
    ORDER BY g.id, t.filing_date
  `;

  // Group by guru
  const guruMap = new Map<number, {
    guru_id: number;
    name: string;
    slug: string;
    trades: TradeResult[];
  }>();

  for (const row of rows) {
    const resultPct = deterministicResult(row.guru_id, row.ticker, row.filing_date);
    const win = isWin(row.action, resultPct);

    const entry: TradeResult = {
      trade_id: row.id,
      ticker: row.ticker,
      company_name: row.company_name,
      action: row.action,
      price_estimate: row.price_estimate,
      filing_date: row.filing_date,
      result_change_pct: resultPct,
      is_win: win,
    };

    if (!guruMap.has(row.guru_id)) {
      guruMap.set(row.guru_id, {
        guru_id: row.guru_id,
        name: row.name,
        slug: row.slug,
        trades: [],
      });
    }
    guruMap.get(row.guru_id)!.trades.push(entry);
  }

  const gurus: GuruScore[] = [];

  for (const [, guru] of guruMap) {
    const trades = guru.trades;
    const wins = trades.filter((t) => t.is_win).length;
    const total = trades.length;
    const winRate = total > 0 ? +(wins / total * 100).toFixed(1) : 0;
    const avgReturn = total > 0
      ? +(trades.reduce((s, t) => s + t.result_change_pct, 0) / total).toFixed(1)
      : 0;

    let bestTrade: { ticker: string; pct: number } = { ticker: "—", pct: 0 };
    let worstTrade: { ticker: string; pct: number } = { ticker: "—", pct: 0 };

    if (total > 0) {
      const sorted = [...trades].sort((a, b) => b.result_change_pct - a.result_change_pct);
      bestTrade = { ticker: sorted[0].ticker, pct: sorted[0].result_change_pct };
      worstTrade = { ticker: sorted[total - 1].ticker, pct: sorted[total - 1].result_change_pct };
    }

    gurus.push({
      guru_id: guru.guru_id,
      name: guru.name,
      slug: guru.slug,
      total_trades: total,
      wins,
      win_rate: winRate,
      avg_return_pct: avgReturn,
      best_trade: bestTrade,
      worst_trade: worstTrade,
    });
  }

  // Sort by win_rate descending
  gurus.sort((a, b) => b.win_rate - a.win_rate);

  // Meta
  const totalGurus = gurus.length;
  const avgWinRate = totalGurus > 0
    ? +(gurus.reduce((s, g) => s + g.win_rate, 0) / totalGurus).toFixed(1)
    : 0;
  const topGuru = gurus.length > 0
    ? { name: gurus[0].name, win_rate: gurus[0].win_rate }
    : null;

  return {
    gurus,
    meta: { avg_win_rate: avgWinRate, top_guru: topGuru, total_gurus: totalGurus },
  };
}

/**
 * Compute detailed score for a single guru by slug.
 */
export async function computeGuruDetail(slug: string): Promise<GuruScoreDetail | null> {
  if (!sql) return null;

  const [guruRow] = await sql`SELECT id, name, slug FROM gurus WHERE slug = ${slug} AND is_active = true`;
  if (!guruRow) return null;

  const trades = await sql`
    SELECT t.id, t.ticker, t.company_name, t.action, t.price_estimate::text, t.filing_date::text
    FROM trades t
    WHERE t.guru_id = ${guruRow.id}
    ORDER BY t.filing_date DESC
  `;

  const results: TradeResult[] = trades.map((t: any) => {
    const resultPct = deterministicResult(guruRow.id, t.ticker, t.filing_date);
    return {
      trade_id: t.id,
      ticker: t.ticker,
      company_name: t.company_name,
      action: t.action,
      price_estimate: t.price_estimate,
      filing_date: t.filing_date,
      result_change_pct: resultPct,
      is_win: isWin(t.action, resultPct),
    };
  });

  const wins = results.filter((t) => t.is_win).length;
  const total = results.length;
  const winRate = total > 0 ? +(wins / total * 100).toFixed(1) : 0;
  const avgReturn = total > 0
    ? +(results.reduce((s, t) => s + t.result_change_pct, 0) / total).toFixed(1)
    : 0;

  let bestTrade: { ticker: string; pct: number } = { ticker: "—", pct: 0 };
  let worstTrade: { ticker: string; pct: number } = { ticker: "—", pct: 0 };
  if (total > 0) {
    const sorted = [...results].sort((a, b) => b.result_change_pct - a.result_change_pct);
    bestTrade = { ticker: sorted[0].ticker, pct: sorted[0].result_change_pct };
    worstTrade = { ticker: sorted[total - 1].ticker, pct: sorted[total - 1].result_change_pct };
  }

  return {
    guru_id: guruRow.id,
    name: guruRow.name,
    slug: guruRow.slug,
    total_trades: total,
    wins,
    win_rate: winRate,
    avg_return_pct: avgReturn,
    best_trade: bestTrade,
    worst_trade: worstTrade,
    trades: results,
  };
}
