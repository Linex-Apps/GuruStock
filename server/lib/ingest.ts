/**
 * Trade Ingestion Engine — takes scraped trade data and persists it to the database.
 *
 * Handles deduplication (by guru_id + ticker + filing_date), confidence tagging,
 * and batch ingestion for all gurus.
 */
import { sql } from "../db";
import { scrapeGuruFilings } from "./edgar";

export interface IngestResult {
  guru: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

/**
 * Ingest trades for a single guru by slug.
 *
 * 1. Looks up the guru in the database
 * 2. Scrapes EDGAR for 13F filings + generates placeholder trades
 * 3. Inserts new trades, skipping duplicates
 * 4. Returns a summary of what happened
 */
export async function ingestGuruTrades(guruSlug: string): Promise<IngestResult> {
  const result: IngestResult = {
    guru: guruSlug,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  if (!sql) {
    result.errors.push("Database not available");
    return result;
  }

  // Look up guru
  let guru: any;
  try {
    [guru] = await sql`SELECT id, name FROM gurus WHERE slug = ${guruSlug}`;
  } catch (err) {
    result.errors.push(`Failed to look up guru: ${String(err)}`);
    return result;
  }

  if (!guru) {
    result.errors.push(`Guru not found: ${guruSlug}`);
    return result;
  }

  // Scrape trades from EDGAR (placeholder data for MVP)
  let trades: Array<{
    ticker: string;
    companyName: string;
    action: "buy" | "sell";
    shares: number;
    priceEstimate: number;
    filingDate: string;
    sourceUrl: string;
  }>;

  try {
    trades = await scrapeGuruFilings(guruSlug);
    result.fetched = trades.length;
  } catch (err) {
    result.errors.push(`Scrape failed: ${String(err)}`);
    return result;
  }

  // Insert each trade, skipping duplicates
  for (const trade of trades) {
    try {
      const insertResult = await sql`
        INSERT INTO trades (guru_id, ticker, company_name, action, shares, price_estimate, filing_date, source_url, confidence)
        VALUES (
          ${guru.id},
          ${trade.ticker},
          ${trade.companyName},
          ${trade.action},
          ${trade.shares},
          ${trade.priceEstimate},
          ${trade.filingDate},
          ${trade.sourceUrl},
          'estimated'
        )
        ON CONFLICT (guru_id, ticker, filing_date) DO NOTHING
        RETURNING id
      `;

      if (insertResult.length > 0) {
        result.inserted++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.errors.push(`Failed to insert ${trade.ticker}: ${String(err)}`);
    }
  }

  console.log(
    `[ingest] ${guru.name}: ${result.inserted} new, ${result.skipped} skipped, ${result.fetched} fetched`
  );

  return result;
}

/**
 * Ingest trades for all active gurus.
 */
export async function ingestAllGurus(): Promise<IngestResult[]> {
  if (!sql) {
    console.warn("[ingest] Database not available, skipping ingestion");
    return [];
  }

  let gurus: Array<{ slug: string }>;
  try {
    gurus = await sql`SELECT slug FROM gurus WHERE is_active = true`;
  } catch (err) {
    console.error("[ingest] Failed to fetch gurus:", err);
    return [];
  }

  const results: IngestResult[] = [];
  for (const guru of gurus) {
    // Small delay between gurus to respect SEC rate limits (10 req/sec)
    if (results.length > 0) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const result = await ingestGuruTrades(guru.slug);
    results.push(result);
  }

  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  console.log(
    `[ingest] All gurus complete: ${totalInserted} inserted, ${totalSkipped} skipped across ${results.length} gurus`
  );

  return results;
}
