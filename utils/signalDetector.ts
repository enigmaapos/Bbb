// src/utils/signalDetector.ts

import { SymbolData, SentimentSignal, SiteAData } from "../types";

/**
 * A utility function to detect actionable sentiment signals from market data.
 * It analyzes individual symbol data to find specific patterns that suggest
 * bullish opportunities or bearish risks.
 *
 * @param volumeData An array of SymbolData objects containing market metrics.
 * @returns An array of SentimentSignal objects.
 */
export function detectSentimentSignals(volumeData: SymbolData[]): SentimentSignal[] {
  const signals: SentimentSignal[] = [];

  for (const data of volumeData) {
    const { symbol, priceChangePercent, fundingRate, volume } = data;

    // --- Bullish Signal Detection ---

    // Signal 1: "Funding Squeeze" - Price is up, funding is very negative.
    if (
      priceChangePercent > 2 &&
      fundingRate < -0.005 &&
      volume > 200_000_000
    ) {
      signals.push({
        symbol,
        signal: "Bullish Opportunity",
        type: "Funding Squeeze",
        description: `Price up (${priceChangePercent.toFixed(2)}%) with strong negative funding (${fundingRate.toFixed(4)}). Shorts may be forced to cover.`,
      });
    }

    // Signal 2: "Volume Reversal" - Price is down, but funding is turning positive
    // with significant volume, suggesting longs are accumulating.
    if (
      priceChangePercent < -2 &&
      fundingRate > 0.001 &&
      volume > 500_000_000
    ) {
      signals.push({
        symbol,
        signal: "Bullish Opportunity",
        type: "Volume Reversal",
        description: `Price down (${priceChangePercent.toFixed(2)}%) but high volume and positive funding (${fundingRate.toFixed(4)}) may indicate a bullish reversal.`,
      });
    }


    // --- Bearish Signal Detection ---

    // Signal 3: "Long Trap" - Price is down, funding is very positive.
    if (
      priceChangePercent < -2 &&
      fundingRate > 0.01 &&
      volume > 200_000_000
    ) {
      signals.push({
        symbol,
        signal: "Bearish Risk",
        type: "Long Trap",
        description: `Price down (${priceChangePercent.toFixed(2)}%) with strong positive funding (${fundingRate.toFixed(4)}). Longs may be trapped, risking liquidations.`,
      });
    }

    // Signal 4: "Weak Rally" - Price is up, but funding is flat or negative
    // with low volume.
    if (
      priceChangePercent > 3 &&
      fundingRate < 0.0001 &&
      volume < 50_000_000
    ) {
      signals.push({
        symbol,
        signal: "Bearish Risk",
        type: "Weak Rally",
        description: `Price up (${priceChangePercent.toFixed(2)}%) but with negative funding (${fundingRate.toFixed(4)}) and low volume. The rally lacks conviction.`,
      });
    }
  }

  return signals;
}

/**
 * A new function to detect bullish and bearish flag signals from Site A data.
 * @param siteAData The market data from Site A.
 * @returns A SentimentSignal object or null if no signal is detected.
 */
export function detectFlagSignals(siteAData: SiteAData): SentimentSignal | null {
  if (!siteAData) {
    return null;
  }

  const { longShortRatio, openInterestChange } = siteAData;

  // Bullish Flag: Open interest rising with a short bias
  if (openInterestChange > 0.15 && longShortRatio < 0.9) {
    return {
      symbol: "SITEA_OVERALL",
      signal: "Bullish Opportunity",
      type: "SiteA Short Squeeze Flag",
      description: `Site A data shows rising open interest (${(openInterestChange * 100).toFixed(0)}%) with a short bias (${longShortRatio.toFixed(2)} long/short ratio), flagging potential for a squeeze.`,
    };
  }

  // Bearish Flag: Open interest rising with a long bias
  if (openInterestChange > 0.15 && longShortRatio > 1.1) {
    return {
      symbol: "SITEA_OVERALL",
      signal: "Bearish Risk",
      type: "SiteA Long Trap Flag",
      description: `Site A data shows rising open interest (${(openInterestChange * 100).toFixed(0)}%) with a long bias (${longShortRatio.toFixed(2)} long/short ratio), flagging a potential long trap.`,
    };
  }

  return null;
}
