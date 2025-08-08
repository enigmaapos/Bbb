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
  riskReward?: 'Low' | 'Medium' | 'Medium-High' | 'High' | 'Strong';
};

// ✅ Volume formatter
function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `$${(volume / 1e9).toFixed(1)}B`;
  } else if (volume >= 1_000_000) {
    return `$${(volume / 1e6).toFixed(1)}M`;
  } else {
    return `$${volume.toLocaleString()}`;
  }
}

export function detectSentimentSignals(data: SymbolData[]): SentimentSignal[] {
  const volumeThreshold = 50_000_000;
  const strongVolume = 100_000_000;
  const strongFunding = 0.015;
  const strongNegativeFunding = -0.015;

  return data.map(({ symbol, priceChangePercent, volume, fundingRate }) => {
    const volumeUSD = formatVolume(volume);
    const fundingPercent = (fundingRate * 100).toFixed(4) + '%';

    const absPriceChange = Math.abs(priceChangePercent);
    const isStrongVolume = volume >= strongVolume;

    // 🧠 Risk/Reward rating
    let riskReward: SentimentSignal['riskReward'] = 'Medium';
    if (absPriceChange > 4.5 && isStrongVolume) riskReward = 'Strong';
    else if (absPriceChange > 3.5) riskReward = 'High';
    else if (absPriceChange > 2.0) riskReward = 'Medium-High';

    // 🟠 EARLY SQUEEZE SIGNAL
    if (
      priceChangePercent > 0 &&
      priceChangePercent < 10 &&
      volume >= volumeThreshold &&
      fundingRate < 0
    ) {
      const strongBuy =
        absPriceChange > 4 &&
        (fundingRate < strongNegativeFunding || isStrongVolume);

      return {
        symbol,
        signal: 'Early Squeeze Signal',
        reason: `Moderate price gain (+${priceChangePercent.toFixed(
          1
        )}%), strong volume (${volumeUSD}), and negative funding (${fundingPercent}) suggest a developing short squeeze.`,
        priceChangePercent,
        strongBuy,
        riskReward,
      };
    }

    // 🟣 EARLY LONG TRAP SIGNAL
    if (
      priceChangePercent < 0 &&
      priceChangePercent > -10 &&
      volume >= volumeThreshold &&
      fundingRate > 0
    ) {
      const strongSell =
        absPriceChange > 3 && (fundingRate > strongFunding || isStrongVolume);

      return {
        symbol,
        signal: 'Early Long Trap',
        reason: `Moderate price drop (${priceChangePercent.toFixed(
          1
        )}%), high volume (${volumeUSD}), and positive funding (${fundingPercent}) suggest a developing long trap scenario.`,
        priceChangePercent,
        strongSell,
        riskReward,
      };
    }

    // 🟢 BULLISH OPPORTUNITY
    if (
      priceChangePercent > 0 &&
      priceChangePercent < 10 &&
      volume >= volumeThreshold &&
      fundingRate <= 0.0001
    ) {
      const strongBuy =
        absPriceChange > 3 && (fundingRate < 0 || isStrongVolume);

      return {
        symbol,
        signal: 'Bullish Opportunity',
        reason: `Moderate price gain (+${priceChangePercent.toFixed(
          1
        )}%), high volume (${volumeUSD}), and low or negative funding (${fundingPercent}) suggest early bullish momentum.`,
        priceChangePercent,
        strongBuy,
        riskReward,
      };
    }

    // 🔻 BEARISH RISK
    if (
      priceChangePercent < 0 &&
      priceChangePercent > -10 &&
      volume >= volumeThreshold &&
      fundingRate >= 0.0001
    ) {
      const strongSell =
        absPriceChange > 3 && (fundingRate > 0.01 || isStrongVolume);

      return {
        symbol,
        signal: 'Bearish Risk',
        reason: `Moderate price drop (${priceChangePercent.toFixed(
          1
        )}%), high volume (${volumeUSD}), and positive funding (${fundingPercent}) suggest long trap or hidden sell pressure.`,
        priceChangePercent,
        strongSell,
        riskReward,
      };
    }

    // ❔ NEUTRAL
    return {
      symbol,
      signal: 'Neutral',
      reason: 'No strong sentiment signal detected.',
      priceChangePercent,
      riskReward: 'Low',
    };
  });
}
