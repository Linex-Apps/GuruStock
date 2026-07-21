/**
 * EDGAR Scraper — fetches 13F filing metadata from the SEC EDGAR API.
 *
 * MVP scope: fetches real filing metadata (dates, accession numbers) from the SEC API
 * but generates PLACEHOLDER trade data (realistic tickers per guru) rather than parsing
 * the actual 13F XML/JSON holdings. Real 13F parsing is a future task.
 *
 * SEC API docs: https://www.sec.gov/os/accessing-edgar-data
 * Rate limit: 10 requests/second. User-Agent header is required.
 */

const SEC_BASE = "https://data.sec.gov";
const USER_AGENT = "GuruStock/1.0 (contact@gurustock.dev)";

// Known CIKs for our tracked gurus
export const GURU_CIKS: Record<string, string> = {
  "warren-buffett": "0001067983", // Berkshire Hathaway
  "ray-dalio": "0001350694",     // Bridgewater Associates
  "cathie-wood": "0001579982",   // ARK Invest (ARK ETF Trust)
  "bill-ackman": "0001336528",   // Pershing Square Capital Management
};

// Realistic ticker assignments per guru for placeholder trade generation.
// These are well-known holdings from public knowledge of each guru's portfolio.
// PLACEHOLDER DATA — will be replaced by real 13F XML parsing in the future.
const GURU_HOLDINGS: Record<string, Array<{ ticker: string; company: string }>> = {
  "warren-buffett": [
    { ticker: "AAPL", company: "Apple Inc." },
    { ticker: "BAC", company: "Bank of America Corp" },
    { ticker: "KO", company: "The Coca-Cola Company" },
    { ticker: "AXP", company: "American Express Company" },
    { ticker: "OXY", company: "Occidental Petroleum Corp" },
  ],
  "ray-dalio": [
    { ticker: "SPY", company: "SPDR S&P 500 ETF Trust" },
    { ticker: "GLD", company: "SPDR Gold Shares" },
    { ticker: "EEM", company: "iShares MSCI Emerging Markets ETF" },
    { ticker: "BABA", company: "Alibaba Group Holding Ltd" },
  ],
  "cathie-wood": [
    { ticker: "TSLA", company: "Tesla Inc." },
    { ticker: "COIN", company: "Coinbase Global Inc." },
    { ticker: "SQ", company: "Block Inc." },
    { ticker: "ROKU", company: "Roku Inc." },
    { ticker: "ZM", company: "Zoom Video Communications Inc." },
  ],
  "bill-ackman": [
    { ticker: "CMG", company: "Chipotle Mexican Grill Inc." },
    { ticker: "GOOGL", company: "Alphabet Inc." },
    { ticker: "HLT", company: "Hilton Worldwide Holdings Inc." },
    { ticker: "LOW", company: "Lowe's Companies Inc." },
    { ticker: "QSR", company: "Restaurant Brands International Inc." },
  ],
};

export interface FilingMetadata {
  accessionNumber: string;
  filingDate: string;       // YYYY-MM-DD — when the filing was submitted
  reportDate: string;       // YYYY-MM-DD — quarter-end the filing covers
  formType: string;         // e.g. "13F-HR", "13F-HR/A"
  sourceUrl: string;        // link to the filing on SEC.gov
}

export interface PlaceholderTrade {
  ticker: string;
  companyName: string;
  action: "buy" | "sell";
  shares: number;
  priceEstimate: number;
  filingDate: string;
  sourceUrl: string;
}

/**
 * Fetch filing history from the SEC submissions API for a given CIK.
 * Returns the raw JSON response with all filings.
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
      });
    }
  }

  return results;
}

/**
 * Generate placeholder trades for a guru based on their known holdings.
 * PLACEHOLDER DATA — these are not real 13F-parsed trades.
 * Real parsing from the 13F XML will replace this in a future task.
 *
 * Each holding is randomly assigned as a buy (70%) or sell (30%) with
 * plausible share counts to simulate real portfolio activity.
 *
 * If no real 13F filings are available, uses a synthetic recent date
 * so placeholders are still generated for MVP visibility.
 */
export function generatePlaceholderTrades(
  guruSlug: string,
  filings: FilingMetadata[]
): PlaceholderTrade[] {
  const holdings = GURU_HOLDINGS[guruSlug];
  if (!holdings) return [];

  const trades: PlaceholderTrade[] = [];

  // Use the most recent filing date if available, otherwise synthetic date.
  // PLACEHOLDER: synthetic date is an estimate — real dates will come from 13F parsing.
  const filingDate = filings.length > 0
    ? (filings[0].reportDate || filings[0].filingDate)
    : new Date().toISOString().split("T")[0];
  const sourceUrl = filings.length > 0
    ? filings[0].sourceUrl
    : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${GURU_CIKS[guruSlug] || ""}&type=13F`;

  // Simple seeded pseudo-random based on guru slug + ticker for reproducibility
  let seed = 0;
  for (let i = 0; i < guruSlug.length; i++) seed += guruSlug.charCodeAt(i);

  for (const holding of holdings) {
    seed = (seed * 16807) % 2147483647;
    const action: "buy" | "sell" = seed % 10 < 7 ? "buy" : "sell";

    seed = (seed * 16807) % 2147483647;
    // Shares between 5,000 and 500,000 for variety
    const shares = 5000 + (seed % 495000);

    seed = (seed * 16807) % 2147483647;
    // Price estimate between $10 and $500
    const priceEstimate = 10 + (seed % 490) + Math.round((seed % 100) / 100);

    trades.push({
      ticker: holding.ticker,
      companyName: holding.company,
      action,
      shares,
      priceEstimate,
      filingDate,
      sourceUrl,
    });
  }

  return trades;
}

/**
 * Full scrape pipeline: fetch 13F filings + generate placeholder trades.
 * In the future, the placeholder generation will be replaced with real XML parsing.
 *
 * MVP behavior: tries to fetch real 13F metadata from SEC, but always generates
 * placeholder trades regardless — missing filings get a synthetic date.
 */
export async function scrapeGuruFilings(
  guruSlug: string
): Promise<PlaceholderTrade[]> {
  const cik = GURU_CIKS[guruSlug];
  if (!cik) {
    console.warn(`No CIK configured for guru: ${guruSlug}`);
    // Still generate placeholders with synthetic data
    return generatePlaceholderTrades(guruSlug, []);
  }

  let filings: FilingMetadata[] = [];
  try {
    filings = await get13FFilings(cik, 3);
    console.log(
      `[edgar] Fetched ${filings.length} 13F filing(s) for ${guruSlug} (CIK ${cik})`
    );
  } catch (err) {
    console.error(`[edgar] Failed to fetch filings for ${guruSlug}:`, err);
    // Fall through — generate placeholders anyway
  }

  const trades = generatePlaceholderTrades(guruSlug, filings);
  return trades;
}
