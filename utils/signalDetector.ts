import { SymbolData } from '../types';

export type SentimentSignal = {
  symbol: string;
  signal:
    | 'Bullish Opportunity'
    | 'Early Squeeze Signal'
    | 'Bearish Risk'
    | 'Early Long Trap'
    | 'Neutral';
  reason: string;
  priceChangePercent: number;
  strongBuy?: boolean;
  strongSell?: boolean;
};

export function detectSentimentSignals(data: SymbolData[]): SentimentSignal[] {
  const volumeThreshold = 50_000_000;     // $50M
  const fundingThreshold = 0.0001;        // 0.01%

  return data.map(({ symbol, priceChangePercent, volume, fundingRate }) => {
    const volumeUSD = `$${(volume / 1e6).toFixed(1)}M`;
    const fundingPercent = (fundingRate * 100).toFixed(4) + '%';

    // 🔶 EARLY SQUEEZE SIGNAL
    if (
      priceChangePercent > 0 &&
      priceChangePercent < 10 &&
      volume >= volumeThreshold &&
      fundingRate < 0
    ) {
      return {
        symbol,
        signal: 'Early Squeeze Signal',
        reason: `Moderate price gain (+${priceChangePercent.toFixed(1)}%), strong volume (${volumeUSD}), and negative funding (${fundingPercent}) suggest a developing short squeeze.`,
        priceChangePercent,
        strongBuy: true,
      };
    }

    // 🔴 EARLY LONG TRAP SIGNAL
    if (
      priceChangePercent < 0 &&
      priceChangePercent > -10 &&
      volume >= volumeThreshold &&
      fundingRate > 0
    ) {
      return {
        symbol,
        signal: 'Early Long Trap',
        reason: `Moderate price drop (${priceChangePercent.toFixed(1)}%), high volume (${volumeUSD}), and positive funding (${fundingPercent}) suggest a developing long trap scenario.`,
        priceChangePercent,
        strongSell: true,
      };
    }

    // 🟢 BULLISH OPPORTUNITY
    if (
      priceChangePercent > 0 &&
      priceChangePercent < 10 &&
      volume >= volumeThreshold &&
      fundingRate <= fundingThreshold
    ) {
      return {
        symbol,
        signal: 'Bullish Opportunity',
        reason: `Moderate price gain (+${priceChangePercent.toFixed(1)}%), high volume (${volumeUSD}), and low or negative funding (${fundingPercent}) suggest early bullish momentum.`,
        priceChangePercent,
        strongBuy: true,
      };
    }

    // 🔻 BEARISH RISK
    if (
      priceChangePercent < 0 &&
      priceChangePercent > -10 &&
      volume >= volumeThreshold &&
      fundingRate >= fundingThreshold
    ) {
      return {
        symbol,
        signal: 'Bearish Risk',
        reason: `Moderate price drop (${priceChangePercent.toFixed(1)}%), high volume (${volumeUSD}), and positive funding (${fundingPercent}) suggest long trap or hidden sell pressure.`,
        priceChangePercent,
        strongSell: true,
      };
    }

    // ❔ NEUTRAL
    return {
      symbol,
      signal: 'Neutral',
      reason: 'No strong sentiment signal detected.',
      priceChangePercent,
    };
  });
}
