/**
 * SEC 13F XML Parser — fetches and parses real 13F-HR holdings from the SEC EDGAR archives.
 *
 * Given a CIK and accession number, this fetches the XML holding report and extracts
 * the informationTable entries (issuer, ticker, shares, value, etc.).
 *
 * SEC rate limit: 10 requests/second. Compliance is enforced via a simple token bucket.
 *
 * XML formats handled:
 *  - Primary document XML (e.g., primary_doc.xml)
 *  - Embedded XML in full submission text file
 */

import { XMLParser } from "fast-xml-parser";
import { extractTicker, isEquitySecurity } from "./tickers";

const SEC_BASE = "https://www.sec.gov";
const USER_AGENT = "GuruStock/1.0 (contact@gurustock.dev)";

// ── Rate limiter: simple token bucket (10 req/sec max, burst of 5) ──────────
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 110; // ~9 req/sec to stay safe under 10 limit

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();

  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/xml, text/xml, text/plain, */*",
    },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface Parsed13FEntry {
  nameOfIssuer: string;
  titleOfClass: string;
  ticker: string | null;
  cusip: string;
  value: number;          // in thousands of dollars
  shares: number;
  putCall: string | null;
  investmentDiscretion: string;
  votingSole: number;
  votingShared: number;
  votingNone: number;
}

export interface Parsed13FResult {
  entries: Parsed13FEntry[];
  reportDate: string;
  totalEntries: number;
  skippedNonEquity: number;
  skippedNoTicker: number;
}

// ── XML Parsing ──────────────────────────────────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "_text",
  isArray: (name: string) => {
    // infoTable entries are always an array
    return name === "infoTable";
  },
});

/**
 * Parse 13F XML content and extract holdings entries.
 * Handles both inline XML (primary_doc.xml style) and embedded XML
 * (full submission .txt style where XML is inside the document).
 */
function parse13FXml(xmlText: string): Parsed13FEntry[] {
  const entries: Parsed13FEntry[] = [];

  let parsed: any;
  try {
    parsed = xmlParser.parse(xmlText);
  } catch {
    // Try stripping non-XML content (e.g., full submission text with XML embedded)
    let xmlMatch = xmlText.match(/<(\w+:)?edgarSubmission[\s\S]*?<\/\1?edgarSubmission>/i);
    if (!xmlMatch) {
      xmlMatch = xmlText.match(/<(\w+:)?informationTable[\s\S]*?<\/\1?informationTable>/i);
    }

    if (!xmlMatch) {
      console.warn("[sec-parser] Could not find XML in document");
      return [];
    }

    try {
      parsed = xmlParser.parse(xmlMatch[0]);
    } catch (e) {
      console.warn("[sec-parser] Failed to parse extracted XML:", e);
      return [];
    }
  }

  // Navigate to informationTable — handle namespaced and non-namespaced variants
  let infoTable: any = null;

  // Try multiple paths to find the informationTable
  const root = parsed?.edgarSubmission || parsed?.["ns1:edgarSubmission"] || parsed;
  if (root?.informationTable) {
    infoTable = root.informationTable;
  } else if (root?.["ns2:informationTable"]) {
    infoTable = root["ns2:informationTable"];
  } else if (root?.formData?.summaryPage?.infoTable) {
    // X02 format: infoTable is inside formData.summaryPage
    infoTable = root.formData.summaryPage;
  } else {
    // Walk the parsed object recursively to find informationTable
    const findTable = (obj: any): any => {
      if (!obj || typeof obj !== "object") return null;
      if (obj.infoTable) return obj;
      for (const key of Object.keys(obj)) {
        if (key === "informationTable" || key.endsWith(":informationTable")) {
          return obj[key];
        }
        const found = findTable(obj[key]);
        if (found) return found;
      }
      return null;
    };
    infoTable = findTable(parsed);
  }

  if (!infoTable || !infoTable.infoTable) {
    return [];
  }

  const tables = Array.isArray(infoTable.infoTable) ? infoTable.infoTable : [infoTable.infoTable];

  for (const entry of tables) {
    try {
      const nameOfIssuer = getText(entry.nameOfIssuer) || "";
      const titleOfClass = getText(entry.titleOfClass) || "";
      const cusip = getText(entry.cusip) || "";
      const putCall = getText(entry.putCall) || null;
      const investmentDiscretion = getText(entry.investmentDiscretion) || "";

      // Parse value (in thousands)
      const valueRaw = getText(entry.value);
      const value = valueRaw ? parseInt(valueRaw, 10) : 0;

      // Parse shares
      const shrsOrPrnAmt = entry.shrsOrPrnAmt;
      const sshPrnamt = shrsOrPrnAmt ? getText(shrsOrPrnAmt.sshPrnamt) : null;
      const shares = sshPrnamt ? parseFloat(sshPrnamt.replace(/,/g, "")) : 0;

      // Parse voting authority
      const voting = entry.votingAuthority || {};
      const votingSole = parseInt(getText(voting.Sole) || "0", 10);
      const votingShared = parseInt(getText(voting.Shared) || "0", 10);
      const votingNone = parseInt(getText(voting.None) || "0", 10);

      // Skip non-equity
      if (!isEquitySecurity(titleOfClass, putCall || undefined, cusip)) {
        continue;
      }

      // Extract ticker
      const ticker = extractTicker(titleOfClass, nameOfIssuer, putCall || undefined);

      entries.push({
        nameOfIssuer,
        titleOfClass,
        ticker,
        cusip,
        value,
        shares,
        putCall,
        investmentDiscretion,
        votingSole,
        votingShared,
        votingNone,
      });
    } catch (err) {
      // Skip malformed entries
      continue;
    }
  }

  return entries;
}

/**
 * Helper: get text value from a fast-xml-parser node (handles _text nesting).
 */
function getText(node: any): string | null {
  if (!node) return null;
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node._text !== undefined) return String(node._text);
  // It might be an object with text content
  if (typeof node === "object") {
    const keys = Object.keys(node);
    if (keys.length === 1 && typeof node[keys[0]] === "string") {
      return node[keys[0]];
    }
  }
  return null;
}

// ── URL Construction & Fetching ──────────────────────────────────────────────
/**
 * Build the URL for a 13F filing's primary document XML.
 *
 * The SEC stores filings at:
 *   /Archives/edgar/data/{cik-no-leading-zeros}/{accession-no-dashes}/{primary-doc-filename}
 *
 * For X02 format filers, the primaryDocument may be "xslForm13F_X02/primary_doc.xml"
 * but the raw XML is often also available at the root level as just "primary_doc.xml".
 */
function build13FUrl(cik: string, accessionNumber: string, primaryDoc?: string): string {
  const cikClean = cik.replace(/^0+/, "");
  const accnNoDashes = accessionNumber.replace(/-/g, "");
  const doc = primaryDoc || "primary_doc.xml";
  return `${SEC_BASE}/Archives/edgar/data/${cikClean}/${accnNoDashes}/${doc}`;
}

/**
 * Build candidate URLs to try for a 13F filing. Creates the primary doc URL,
 * plus variants with both dashed and non-dashed accession numbers.
 */
function buildCandidateUrls(cik: string, accessionNumber: string, primaryDoc?: string): string[] {
  const urls: string[] = [];
  const cikClean = cik.replace(/^0+/, "");
  const accnNoDashes = accessionNumber.replace(/-/g, "");

  // Helper to add both dashed and non-dashed variants
  const addUrl = (doc: string) => {
    // Standard: no-dash accession
    urls.push(`${SEC_BASE}/Archives/edgar/data/${cikClean}/${accnNoDashes}/${doc}`);
    // With dashes (some filings use this format)
    if (accessionNumber.includes("-")) {
      urls.push(`${SEC_BASE}/Archives/edgar/data/${cikClean}/${accessionNumber}/${doc}`);
    }
  };

  // Primary document from the submissions API first
  if (primaryDoc) {
    addUrl(primaryDoc);

    // If primaryDoc contains a path like xslForm13F_X02/primary_doc.xml,
    // also try just the filename at the root level
    const parts = primaryDoc.split("/");
    if (parts.length > 1) {
      const filename = parts[parts.length - 1];
      addUrl(filename);
    }
  }

  // Standard XML document candidates
  for (const candidate of XML_DOC_CANDIDATES) {
    addUrl(candidate);
  }

  // Full submission .txt file
  urls.push(`${SEC_BASE}/Archives/edgar/data/${cikClean}/${accnNoDashes}/${accessionNumber}.txt`);
  if (accessionNumber.includes("-")) {
    urls.push(`${SEC_BASE}/Archives/edgar/data/${cikClean}/${accessionNumber}/${accessionNumber}.txt`);
  }

  return urls;
}

/**
 * Try multiple possible document filenames for a 13F filing.
 * Some filers use primary_doc.xml, others use form13fInfoTable.xml or
 * the INFOTABLE.xml, etc.
 */
const XML_DOC_CANDIDATES = [
  "primary_doc.xml",
  "form13fInfoTable.xml",
  "infotable.xml",
  "INFORMATIONTABLE.xml",
  "InfoTable.xml",
];

/**
 * Fetch and parse a 13F filing for a given CIK and accession number.
 * Tries multiple XML document paths and returns the first successful parse.
 */
export async function fetchAndParse13F(
  cik: string,
  accessionNumber: string,
  primaryDoc?: string
): Promise<Parsed13FResult> {
  const result: Parsed13FResult = {
    entries: [],
    reportDate: "",
    totalEntries: 0,
    skippedNonEquity: 0,
    skippedNoTicker: 0,
  };

  // Build the list of URLs to try
  const urls = buildCandidateUrls(cik, accessionNumber, primaryDoc);

  let xmlText: string | null = null;
  let successUrl: string = "";

  // Try each URL
  for (const url of urls) {
    try {
      const response = await rateLimitedFetch(url);

      if (!response.ok) {
        continue; // Try next candidate
      }

      const text = await response.text();

      // Check if this looks like XML or contains XML
      if (text.includes("<informationTable") || text.includes("<edgarSubmission") ||
          text.includes("<ns1:edgarSubmission") || text.includes("<ns2:informationTable")) {
        xmlText = text;
        successUrl = url;
        break;
      }
    } catch (err) {
      continue; // Try next candidate
    }
  }

  if (!xmlText) {
    console.warn(`[sec-parser] Could not fetch any 13F XML for CIK ${cik}, accession ${accessionNumber}`);
    return result;
  }

  // Parse the XML
  const entries = parse13FXml(xmlText);
  result.totalEntries = entries.length;

  if (entries.length === 0) {
    console.warn(`[sec-parser] No entries found in 13F XML for CIK ${cik} at ${successUrl}`);
    return result;
  }

  // Separate entries with and without tickers
  const withTickers: Parsed13FEntry[] = [];
  let skippedNoTicker = 0;

  for (const entry of entries) {
    if (entry.ticker) {
      withTickers.push(entry);
    } else {
      skippedNoTicker++;
      // Log skipped entries for review
      console.log(
        `[sec-parser] Skipped (no ticker): "${entry.nameOfIssuer}" / "${entry.titleOfClass}" (CUSIP: ${entry.cusip})`
      );
    }
  }

  result.entries = withTickers;
  result.skippedNoTicker = skippedNoTicker;
  result.skippedNonEquity = result.totalEntries - entries.length; // These were filtered by isEquitySecurity

  console.log(
    `[sec-parser] Parsed 13F: ${withTickers.length} tickered entries, ` +
    `${skippedNoTicker} skipped (no ticker), ${result.skippedNonEquity} non-equity filtered`
  );

  return result;
}
