/**
 * EDGAR Scraper — fetches 13F filing metadata and real holdings from the SEC EDGAR API.
 *
 * Uses the SEC submissions API to find 13F-HR filings, then fetches and parses
 * the actual 13F XML to extract real holdings data (issuer, ticker, shares, value).
 *
 * SEC API docs: https://www.sec.gov/os/accessing-edgar-data
 * Rate limit: 10 requests/second. User-Agent header is required.
 */

import { fetchAndParse13F } from "./sec-parser";

const SEC_BASE = "https://data.sec.gov";
const USER_AGENT = "GuruStock/1.0 (contact@gurustock.dev)";

// Known CIKs for our tracked gurus
export const GURU_CIKS: Record<string, string> = {
  "warren-buffett": "0001067983", // Berkshire Hathaway
  "ray-dalio": "0001350694",     // Bridgewater Associates
  "cathie-wood": "0001579982",   // ARK Invest (ARK ETF Trust)
  "bill-ackman": "0001336528",   // Pershing Square Capital Management
};

export interface FilingMetadata {
  accessionNumber: string;
  filingDate: string;       // YYYY-MM-DD — when the filing was submitted
  reportDate: string;       // YYYY-MM-DD — quarter-end the filing covers
  formType: string;         // e.g. "13F-HR", "13F-HR/A"
  sourceUrl: string;        // link to the filing on SEC.gov
  primaryDocument: string;  // filename of primary document (for XML URL construction)
}

export interface RealTrade {
  ticker: string;
  companyName: string;
  action: "buy" | "sell";
  shares: number;
  priceEstimate: number;
  filingDate: string;
  sourceUrl: string;
  value: number;            // total position value in dollars
  confidence: "confirmed" | "estimated";
}

/**
 * Fetch filing history from the SEC submissions API for a given CIK.
 */
async function fetchSubmissions(cik: string): Promise<any> {
  const url = `${SEC_BASE}/submissions/CIK${cik}.json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`SEC API returned ${res.status} for CIK ${cik}: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Extract 13F-HR filing metadata from the submissions response.
 * Returns the most recent filings first.
 */
export async function get13FFilings(
  cik: string,
  limit: number = 3
): Promise<FilingMetadata[]> {
  const data = await fetchSubmissions(cik);

  const filings = data.filings?.recent;
  if (!filings) return [];

  const results: FilingMetadata[] = [];
  const { form, filingDate, reportDate, accessionNumber, primaryDocument } = filings;

  for (let i = 0; i < form.length && results.length < limit; i++) {
    if (form[i] === "13F-HR" || form[i] === "13F-HR/A") {
      const accNum = accessionNumber[i].replace(/-/g, "");
      const cikNoLeadingZero = cik.replace(/^0+/, "");
      const sourceUrl =
        `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZero}/${accNum}/${primaryDocument[i]}`;

      results.push({
        accessionNumber: accessionNumber[i],
        filingDate: filingDate[i],
        reportDate: reportDate[i],
        formType: form[i],
        sourceUrl,
        primaryDocument: primaryDocument[i],
      });
    }
  }

  return results;
}

/**
 * Convert a parsed 13F entry into a RealTrade.
 * All 13F filings represent holdings, not trades per se, so we mark
 * all as "buy" (meaning "currently holding") with confidence "confirmed".
 */
function entryToTrade(
  entry: {
    nameOfIssuer: string;
    ticker: string;
    value: number;
    shares: number;
  },
  filingDate: string,
  sourceUrl: string
): RealTrade {
  // price = value * 1000 / shares (value is in thousands)
  const priceEstimate = entry.shares > 0
    ? Math.round((entry.value * 1000) / entry.shares * 100) / 100
    : 0;

  return {
    ticker: entry.ticker,
    companyName: entry.nameOfIssuer,
    action: "buy", // 13F reports holdings, not direction
    shares: entry.shares,
    priceEstimate,
    filingDate,
    sourceUrl,
    value: entry.value * 1000, // convert from thousands to actual dollars
    confidence: "confirmed",
  };
}

/**
 * Full scrape pipeline: fetch 13F filings + parse real XML holdings.
 *
 * For each 13F filing found, this fetches the XML holding report and extracts
 * the actual portfolio positions. Falls back to an empty array on failure.
 */
export async function scrapeGuruFilings(
  guruSlug: string
): Promise<RealTrade[]> {
  const cik = GURU_CIKS[guruSlug];
  if (!cik) {
    console.warn(`[edgar] No CIK configured for guru: ${guruSlug}`);
    return [];
  }

  // Fetch filing metadata
  let filings: FilingMetadata[] = [];
  try {
    filings = await get13FFilings(cik, 2); // Get the 2 most recent
    console.log(
      `[edgar] Fetched ${filings.length} 13F filing(s) for ${guruSlug} (CIK ${cik})`
    );
  } catch (err) {
    console.error(`[edgar] Failed to fetch filings for ${guruSlug}:`, err);
    return [];
  }

  if (filings.length === 0) {
    console.warn(`[edgar] No 13F filings found for ${guruSlug}`);
    return [];
  }

  const allTrades: RealTrade[] = [];

  // Parse each filing
  for (const filing of filings) {
    try {
      console.log(
        `[edgar] Parsing 13F for ${guruSlug}: ${filing.accessionNumber} (${filing.reportDate})`
      );

      const result = await fetchAndParse13F(cik, filing.accessionNumber, filing.primaryDocument);

      if (result.entries.length === 0) {
        console.warn(
          `[edgar] No tickered holdings parsed from ${guruSlug}'s filing ${filing.accessionNumber}`
        );
        continue;
      }

      // Convert entries to trades, using the report date (quarter end) as filing date
      const filingDate = filing.reportDate || filing.filingDate;

      for (const entry of result.entries) {
        if (entry.ticker) {
          const trade = entryToTrade(
            entry as { nameOfIssuer: string; ticker: string; value: number; shares: number },
            filingDate,
            filing.sourceUrl
          );
          allTrades.push(trade);
        }
      }

      console.log(
        `[edgar] Extracted ${result.entries.length} holdings from ${guruSlug}'s ${filing.reportDate} filing`
      );
    } catch (err) {
      console.error(
        `[edgar] Failed to parse ${guruSlug}'s filing ${filing.accessionNumber}:`,
        err
      );
      // Continue with other filings
    }
  }

  if (allTrades.length === 0) {
    console.warn(`[edgar] No trades extracted for ${guruSlug} from any filing`);
  }

  return allTrades;
}
