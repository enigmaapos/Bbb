// src/utils/signalDetector.ts

import { SymbolData } from '../types';

export type SentimentSignal = {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Early Squeeze Signal' | 'Bearish Risk' | 'Neutral';
  reason: string;
};

export function detectSentimentSignals(data: SymbolData[]): SentimentSignal[] {
  return data.map(({ symbol, priceChangePercent, volume, fundingRate }) => {
    const volThreshold = 50_000_000; // $50M
    const bullishFundingCap = 0.0001; // 0.01%
    const earlySqueezeFundingCap = 0; // Negative funding

    // ✅ Strong Bullish Opportunity
    if (
      priceChangePercent >= 10 &&
      volume >= volThreshold &&
      fundingRate <= bullishFundingCap
    ) {
      return {
        symbol,
        signal: 'Bullish Opportunity',
        reason: `Strong price increase (+${priceChangePercent.toFixed(1)}%), high volume ($${(volume / 1e6).toFixed(1)}M), and low funding (${(fundingRate * 100).toFixed(4)}%) suggest early bull momentum.`,
      };
    }

    // 🔶 Early Squeeze Signal
    if (
      priceChangePercent > 0 &&
      priceChangePercent < 10 &&
      volume >= volThreshold &&
      fundingRate < earlySqueezeFundingCap
    ) {
      return {
        symbol,
        signal: 'Early Squeeze Signal',
        reason: `Moderate price gain (+${priceChangePercent.toFixed(1)}%), strong volume ($${(volume / 1e6).toFixed(1)}M), and negative funding (${(fundingRate * 100).toFixed(4)}%) suggest a developing short squeeze.`,
      };
    }

    // ❌ Bearish Risk
    if (
      priceChangePercent <= -10 &&
      volume >= volThreshold &&
      fundingRate >= bullishFundingCap
    ) {
      return {
        symbol,
        signal: 'Bearish Risk',
        reason: `Price drop (-${Math.abs(priceChangePercent).toFixed(1)}%), high volume ($${(volume / 1e6).toFixed(1)}M), and positive funding (${(fundingRate * 100).toFixed(4)}%) indicate trapped longs.`,
      };
    }

    // ❔ Neutral
    return {
      symbol,
      signal: 'Neutral',
      reason: 'No strong sentiment signal detected.',
    };
  });
}
