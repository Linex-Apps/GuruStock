/**
 * Ticker Validation — validates and normalizes ticker symbols extracted from 13F filings.
 *
 * Maintains a set of known valid US equity tickers (S&P 500, major ETFs, popular stocks)
 * plus a company-name-to-ticker mapping for matching issuers when titleOfClass is generic.
 */

// ── Known valid tickers (S&P 500 + major ETFs + popular stocks) ──────────────
const VALID_TICKERS = new Set<string>([
  // S&P 500 (subset — most major holdings)
  "A", "AA", "AAL", "AAPL", "ABBV", "ABNB", "ABT", "ACN", "ADBE", "ADI", "ADM", "ADP", "ADSK",
  "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG", "AKAM", "ALB", "ALGN", "ALK", "ALL",
  "AMAT", "AMCR", "AMD", "AME", "AMGN", "AMP", "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS",
  "APA", "APD", "APH", "APTV", "ARE", "ATO", "AVB", "AVGO", "AVY", "AWK", "AXON", "AXP",
  "AZO", "BA", "BAC", "BALL", "BAX", "BBWI", "BBY", "BDX", "BEN", "BF.B", "BG", "BIIB",
  "BK", "BKNG", "BKR", "BLDR", "BLK", "BMY", "BR", "BRK.B", "BRO", "BSX", "BWA", "BX",
  "BXP", "C", "CAG", "CAH", "CARR", "CAT", "CB", "CBOE", "CBRE", "CCI", "CCL", "CDNS",
  "CDW", "CE", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR", "CI", "CINF", "CL", "CLX",
  "CMA", "CMCSA", "CME", "CMG", "CMI", "CMS", "CNA", "CNC", "CNP", "COF", "COIN", "COO",
  "COP", "COR", "COST", "CPAY", "CPB", "CPRT", "CPT", "CRL", "CRM", "CRWD", "CSCO",
  "CSGP", "CSX", "CTAS", "CTLT", "CTRA", "CTSH", "CTVA", "CVS", "CVX", "CZR", "D", "DAL",
  "DD", "DE", "DECK", "DFS", "DG", "DGX", "DHI", "DHR", "DIS", "DLR", "DLTR", "DOV",
  "DOW", "DPZ", "DRI", "DTE", "DUK", "DVA", "DVN", "DXCM", "EA", "EBAY", "ECL", "ED",
  "EFX", "EG", "EIX", "EL", "ELV", "EMN", "EMR", "ENPH", "EOG", "EPAM", "EQIX", "EQR",
  "EQT", "ERIE", "ES", "ESS", "ETN", "ETR", "ETSY", "EVRG", "EW", "EXC", "EXPD", "EXPE",
  "EXR", "F", "FANG", "FAST", "FCX", "FDS", "FDX", "FE", "FFIV", "FICO", "FIS", "FITB",
  "FMC", "FOX", "FOXA", "FRT", "FSLR", "FTNT", "FTV", "GD", "GE", "GEHC", "GEV", "GILD",
  "GIS", "GL", "GLW", "GM", "GNRC", "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWW",
  "HAL", "HAS", "HBAN", "HCA", "HD", "HES", "HIG", "HII", "HLT", "HOLX", "HON", "HPE",
  "HPQ", "HRL", "HSIC", "HST", "HSY", "HUBB", "HUM", "HWM", "IBM", "ICE", "IDXX", "IEX",
  "IFF", "INCY", "INTC", "INTU", "INVH", "IP", "IPG", "IQV", "IR", "IRM", "ISRG", "IT",
  "ITW", "IVZ", "J", "JBHT", "JBL", "JCI", "JKHY", "JNJ", "JNPR", "JPM", "K", "KDP",
  "KEY", "KEYS", "KHC", "KIM", "KKR", "KLAC", "KMB", "KMI", "KMX", "KO", "KR", "KVUE",
  "L", "LDOS", "LEN", "LH", "LHX", "LIN", "LKQ", "LLY", "LMT", "LNC", "LNT", "LOW",
  "LRCX", "LULU", "LUV", "LVS", "LW", "LYB", "LYV", "MA", "MAA", "MAR", "MAS", "MCD",
  "MCHP", "MCK", "MCO", "MDLZ", "MDT", "MET", "META", "MGM", "MHK", "MLM", "MMC", "MMM",
  "MNST", "MO", "MOH", "MOS", "MPC", "MPWR", "MRK", "MRNA", "MRO", "MS", "MSCI", "MSFT",
  "MSI", "MTB", "MTCH", "MTD", "MU", "NDAQ", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC",
  "NOW", "NRG", "NSC", "NTAP", "NTRS", "NUE", "NVDA", "NVR", "NWS", "NWSA", "NXPI",
  "O", "ODFL", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS", "OXY", "PANW", "PARA",
  "PAYC", "PAYX", "PCAR", "PCG", "PEG", "PEP", "PFE", "PFG", "PG", "PGR", "PH", "PHM",
  "PKG", "PLD", "PLTR", "PM", "PNC", "PNR", "PNW", "PODD", "POOL", "PPG", "PPL", "PRU",
  "PSA", "PSX", "PTC", "PWR", "QCOM", "QRVO", "RCL", "REG", "REGN", "RF", "RJF", "RL",
  "RMD", "ROK", "ROL", "ROP", "ROST", "RSG", "RTX", "RVTY", "SBAC", "SBUX", "SCHW",
  "SHW", "SJM", "SLB", "SMCI", "SNA", "SNPS", "SO", "SOLV", "SPG", "SPGI", "SRE",
  "STE", "STLD", "STT", "STX", "STZ", "SWK", "SWKS", "SYF", "SYK", "SYY", "T", "TAP",
  "TDG", "TDY", "TECH", "TEL", "TER", "TFC", "TFX", "TGT", "TJX", "TMO", "TMUS",
  "TPR", "TRGP", "TRMB", "TROW", "TRV", "TSCO", "TSLA", "TSN", "TT", "TTWO", "TXN",
  "TXT", "TYL", "UAL", "UBER", "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI",
  "USB", "V", "VFC", "VICI", "VLO", "VLTO", "VMC", "VRSK", "VRSN", "VRTX", "VST",
  "VTR", "VTRS", "VZ", "WAB", "WAT", "WBA", "WBD", "WDC", "WEC", "WELL", "WFC",
  "WM", "WMB", "WMT", "WRB", "WST", "WTW", "WY", "WYNN", "XEL", "XYL", "YUM", "ZBH",
  "ZBRA", "ZION", "ZTS",

  // Major ETFs
  "SPY", "IVV", "VOO", "QQQ", "IWM", "DIA", "GLD", "SLV", "EEM", "EFA", "VTI", "BND",
  "AGG", "TLT", "LQD", "HYG", "VWO", "IEFA", "VEA", "VWO", "IJH", "IJR", "IWF", "IWD",
  "XLF", "XLE", "XLK", "XLV", "XLI", "XLP", "XLU", "XLB", "XLY", "XRT", "XBI", "XHB",
  "SMH", "SOXX", "IBB", "ARKK", "ARKG", "ARKF", "ARKQ", "ARKW", "KWEB", "FXI", "GDX",
  "VNQ", "VGT", "VHT", "VFH", "VDE", "VDC", "VB", "VO", "VV", "VT", "BIL", "SHY",

  // Additional popular stocks
  "ABNB", "AFRM", "AI", "ARM", "ASTS", "BA", "BABA", "BLK", "BRZE", "CAVA", "CCJ",
  "CELH", "CFLT", "CHWY", "CIEN", "CIFR", "CLF", "CRDO", "CRWD", "CVNA", "DASH",
  "DBX", "DDOG", "DELL", "DKNG", "DOCN", "DOCU", "DUOL", "ELF", "ENVX", "ESTC",
  "FIVE", "FROG", "FSLR", "GDDY", "GFS", "GLOB", "GME", "GRAB", "GSAT", "GWRE",
  "H", "HCP", "HOOD", "HUBS", "IOT", "JD", "KD", "KR", "LCID", "LI", "LMND",
  "LUMN", "M", "MARA", "MDB", "MELI", "MNDY", "MP", "MPWR", "MRVL", "MSTR",
  "NET", "NIO", "NOVA", "NTNX", "NU", "OKTA", "ONON", "OPEN", "OXY", "PATH",
  "PCOR", "PDD", "PINS", "PLUG", "QS", "RBLX", "RDDT", "RIVN", "RKLB", "ROKU",
  "RUN", "S", "SEDG", "SERV", "SHOP", "SMR", "SNAP", "SNOW", "SOFI", "SQ",
  "SRPT", "STEM", "TCOM", "TEAM", "TEM", "TOST", "TPG", "TWLO", "U", "UPST",
  "VKTX", "VRT", "W", "WOLF", "XPEV", "YELP", "YUMC", "ZI", "ZM", "ZS",
]);

// ── Company name → ticker mapping for common institutional holdings ──────────
const NAME_TO_TICKER: Record<string, string | null> = {
  "APPLE INC": "AAPL",
  "MICROSOFT CORP": "MSFT",
  "AMAZON COM INC": "AMZN",
  "NVIDIA CORP": "NVDA",
  "ALPHABET INC": "GOOGL",
  "META PLATFORMS INC": "META",
  "TESLA INC": "TSLA",
  "BERKSHIRE HATHAWAY INC": "BRK.B",
  "JPMORGAN CHASE & CO": "JPM",
  "VISA INC": "V",
  "UNITEDHEALTH GROUP INC": "UNH",
  "EXXON MOBIL CORP": "XOM",
  "JOHNSON & JOHNSON": "JNJ",
  "WALMART INC": "WMT",
  "PROCTER AND GAMBLE CO": "PG",
  "MASTERCARD INC": "MA",
  "HOME DEPOT INC": "HD",
  "BANK OF AMERICA CORP": "BAC",
  "COCA COLA CO": "KO",
  "CHEVRON CORP": "CVX",
  "ABBVIE INC": "ABBV",
  "BROADCOM INC": "AVGO",
  "COSTCO WHSL CORP NEW": "COST",
  "ELI LILLY & CO": "LLY",
  "PEPSICO INC": "PEP",
  "MERCK & CO INC": "MRK",
  "ABBOTT LABS": "ABT",
  "ADOBE INC": "ADBE",
  "SALESFORCE INC": "CRM",
  "CISCO SYS INC": "CSCO",
  "COMCAST CORP NEW": "CMCSA",
  "THERMO FISHER SCIENTIFIC INC": "TMO",
  "NETFLIX INC": "NFLX",
  "ADVANCED MICRO DEVICES INC": "AMD",
  "ORACLE CORP": "ORCL",
  "AMERICAN EXPRESS CO": "AXP",
  "MORGAN STANLEY": "MS",
  "WELLS FARGO CO NEW": "WFC",
  "GENERAL ELECTRIC CO": "GE",
  "CATERPILLAR INC": "CAT",
  "BOEING CO": "BA",
  "DEERE & CO": "DE",
  "GOLDMAN SACHS GROUP INC": "GS",
  "NIKE INC": "NKE",
  "STARBUCKS CORP": "SBUX",
  "DISNEY WALT CO": "DIS",
  "INTEL CORP": "INTC",
  "QUALCOMM INC": "QCOM",
  "PFIZER INC": "PFE",
  "UNION PAC CORP": "UNP",
  "LOCKHEED MARTIN CORP": "LMT",
  "RTX CORPORATION": "RTX",
  "RAYTHEON TECHNOLOGIES CORP": "RTX",
  "HONEYWELL INTL INC": "HON",
  "STRYKER CORPORATION": "SYK",
  "INTUITIVE SURGICAL INC": "ISRG",
  "BRISTOL MYERS SQUIBB CO": "BMY",
  "LOWES COS INC": "LOW",
  "CHIPOTLE MEXICAN GRILL INC": "CMG",
  "VERTEX PHARMACEUTICALS INC": "VRTX",
  "TJX COS INC NEW": "TJX",
  "PROLOGIS INC": "PLD",
  "BLACKROCK INC": "BLK",
  "UBER TECHNOLOGIES INC": "UBER",
  "SERVICENOW INC": "NOW",
  "PALO ALTO NETWORKS INC": "PANW",
  "BOOKING HOLDINGS INC": "BKNG",
  "AMERICAN TOWER CORP NEW": "AMT",
  "EATON CORP PLC": "ETN",
  "APPLIED MATLS INC": "AMAT",
  "ANALOG DEVICES INC": "ADI",
  "INTUIT": "INTU",
  "CROWDSTRIKE HLDGS INC": "CRWD",
  "STRYKER CORP": "SYK",
  "SPDR S&P 500 ETF TR": "SPY",
  "ISHARES TR": null, // Too generic — need to match specific iShares ETFs
  "VANGUARD INDEX FDS": null, // Too generic
  "OCCIDENTAL PETE CORP": "OXY",
  "BARRICK GOLD CORP": "GOLD",
  "NEWMONT CORP": "NEM",
  "COINBASE GLOBAL INC": "COIN",
  "BLOCK INC": "SQ",
  "ROKU INC": "ROKU",
  "ZOOM VIDEO COMMUNICATIONS IN": "ZM",
  "ALIBABA GROUP HLDG LTD": "BABA",
  "CHIPOTLE MEXICAN GRILL": "CMG",
  "HILTON WORLDWIDE HLDGS INC": "HLT",
  "RESTAURANT BRANDS INTL INC": "QSR",
  "RESTAURANT BRANDS INTERNATIONAL INC": "QSR",
  "ALPHABET INC CAP STK CL A": "GOOGL",
  "ALPHABET INC CAP STK CL C": "GOOG",
  "BERKSHIRE HATHAWAY INC DEL CL B NEW": "BRK.B",
  "BERKSHIRE HATHAWAY INC DEL CL A": "BRK.A",
  "AMAZON COM": "AMZN",
  "SPDR GOLD TR": "GLD",
  "ISHARES MSCI EMERGING MARKETS ETF": "EEM",
  "NORTHROP GRUMMAN CORP": "NOC",
  "CHARTER COMMUNICATIONS INC NEW": "CHTR",
  "VANGUARD S&P 500 ETF": "VOO",
  "INVESCO QQQ TR": "QQQ",
  "ISHARES RUSSELL 2000 ETF": "IWM",
  "SPDR DOW JONES INDL ETF TR": "DIA",
  "FORD MTR CO DEL": "F",
  // From 13F entries with "COM" as titleOfClass
  "AMAZON COM INC": "AMZN",
  "ALLY FINL INC": "ALLY",
  "HEICO CORP NEW": "HEI",
  "LAMAR ADVERTISING CO NEW": "LAMR",
  "LENNAR CORP": "LEN",
  "NEW YORK TIMES CO": "NYT",
  "SIRIUS XM HOLDINGS INC": "SIRI",
  "SIRIUS XM INC": "SIRI",
  "ALLEGION PLC": "ALLE",
  "AON PLC": "AON",
  "BROOKFIELD CORP": "BN",
  "HERTZ GLOBAL HLDGS INC": "HTZ",
  "HERTZ GLOBAL HOLDINGS INC": "HTZ",
  "SEAPORT ENTMT GROUP INC": "SEG",
  "LIBERTY BROADBAND CORP": "LBRDA",
  "LIBERTY MEDIA CORP DEL": "LSXMA",
  "LIBERTY LATIN AMERICA LTD": "LILA",
  "NVR INC": "NVR",
  "DAVITA INC": "DVA",
  "O REILLY AUTOMOTIVE INC": "ORLY",
  "DIAGEO PLC": "DEO",
  "ULTA BEAUTY INC": "ULTA",
  "JOHNSON CTLS INTL PLC": "JCI",
  "DR HORTON INC": "DHI",
  "PULTEGROUP INC": "PHM",
  "TOLL BROTHERS INC": "TOL",
};

/**
 * Check if a string looks like a ticker symbol (1-5 uppercase letters, possibly with dots).
 * Excludes common false positives like "COM" (common stock), "NEW" (new issuance), etc.
 */
export function looksLikeTicker(s: string): boolean {
  const cleaned = s.trim().toUpperCase();
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(cleaned)) return false;

  // Blacklist: common 13F titleOfClass values that look like tickers but aren't
  const blacklist = new Set([
    "COM", "NEW", "SHS", "CL", "ORD", "STK", "UNIT", "SER", "SHS",
    "VT", "LTD", "FUND", "NOTE", "BOND", "DEB", "PFD", "RIGHT",
    "WARRANT", "CVR", "CONV", "ETF", "TRUST", "CALL", "PUT",
  ]);
  return !blacklist.has(cleaned);
}

/**
 * Check if a ticker is in our known-valid set.
 */
export function isValidTicker(ticker: string): boolean {
  const cleaned = ticker.trim().toUpperCase();
  return VALID_TICKERS.has(cleaned);
}

/**
 * Try to match a company name to a known ticker.
 * Handles various suffixes (INC, CORP, etc.) and partial matches.
 */
export function lookupTickerByName(name: string): string | null {
  if (!name) return null;

  const cleaned = name.trim().toUpperCase();

  // Direct match
  if (NAME_TO_TICKER[cleaned] !== undefined) {
    return NAME_TO_TICKER[cleaned];
  }

  // Try without common suffixes
  const noSuffix = cleaned
    .replace(/\s+(INC|CORP|CO|CORPORATION|COMPANY|LTD|PLC|NEW|DEL|CL\s+[A-C])\s*$/g, "")
    .replace(/\s+(CAPITAL|MGMT|GROUP|HOLDINGS|HLDGS|COMMUNICATIONS|INTERNATIONAL|INTL)\s*$/g, "")
    .trim();

  if (noSuffix !== cleaned && NAME_TO_TICKER[noSuffix] !== undefined) {
    return NAME_TO_TICKER[noSuffix];
  }

  // Fuzzy match: search through keys
  for (const [key, ticker] of Object.entries(NAME_TO_TICKER)) {
    if (ticker === null) continue;
    if (key.includes(cleaned) || cleaned.includes(key)) {
      return ticker;
    }
  }

  return null;
}

/**
 * Extract and validate a ticker from a 13F infoTable entry.
 * Returns the ticker if valid, or null if we can't determine one.
 */
export function extractTicker(
  titleOfClass: string,
  nameOfIssuer: string,
  putCall?: string
): string | null {
  // Skip options/derivatives
  if (putCall && (putCall.toUpperCase() === "PUT" || putCall.toUpperCase() === "CALL")) {
    return null;
  }

  const toc = (titleOfClass || "").trim().toUpperCase();

  // If titleOfClass looks like a ticker and is valid
  if (looksLikeTicker(toc) && isValidTicker(toc)) {
    return toc;
  }

  // If titleOfClass is a ticker-like string but not in our set, still try it
  // (many valid tickers may not be in our set)
  if (looksLikeTicker(toc)) {
    return toc;
  }

  // Try to derive ticker from company name
  const nameTicker = lookupTickerByName(nameOfIssuer);
  if (nameTicker) return nameTicker;

  return null;
}

/**
 * Determine if an entry is likely an equity security (not a bond, option, or other).
 * 13F covers 13(f) securities which are mostly equities, but some filers include bonds.
 */
export function isEquitySecurity(titleOfClass: string, putCall?: string, cusip?: string): boolean {
  // Skip options
  if (putCall && (putCall.toUpperCase() === "PUT" || putCall.toUpperCase() === "CALL")) {
    return false;
  }

  // Skip bonds (CUSIPs for bonds often have specific formats; also check title)
  const toc = (titleOfClass || "").toUpperCase().trim();

  // Common non-equity titles in 13F filings
  const nonEquityPatterns = [
    /^BOND/, /^NOTE/, /^DEB/, /^CONV/, /^PFD/, /^PREFERRED/, /^UNIT/,
    /^WARRANT/, /^RIGHT/, /^CVR/, /^CVT/, /\bBOND\b/, /\bNOTE\b/,
    /\bDEBENTURE\b/, /PFD/, /PRF/, /^CMN STK$/, /^ORD SHS$/,
  ];

  for (const pattern of nonEquityPatterns) {
    if (pattern.test(toc)) {
      // "CMN STK" and "ORD SHS" are actually common stock — allow these
      if (toc === "CMN STK" || toc === "ORD SHS" || toc === "COM" || toc === "COMMON" || toc === "COMMON STOCK") {
        return true;
      }
      return false;
    }
  }

  // It's probably equity
  return true;
}
