/**
 * Rationale Generator — rules-based engine that produces a one-paragraph
 * explanation for each guru trade. No external AI API needed for MVP.
 *
 * Export: generateRationale(trade) → string
 */

export interface TradeForRationale {
  ticker: string;
  company_name: string;
  action: "buy" | "sell";
  guru_name?: string;
  guru_slug?: string;
}

// ── Per-guru flavor templates ────────────────────────────────────────

type GuruFlavor = "buffett" | "dalio" | "wood" | "ackman" | "generic";

function detectGuruFlavor(slug?: string): GuruFlavor {
  if (!slug) return "generic";
  if (slug.includes("buffett")) return "buffett";
  if (slug.includes("dalio")) return "dalio";
  if (slug.includes("wood")) return "wood";
  if (slug.includes("ackman")) return "ackman";
  return "generic";
}

// Tech stocks that Cathie Wood typically trades
const WOOD_TECH_STOCKS = new Set(["TSLA", "COIN", "SQ", "ROKU", "ZM", "SHOP", "PLTR", "CRSP", "NTLA", "BEAM", "TWLO", "SPOT", "TDOC", "EXAS", "PACB"]);

// ── Special-case rationales ───────────────────────────────────────────

const SPECIAL_BUYS: Record<string, Record<string, string>> = {
  "warren-buffett": {
    "AAPL": "Buffett has been accumulating Apple for years, viewing it as a consumer franchise with pricing power and massive cash flows. This buy likely reflects continued confidence in Apple's ecosystem lock-in and capital return program.",
    "BAC": "Buffett sees Bank of America as a stable franchise with durable competitive advantages in consumer banking. This addition likely reflects confidence in rising net interest margins and the bank's cost-cutting initiatives.",
    "OXY": "Buffett has been steadily building Berkshire's position in Occidental Petroleum, likely betting on long-term energy demand and OXY's carbon-capture initiatives as a hedge against the energy transition.",
    "KO": "Coca-Cola is one of Buffett's longest-held positions — a classic wide-moat consumer staple with pricing power and global distribution. Adding here signals continued conviction in the brand's durability.",
    "AXP": "American Express benefits from strong network effects and premium customer demographics. Buffett likely views AMEX as a toll-booth business with recurring fee revenue and brand loyalty.",
  },
  "ray-dalio": {
    "GLD": "Dalio often uses gold as a macro hedge against inflation and currency debasement. This buy may signal concern about monetary policy or a desire to diversify away from fiat currency exposure.",
    "SPY": "A broad S&P 500 allocation fits Dalio's 'All Weather' philosophy — balancing growth and safety across economic environments. This likely reflects a tactical adjustment in his risk-parity framework.",
  },
  "cathie-wood": {
    "TSLA": "Cathie Wood has long held that Tesla is undervalued as a pure-play AI and robotics company, not just an automaker. This buy reflects conviction in Tesla's autonomous driving lead and robotaxi future.",
  },
};

const SPECIAL_SELLS: Record<string, Record<string, string>> = {
  "cathie-wood": {
    "TSLA": "Cathie Wood may be trimming Tesla to rebalance around position-size limits or to fund conviction buys in higher-upside innovation names. This doesn't necessarily signal a thesis shift — ARK regularly trades around core positions.",
  },
};

// ── Per-guru, per-action opening phrases ──────────────────────────────

const GURU_OPENERS: Record<GuruFlavor, Record<string, string[]>> = {
  buffett: {
    buy: [
      "Buffett appears to see deep value in {company} at current levels.",
      "Warren Buffett likely believes {company} is trading below its intrinsic value.",
      "Buffett's value-investing lens suggests {company} has a durable competitive moat.",
    ],
    sell: [
      "Buffett may be trimming {company} after it reached what he considers fair value.",
      "Berkshire's reduction in {company} could reflect tax planning or portfolio rebalancing.",
    ],
  },
  dalio: {
    buy: [
      "Dalio's macro-driven framework likely sees {company} as well-positioned for the current economic cycle.",
      "Ray Dalio may view {company} as a strategic fit within his diversification and risk-parity model.",
    ],
    sell: [
      "Dalio may be rotating out of {company} based on evolving economic indicators and macro risk signals.",
      "Bridgewater's reduction may reflect a shift in Dalio's outlook on the sector or asset class.",
    ],
  },
  wood: {
    buy: [
      "Cathie Wood believes {company} is a disruptive innovator undervalued relative to its long-term growth trajectory.",
      "Wood's conviction-driven approach suggests she sees {company} as a multi-year compounder in its category.",
    ],
    sell: [
      "Wood may be reallocating from {company} to higher-conviction names as part of ARK's active management style.",
      "Cathie Wood's team may see better risk/reward elsewhere in the innovation space and is rotating accordingly.",
    ],
  },
  ackman: {
    buy: [
      "Bill Ackman's concentrated, activist approach suggests he sees a catalyst for value creation at {company}.",
      "Ackman likely identified {company} as undervalued with a clear path to unlock shareholder value through operational improvements.",
    ],
    sell: [
      "Ackman may have achieved his value-unlock thesis at {company} and is redeploying capital into a new high-conviction idea.",
      "Pershing Square's exit may signal that the catalyst Ackman identified has played out or that risk/reward has shifted.",
    ],
  },
  generic: {
    buy: [
      "{guru} appears to see value in {company} at current levels. This {action} may reflect a view that the market is underestimating {company}'s earnings potential or that recent price weakness created an attractive entry point.",
    ],
    sell: [
      "{guru}'s reduction in {company} may signal portfolio rebalancing, profit-taking after a strong run, or a shift in conviction about the company's near-term prospects.",
    ],
  },
};

// ── Closing flavor phrases ────────────────────────────────────────────

const GURU_CLOSERS: Record<GuruFlavor, string[]> = {
  buffett: [
    "The position aligns with Buffett's philosophy of buying wonderful companies at fair prices and holding them for the long term.",
    "As always, Buffett is playing the long game — focusing on durable competitive advantages rather than short-term price action.",
  ],
  dalio: [
    "Dalio's approach emphasizes diversification across uncorrelated return streams, with each trade serving a specific role in the broader portfolio.",
    "This fits Dalio's view that understanding economic cycles is more important than picking individual winners.",
  ],
  wood: [
    "ARK's 5-year investment horizon means Wood is willing to tolerate short-term volatility for what she sees as exponential long-term returns.",
    "Wood's innovation thesis bets on exponential growth curves that traditional valuation models often miss.",
  ],
  ackman: [
    "Ackman's playbook typically involves taking a significant stake and pushing for changes that unlock shareholder value over a 2–3 year horizon.",
    "Pershing Square's concentrated portfolio means every position reflects high conviction and deep due diligence.",
  ],
  generic: [
    "Tracking this move can help retail investors understand how sophisticated managers are positioning for the quarters ahead.",
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.abs(hashStr(arr.join() + arr.length)) % arr.length)];
}

/** Deterministic but varied selection based on trade identity */
function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickByTrade<T>(arr: T[], trade: TradeForRationale): T {
  const seed = `${trade.ticker}:${trade.guru_slug}:${trade.action}`;
  return arr[hashStr(seed) % arr.length];
}

// ── Main generator ────────────────────────────────────────────────────

export function generateRationale(trade: TradeForRationale): string {
  const { ticker, company_name, action, guru_name, guru_slug } = trade;
  const slug = guru_slug || "";
  const name = guru_name || "This investor";
  const company = company_name || ticker;
  const flavor = detectGuruFlavor(slug);

  // Check for special-case rationales first
  if (action === "buy" && SPECIAL_BUYS[slug]?.[ticker]) {
    const closer = pickByTrade(GURU_CLOSERS[flavor], trade);
    return `${SPECIAL_BUYS[slug][ticker]} ${closer}`;
  }
  if (action === "sell" && SPECIAL_SELLS[slug]?.[ticker]) {
    const closer = pickByTrade(GURU_CLOSERS[flavor], trade);
    return `${SPECIAL_SELLS[slug][ticker]} ${closer}`;
  }

  // Tech stock + Cathie Wood
  if (flavor === "wood" && WOOD_TECH_STOCKS.has(ticker)) {
    const opener = `Cathie Wood believes disruptive innovation companies are undervalued relative to their long-term growth potential. This ${action} likely reflects her conviction in ${company}'s ability to capture market share in its category over a 5-year horizon.`;
    const closer = pickByTrade(GURU_CLOSERS.wood, trade);
    return `${opener} ${closer}`;
  }

  // General case — openers
  const openers = GURU_OPENERS[flavor][action] || GURU_OPENERS.generic[action];
  const opener = pickByTrade(openers, trade)
    .replace("{guru}", name)
    .replace("{company}", company)
    .replace("{action}", action);

  const closers = GURU_CLOSERS[flavor];
  const closer = pickByTrade(closers, trade);

  return `${opener} ${closer}`;
}
