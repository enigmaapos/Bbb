// src/utils/signalDetector.ts

// Using SymbolData from your main types, adjust property names to match
import { SymbolData } from '../types';

export type SentimentSignal = {
  symbol: string;
  signal: 'Bullish Opportunity' | 'Bearish Risk' | 'Neutral';
  reason: string;
};

export function detectSentimentSignals(data: SymbolData[]): SentimentSignal[] {
  return data.map(({ symbol, priceChangePercent, volume, fundingRate }) => { // Changed priceChange to priceChangePercent
    const volThreshold = 50_000_000; // $50M

    // 🔼 Bullish Criteria
    // Price up ≥ 10%
    // Volume ≥ $50M
    // Funding ≤ 0.01% (not overheated)
    if (
      priceChangePercent >= 10 &&
      volume >= volThreshold &&
      fundingRate <= 0.0001 // Changed 0.01 to 0.0001 for percentage (0.01% = 0.0001 in decimal)
    ) {
      return {
        symbol,
        signal: 'Bullish Opportunity',
        reason: `Strong price increase (+${priceChangePercent.toFixed(1)}%), high volume ($${(volume / 1e6).toFixed(1)}M), and low funding (${(fundingRate * 100).toFixed(4)}%) suggest early bull momentum.`,
      };
    }

    // 🔻 Bearish Criteria
    // Price down ≥ 10%
    // Volume ≥ $50M
    // Funding ≥ 0.01% (trapped longs)
    if (
      priceChangePercent <= -10 &&
      volume >= volThreshold &&
      fundingRate >= 0.0001 // Changed 0.01 to 0.0001 for percentage
    ) {
      return {
        symbol,
        signal: 'Bearish Risk',
        reason: `Price drop (-${Math.abs(priceChangePercent).toFixed(1)}%), high volume ($${(volume / 1e6).toFixed(1)}M), and positive funding (${(fundingRate * 100).toFixed(4)}%) indicate trapped longs.`,
      };
    }

    return {
      symbol,
      signal: 'Neutral',
      reason: 'No strong sentiment signal detected.',
    };
  });
}
