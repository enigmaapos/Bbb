// src/utils/signalDetector.ts

import { SymbolData } from '../types';

export type SentimentSignal = {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Early Squeeze Signal' | 'Bearish Risk' | 'Neutral';
  reason: string;
  priceChangePercent: number; // useful for sorting/filtering later
};

export function detectSentimentSignals(data: SymbolData[]): SentimentSignal[] {
  return data.map(({ symbol, priceChangePercent, volume, fundingRate }) => {
    const volumeThreshold = 50_000_000;     // $50M
    const fundingThreshold = 0.0001;        // 0.01%

    // 🔶 Early Squeeze Signal — preserved
    if (
      priceChangePercent > 0 &&
      priceChangePercent < 10 &&
      volume >= volumeThreshold &&
      fundingRate < 0 // must be negative
    ) {
      return {
        symbol,
        signal: 'Early Squeeze Signal',
        reason: `Moderate price gain (+${priceChangePercent.toFixed(1)}%), strong volume ($${(volume / 1e6).toFixed(1)}M), and negative funding (${(fundingRate * 100).toFixed(4)}%) suggest a developing short squeeze.`,
        priceChangePercent
      };
    }

    // 🟢 Bullish Opportunity — modified: price must be < 10%
    if (
      priceChangePercent > 0 &&
      priceChangePercent < 10 &&
      volume >= volumeThreshold &&
      fundingRate <= fundingThreshold
    ) {
      return {
        symbol,
        signal: 'Bullish Opportunity',
        reason: `Moderate price gain (+${priceChangePercent.toFixed(1)}%), high volume ($${(volume / 1e6).toFixed(1)}M), and low funding (${(fundingRate * 100).toFixed(4)}%) suggest early bullish momentum.`,
        priceChangePercent
      };
    }

    // 🔴 Bearish Risk — modified: price must not be above 10%
    if (
      priceChangePercent < 10 && // allows <= 0 and 0–9.9%
      volume >= volumeThreshold &&
      fundingRate >= fundingThreshold
    ) {
      return {
        symbol,
        signal: 'Bearish Risk',
        reason: `Price change (${priceChangePercent.toFixed(1)}%), high volume ($${(volume / 1e6).toFixed(1)}M), and positive funding (${(fundingRate * 100).toFixed(4)}%) suggest potential trapped longs or weakness.`,
        priceChangePercent
      };
    }

    // ❔ Neutral fallback
    return {
      symbol,
      signal: 'Neutral',
      reason: 'No strong sentiment signal detected.',
      priceChangePercent
    };
  });
}
