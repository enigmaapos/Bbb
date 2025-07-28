// utils/divergenceDetector.ts

export interface PriceSnapshot {
  currentPrice: number;       // current market price (e.g., now)
  previousPrice: number;      // price 1-5 minutes ago (optional timeframe)
  price24hAgo: number;        // price exactly 24H ago
}

export interface DivergenceResult {
  isDiverging: boolean;            // True if falling now but 24H is green
  isDroppingNow: boolean;          // True if current < previous
  change24h: number;               // Absolute 24H price difference (currentPrice - price24hAgo)
  percentChange24h: string;        // Percent 24H change as a string
  reason: string;                  // Explanation message
}

export function analyzeDiverging24H(data: PriceSnapshot): DivergenceResult {
  const { currentPrice, previousPrice, price24hAgo } = data;

  const isDroppingNow = currentPrice < previousPrice;
  const change24h = currentPrice - price24hAgo;
  const percentChange24h = (price24hAgo !== 0) ? (change24h / price24hAgo) * 100 : 0; // Handle division by zero

  // A divergence occurs if the price is currently dropping (from previousPrice)
  // but its 24-hour change is still positive.
  const isDiverging = isDroppingNow && change24h > 0;

  let reason = "";
  if (isDiverging) {
    reason = "Price is currently falling, but its 24-hour change is still positive. This can indicate profit-taking or a short-term correction within an overall uptrend.";
  } else if (isDroppingNow && change24h <= 0) {
    reason = "Price is falling, and its 24-hour change is also negative or flat. This suggests a continued downtrend or reversal.";
  } else if (!isDroppingNow && change24h > 0) {
    reason = "Price is currently rising or stable, and its 24-hour change is positive. This indicates a consistent uptrend.";
  } else {
    reason = "Price is currently rising or stable, but its 24-hour change is negative or flat. This could indicate a short-term bounce in a downtrend.";
  }


  return {
    isDiverging,
    isDroppingNow,
    change24h,
    percentChange24h: percentChange24h.toFixed(2) + "%",
    reason,
  };
}
