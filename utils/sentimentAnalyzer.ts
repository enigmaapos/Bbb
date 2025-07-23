// utils/sentimentAnalyzer.ts

export interface SymbolAnalysisData {
  symbol: string;
  volume: number;
  priceChange: number;
  fundingRate: number;
  marketCap?: number; // optional for volume/marketcap ratio
  rsi?: number;
  openInterest?: number; // USD value of OI
  liquidationVolume?: number; // Placeholder for future use
  // Add any other raw data points needed for analysis
}

export interface MarketStats {
  green: number;
  red: number;
  fundingStats: {
    greenFundingPositive: number;
    greenFundingNegative: number;
    redFundingPositive: number;
    redFundingNegative: number;
  };
  volumeData: SymbolAnalysisData[]; // Renamed for clarity on content
}

export interface SentimentResult {
  rating: string;
  interpretation: string;
  score: number;
}

export function analyzeSentiment(stats: MarketStats) {
  const { green, red, fundingStats, volumeData } = stats;
  const totalCoins = green + red;

  // --- 1. General Market Bias ---
  let generalBias: SentimentResult;
  const greenRatio = green / totalCoins;
  const redRatio = red / totalCoins;

  if (redRatio > 0.7) {
    generalBias = {
      interpretation: `The market is dominated by red candles, and most coins are either flat or down. Over ${Math.round(redRatio * 100)}% of the market is bearish or stagnant.`,
      rating: "🔴 Strong Bearish Bias",
      score: 8.5,
    };
  } else if (greenRatio > 0.6) {
    generalBias = {
      interpretation: `The market shows strong bullish momentum, with a majority of coins in the green.`,
      rating: "🟢 Strong Bullish Bias",
      score: 8.0,
    };
  } else if (Math.abs(greenRatio - redRatio) < 0.2) {
    generalBias = {
      interpretation: `The market is mixed, with a relatively even split between green and red coins, indicating indecision.`,
      rating: "🟡 Mixed Bias",
      score: 5.0,
    };
  } else {
    generalBias = {
      interpretation: `The market shows a slight bias, but no strong overall trend is dominant.`,
      rating: "⚪ Neutral Bias",
      score: 6.0,
    };
  }

  // --- 2. Funding Sentiment Imbalance ---
  let fundingImbalance: SentimentResult;
  const { greenFundingNegative, redFundingPositive } = fundingStats; // Using more descriptive names

  if (redFundingPositive > greenFundingNegative * 2 && redFundingPositive > 100) {
    fundingImbalance = {
      interpretation: "In the red group, longs are massively funding shorts while price is falling → trapped bulls. Green group shows small bullish squeeze potential, but it’s too small to shift momentum.",
      rating: "🔴 Bearish Trap Dominance",
      score: 9.0,
    };
  } else if (greenFundingNegative > redFundingPositive * 2 && greenFundingNegative > 50) {
    fundingImbalance = {
      interpretation: "In the green group, shorts are heavily funding longs while price is rising → strong short squeeze potential. Red group shows limited long trap risk.",
      rating: "🟢 Bullish Squeeze Dominance",
      score: 8.5,
    };
  } else {
    fundingImbalance = {
      interpretation: "Funding sentiment is relatively balanced or shows no extreme imbalance, suggesting a less clear directional bias from funding.",
      rating: "⚪ Balanced Funding",
      score: 5.0,
    };
  }

  // --- 3. Short Squeeze Candidates (from combinedData in MarketStats) ---
  let shortSqueeze: SentimentResult;
  const topShortSqueezeCandidates = volumeData
    .filter((d) => d.priceChange > 0 && d.fundingRate < 0)
    .sort((a, b) => a.fundingRate - b.fundingRate) // Sort by most negative funding
    .slice(0, 5);

  const volumeThreshold = 50_000_000; // Define or pass as param
  const highPriceChangeThreshold = 5; // Define or pass as param

  if (topShortSqueezeCandidates.length > 0) {
    const strongShortSqueezeCandidates = topShortSqueezeCandidates.filter(d => d.volume > volumeThreshold * 2 && d.priceChange > highPriceChangeThreshold);
    if (strongShortSqueezeCandidates.length >= 3) {
      shortSqueeze = {
        interpretation: "These coins show strong potential for short squeezes (shorts paying while price rises). The presence of high volume and significant price increases indicates a more impactful squeeze.",
        rating: "🟢 Strong Bullish Pockets",
        score: 8.0,
      };
    } else {
      shortSqueeze = {
        interpretation: "These coins show potential short squeezes (shorts paying while price rises), but they might be isolated or lack significant volume/price movement to drive broader momentum.",
        rating: "🟢 Bullish Pockets (Isolated)",
        score: 6.5,
      };
    }
  } else {
    shortSqueeze = {
      interpretation: "No strong short squeeze candidates identified at this moment. The market lacks significant price increases accompanied by negative funding rates.",
      rating: "⚪ No Squeeze Candidates",
      score: 4.0,
    };
  }

  // --- 4. Long Trap Candidates (from combinedData in MarketStats) ---
  let longTrap: SentimentResult;
  const topLongTrapCandidates = volumeData
    .filter((d) => d.priceChange < 0 && d.fundingRate > 0)
    .sort((a, b) => b.fundingRate - a.fundingRate) // Sort by most positive funding
    .slice(0, 5);

  if (topLongTrapCandidates.length > 0) {
    const severeLongTrapCandidates = topLongTrapCandidates.filter(d => d.volume > volumeThreshold * 2 && d.priceChange < -highPriceChangeThreshold);
    if (severeLongTrapCandidates.length >= 3) {
      longTrap = {
        interpretation: "These coins show clear bear momentum with positive funding, meaning longs are heavily trapped. The combination of significant price drops and high volume makes them classic liquidation magnets and indicates deeper sell-off risk.",
        rating: "🔴 High Risk (Severe Long Trap)",
        score: 9.5,
      };
    } else {
      longTrap = {
        interpretation: "These coins show clear bear momentum with positive funding, meaning longs are trapped. While present, they might be isolated or have lower volume/less extreme price drops, indicating moderate risk.",
        rating: "🔴 High Risk (Moderate Long Trap)",
        score: 7.5,
      };
    }
  } else {
    longTrap = {
      interpretation: "No strong long trap candidates identified at this moment. The market is not showing significant price drops accompanied by positive funding rates, which is a positive sign for longs.",
      rating: "⚪ No Trap Candidates",
      score: 4.0,
    };
  }

  // --- 5. Overall Volume Sentiment ---
  let volumeSentiment: SentimentResult;
  const totalBullishVolume = volumeData
    .filter(item => item.priceChange >= 0)
    .reduce((sum, item) => sum + item.volume, 0);

  const totalBearishVolume = volumeData
    .filter(item => item.priceChange < 0)
    .reduce((sum, item) => sum + item.volume, 0);

  if (totalBullishVolume === 0 && totalBearishVolume === 0) {
    volumeSentiment = {
      rating: "⚪ Neutral Volume Bias",
      interpretation: "No significant volume data available to determine directional bias.",
      score: 5.0,
    };
  } else if (totalBullishVolume > totalBearishVolume * 1.3) {
    volumeSentiment = {
      rating: "🟢 Buyer-Dominated Volume",
      interpretation: "Significantly more trading volume is associated with price increases, suggesting strong buyer conviction.",
      score: 7.5,
    };
  } else if (totalBearishVolume > totalBullishVolume * 1.3) {
    volumeSentiment = {
      rating: "🔴 Seller-Dominated Volume",
      interpretation: "A higher proportion of trading volume occurs during price declines, indicating strong selling pressure.",
      score: 8.0,
    };
  } else if (totalBullishVolume > totalBearishVolume * 1.1) {
    volumeSentiment = {
      rating: "🟡 Slight Bullish Volume Bias",
      interpretation: "Volume slightly favors price increases, but not decisively so.",
      score: 6.0,
    };
  } else if (totalBearishVolume > totalBullishVolume * 1.1) {
    volumeSentiment = {
      rating: "🟡 Slight Bearish Volume Bias",
      interpretation: "Volume slightly favors price decreases, but without strong conviction.",
      score: 6.5,
    };
  } else {
    volumeSentiment = {
      rating: "⚪ Neutral Volume Bias",
      interpretation: "Volume flow is balanced, indicating no strong directional consensus from traders based on recent price movements.",
      score: 5.0,
    };
  }

  // --- NEW: Speculative Interest (Open Interest) Analysis ---
  let speculativeInterest: SentimentResult;
  const totalOpenInterest = volumeData.reduce((sum, item) => sum + (item.openInterest || 0), 0);
  const avgOpenInterestPerCoin = totalOpenInterest / totalCoins;

  // Simple interpretation for now: large increase/decrease, or high vs low overall
  // A more advanced analysis would compare current OI to historical average/std dev
  if (totalOpenInterest > 1_000_000_000) { // Example threshold: > $1 Billion total OI
    speculativeInterest = {
      rating: "📈 High Speculative Interest",
      interpretation: "Overall Open Interest is significantly high, indicating strong trader commitment and potentially larger moves if positions unwind.",
      score: 7.0,
    };
  } else if (totalOpenInterest < 100_000_000) { // Example threshold: < $100 Million total OI
    speculativeInterest = {
      rating: "📉 Low Speculative Interest",
      interpretation: "Open Interest is relatively low, suggesting reduced trader participation or post-liquidation calmness.",
      score: 3.0,
    };
  } else {
    speculativeInterest = {
      rating: "↔️ Moderate Speculative Interest",
      interpretation: "Open Interest is at a moderate level, indicating typical market activity without extreme commitment.",
      score: 5.0,
    };
  }

  // --- NEW: Liquidation Heatmap (Placeholder for now) ---
  // This would require fetching actual liquidation data from Binance, which is
  // typically provided via a WebSocket or a specific API endpoint that lists liquidations.
  // For demonstration, we'll keep it as a placeholder.
  let liquidationHeatmap: SentimentResult = {
    rating: "⚪ Liquidation Data N/A",
    interpretation: "Liquidation data is not yet integrated or available. Cannot assess liquidation impact.",
    score: 5.0,
  };
  // If you integrate liquidation data, you'd process:
  // const highLiquidations = volumeData.filter(v => (v.liquidationVolume ?? 0) > 10_000_000);
  // Then assign rating, interpretation, and score based on liquidation volume/frequency.

  // --- NEW: Momentum Imbalance (RSI) ---
  let momentumImbalance: SentimentResult;
  const overheatedRSI = volumeData.filter(v => v.rsi !== undefined && v.rsi > 70).length;
  const oversoldRSI = volumeData.filter(v => v.rsi !== undefined && v.rsi < 30).length;
  const totalRsiCoins = volumeData.filter(v => v.rsi !== undefined).length;

  if (totalRsiCoins > 0) {
    if (overheatedRSI / totalRsiCoins > 0.3) { // More than 30% of coins are overheated
      momentumImbalance = {
        rating: "🔴 Overheated Market Risk",
        interpretation: "A significant number of coins are in overbought territory, increasing the risk of a market correction.",
        score: 7.5,
      };
    } else if (oversoldRSI / totalRsiCoins > 0.3) { // More than 30% of coins are oversold
      momentumImbalance = {
        rating: "🟢 Oversold Bounce Potential",
        interpretation: "Many coins are in oversold territory, suggesting potential for a technical bounce or reversal.",
        score: 7.0,
      };
    } else {
      momentumImbalance = {
        rating: "↔️ Balanced Momentum",
        interpretation: "Momentum indicators across the market are relatively balanced, with no strong overbought or oversold conditions dominating.",
        score: 5.0,
      };
    }
  } else {
    momentumImbalance = {
      rating: "⚪ Momentum Data N/A",
      interpretation: "RSI data not available for analysis.",
      score: 5.0,
    };
  }

  // --- Placeholder for other new indicators ---
  // Multi-Candle Trap/Squeeze (requires more historical data and pattern recognition)
  // Order Book Depth / Buy-Sell Wall Imbalance (requires order book snapshot API)
  // Historical Context (Replay of Similar Days) (requires historical data storage and comparison logic)
  // Social Sentiment (requires external APIs or scraping)
  // Volume-to-Marketcap Ratio (requires market cap data)


  // --- Overall Sentiment Accuracy ---
  let overallSentimentAccuracy = "";
  if (generalBias.score >= 7.0 && fundingImbalance.score >= 7.0 && shortSqueeze.score >= 7.0 && volumeSentiment.score >= 7.0 && speculativeInterest.score >= 6.0 && momentumImbalance.score >= 6.0) {
    overallSentimentAccuracy = "✅ Bullish Confirmation: All major indicators align for a bullish outlook.";
  } else if (generalBias.score <= 5.0 && fundingImbalance.score >= 8.0 && longTrap.score >= 8.0 && volumeSentiment.score >= 7.5 && speculativeInterest.score <= 4.0 && momentumImbalance.score >= 7.0) {
    overallSentimentAccuracy = "✅ Bearish Confirmation: Strong indicators point to a bearish market.";
  } else if (generalBias.score === 5.0 && fundingImbalance.score === 5.0 && volumeSentiment.score === 5.0 && speculativeInterest.score === 5.0 && momentumImbalance.score === 5.0) {
    overallSentimentAccuracy = "🟡 Mixed Signals: Market is indecisive with conflicting data points.";
  } else {
    overallSentimentAccuracy = "💡 Neutral. The sentiment is currently neutral, awaiting clearer market direction or mixed signals are present.";
  }


  return {
    generalBias,
    fundingImbalance,
    shortSqueeze,
    longTrap,
    volumeSentiment,
    speculativeInterest, // NEW
    liquidationHeatmap, // NEW
    momentumImbalance, // NEW
    overallSentimentAccuracy,
    // Note: overallMarketOutlook is still calculated in the main component as it aggregates these scores.
  };
}
