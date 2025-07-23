// src/utils/sentimentAnalyzer.ts

import { MarketStats, SentimentResult, SymbolAnalysisData, AggregatedLiquidationData } from '../types'; // Import all types from central file

export function analyzeSentiment(stats: MarketStats) {
  const { green, red, fundingStats, volumeData, liquidationData } = stats; // Destructure liquidationData
  const totalCoins = green + red;

  // Handle case with no coins to prevent division by zero
  if (totalCoins === 0) {
    return {
      generalBias: { rating: "⚪ No Data", interpretation: "No market data available for analysis.", score: 5.0 },
      fundingImbalance: { rating: "⚪ No Data", interpretation: "No funding data available.", score: 5.0 },
      shortSqueezeCandidates: { rating: "⚪ No Data", interpretation: "No data for squeeze candidates.", score: 5.0 },
      longTrapCandidates: { rating: "⚪ No Data", interpretation: "No data for trap candidates.", score: 5.0 },
      volumeSentiment: { rating: "⚪ No Data", interpretation: "No volume data available.", score: 5.0 },
      speculativeInterest: { rating: "⚪ No Data", interpretation: "No Open Interest data available.", score: 5.0 },
      liquidationHeatmap: { rating: "⚪ No Data", interpretation: "No liquidation data available.", score: 5.0 },
      momentumImbalance: { rating: "⚪ No Data", interpretation: "No momentum data available.", score: 5.0 },
      overallSentimentAccuracy: "🔴 Critical: No market data.",
      overallMarketOutlook: { score: 0, tone: "🔴 Critical — No data to analyze market outlook.", strategySuggestion: "Wait for data to load." },
    };
  }

  // --- 1. General Market Bias ---
  let generalBias: SentimentResult;
  const greenRatio = totalCoins > 0 ? green / totalCoins : 0;
  const redRatio = totalCoins > 0 ? red / totalCoins : 0;

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
  const { greenFundingNegative, redFundingPositive } = fundingStats;

  const totalRelevantFunding = greenFundingNegative + redFundingPositive;

  // Use a relative threshold based on total funding volume or absolute.
  if (totalRelevantFunding > 50) { // Only analyze if there's significant funding activity
    if (redFundingPositive > greenFundingNegative * 2) {
      fundingImbalance = {
        interpretation: "In the red group, longs are massively funding shorts while price is falling → trapped bulls. Green group shows small bullish squeeze potential, but it’s too small to shift momentum.",
        rating: "🔴 Bearish Trap Dominance",
        score: 9.0,
      };
    } else if (greenFundingNegative > redFundingPositive * 2) {
      fundingImbalance = {
        interpretation: "In the green group, shorts are heavily funding longs while price is rising → strong short squeeze potential. Red group shows limited long trap risk.",
        rating: "🟢 Bullish Squeeze Dominance",
        score: 8.5,
      };
    } else {
      fundingImbalance = {
        interpretation: "Funding sentiment is relatively balanced or shows no extreme imbalance, suggesting a less clear directional bias from funding.",
        rating: "↔️ Balanced Funding",
        score: 5.0,
      };
    }
  } else {
    fundingImbalance = {
      interpretation: "Low funding activity, no strong directional bias from funding rates.",
      rating: "⚪ Low Funding Activity",
      score: 5.0,
    };
  }


  // --- 3. Short Squeeze Candidates (from combinedData in MarketStats) ---
  let shortSqueezeCandidates: SentimentResult;
  const topShortSqueezeList = volumeData
    .filter((d) => d.priceChange > 0 && d.fundingRate < 0)
    .sort((a, b) => a.fundingRate - b.fundingRate) // Sort by most negative funding
    .slice(0, 5); // Keep top 5

  const volumeThreshold = 50_000_000; // Define or pass as param
  const highPriceChangeThreshold = 5; // Define or pass as param

  if (topShortSqueezeList.length > 0) {
    const strongShortSqueezeCandidatesCount = topShortSqueezeList.filter(d => d.volume > volumeThreshold * 2 && d.priceChange > highPriceChangeThreshold).length;
    if (strongShortSqueezeCandidatesCount >= 3) {
      shortSqueezeCandidates = {
        interpretation: "These coins show strong potential for short squeezes (shorts paying while price rises). The presence of high volume and significant price increases indicates a more impactful squeeze.",
        rating: "🟢 Strong Bullish Pockets",
        score: 8.0,
      };
    } else {
      shortSqueezeCandidates = {
        interpretation: "These coins show potential short squeezes (shorts paying while price rises), but they might be isolated or lack significant volume/price movement to drive broader momentum.",
        rating: "🟢 Bullish Pockets (Isolated)",
        score: 6.5,
      };
    }
  } else {
    shortSqueezeCandidates = {
      interpretation: "No strong short squeeze candidates identified at this moment. The market lacks significant price increases accompanied by negative funding rates.",
      rating: "⚪ No Squeeze Candidates",
      score: 4.0,
    };
  }

  // --- 4. Long Trap Candidates (from combinedData in MarketStats) ---
  let longTrapCandidates: SentimentResult;
  const topLongTrapList = volumeData
    .filter((d) => d.priceChange < 0 && d.fundingRate > 0)
    .sort((a, b) => b.fundingRate - a.fundingRate) // Sort by most positive funding
    .slice(0, 5); // Keep top 5

  if (topLongTrapList.length > 0) {
    const severeLongTrapCandidatesCount = topLongTrapList.filter(d => d.volume > volumeThreshold * 2 && d.priceChange < -highPriceChangeThreshold).length;
    if (severeLongTrapCandidatesCount >= 3) {
      longTrapCandidates = {
        interpretation: "These coins show clear bear momentum with positive funding, meaning longs are heavily trapped. The combination of significant price drops and high volume makes them classic liquidation magnets and indicates deeper sell-off risk.",
        rating: "🔴 High Risk (Severe Long Trap)",
        score: 9.5,
      };
    } else {
      longTrapCandidates = {
        interpretation: "These coins show clear bear momentum with positive funding, meaning longs are trapped. While present, they might be isolated or have lower volume/less extreme price drops, indicating moderate risk.",
        rating: "🔴 High Risk (Moderate Long Trap)",
        score: 7.5,
      };
    }
  } else {
    longTrapCandidates = {
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
      rating: "↔️ Neutral Volume Bias", // Changed from ⚪ to ↔️ for clearer distinction
      interpretation: "Volume flow is balanced, indicating no strong directional consensus from traders based on recent price movements.",
      score: 5.0,
    };
  }

  // --- NEW: Speculative Interest (Open Interest) Analysis ---
  let speculativeInterest: SentimentResult;
  const totalOpenInterest = volumeData.reduce((sum, item) => sum + (item.openInterest || 0), 0);

  if (totalOpenInterest > 1_000_000_000) { // Example threshold: > $1 Billion total OI
    speculativeInterest = {
      rating: "📈 High Speculative Interest",
      interpretation: "Overall Open Interest is significantly high, indicating strong trader commitment and potentially larger moves if positions unwind. Be prepared for volatility around key levels.",
      score: 7.0,
    };
  } else if (totalOpenInterest < 100_000_000) { // Example threshold: < $100 Million total OI
    speculativeInterest = {
      rating: "📉 Low Speculative Interest",
      interpretation: "Open Interest is relatively low, suggesting reduced trader participation or post-liquidation calmness. Market might be in a consolidation phase.",
      score: 3.0,
    };
    // Prioritize low OI if it's exceptionally low
    if (totalOpenInterest < 10_000_000 && totalCoins > 0) {
        speculativeInterest.interpretation += " Extremely low OI might mean very low liquidity or a post-event calm. Avoid large positions.";
        speculativeInterest.score = 2.0;
    }
  } else {
    speculativeInterest = {
      rating: "↔️ Moderate Speculative Interest",
      interpretation: "Open Interest is at a moderate level, indicating typical market activity without extreme commitment. Liquidity might be average.",
      score: 5.0,
    };
  }

  // --- NEW: Liquidation Heatmap Analysis ---
  let liquidationHeatmap: SentimentResult;

  if (liquidationData) {
    const { totalLongLiquidationsUSD, totalShortLiquidationsUSD, longLiquidationCount, shortLiquidationCount } = liquidationData;
    const totalLiquidationVolume = totalLongLiquidationsUSD + totalShortLiquidationsUSD;

    // Define thresholds for significant liquidation activity
    const significantLiquidationVolumeThreshold = 5_000_000; // Example: $5 Million in total liquidations
    const highLiquidationCountThreshold = 50; // Example: 50 individual liquidation events

    if (totalLiquidationVolume > significantLiquidationVolumeThreshold || longLiquidationCount > highLiquidationCountThreshold || shortLiquidationCount > highLiquidationCountThreshold) {
      if (totalLongLiquidationsUSD > totalShortLiquidationsUSD * 1.5) {
        liquidationHeatmap = {
          rating: "🔴 Bearish Pressure (Long Squeeze)",
          interpretation: `Significant long liquidations ($${(totalLongLiquidationsUSD / 1_000_000).toFixed(1)}M USD) indicate strong selling pressure and trapped long positions. Potential for further downside as stop losses are triggered.`,
          score: 8.5,
        };
      } else if (totalShortLiquidationsUSD > totalLongLiquidationsUSD * 1.5) {
        liquidationHeatmap = {
          rating: "🟢 Bullish Potential (Short Squeeze)",
          interpretation: `Notable short liquidations ($${(totalShortLiquidationsUSD / 1_000_000).toFixed(1)}M USD) suggest strong buying pressure and potential for short squeezes, pushing prices higher.`,
          score: 8.0,
        };
      } else {
        liquidationHeatmap = {
          rating: "🟡 High Volatility (Balanced Liquidations)",
          interpretation: `High liquidation activity ($${(totalLiquidationVolume / 1_000_000).toFixed(1)}M USD) with a relatively even split between long and short liquidations. This suggests high volatility and indecision at current price levels.`,
          score: 6.0,
        };
      }
    } else {
      liquidationHeatmap = {
        rating: "⚪ Low Liquidation Activity",
        interpretation: "Current liquidation volume is low, indicating less market volatility driven by forced closures. Prices might be consolidating.",
        score: 5.0,
      };
    }
  } else {
    liquidationHeatmap = {
      rating: "⚪ Liquidation Data N/A",
      interpretation: "Liquidation data is not available or integrated. Cannot assess liquidation impact.",
      score: 5.0,
    };
  }

  // --- NEW: Momentum Imbalance (RSI) ---
  let momentumImbalance: SentimentResult;
  const totalRsiCoins = volumeData.filter(v => v.rsi !== undefined).length;
  const overheatedRSI = volumeData.filter(v => v.rsi !== undefined && v.rsi > 70).length;
  const oversoldRSI = volumeData.filter(v => v.rsi !== undefined && v.rsi < 30).length;


  if (totalRsiCoins > 0) {
    if (overheatedRSI / totalRsiCoins > 0.3) {
      momentumImbalance = {
        rating: "🔴 Overheated Market Risk",
        interpretation: "A significant number of coins are in overbought territory, increasing the risk of a market correction or pullback.",
        score: 7.5,
      };
    } else if (oversoldRSI / totalRsiCoins > 0.3) {
      momentumImbalance = {
        rating: "🟢 Oversold Bounce Potential",
        interpretation: "Many coins are in oversold territory, suggesting potential for a technical bounce or reversal, offering buying opportunities.",
        score: 7.0,
      };
    } else {
      momentumImbalance = {
        rating: "↔️ Balanced Momentum",
        interpretation: "Momentum indicators across the market are relatively balanced, with no strong overbought or oversold conditions dominating. Market is in a healthy range.",
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

  // --- Overall Sentiment Accuracy ---
  let overallSentimentAccuracy = "";
  // Adjust thresholds as needed for your desired accuracy interpretation
  const bullishScoreThreshold = 7.0;
  const bearishScoreThreshold = 7.0; // Can be different if bearish signals are weighted differently
  const neutralScoreRange = { min: 4.5, max: 5.5 };

  const isBullishAligned = generalBias.score >= bullishScoreThreshold &&
                           fundingImbalance.score >= bullishScoreThreshold &&
                           shortSqueezeCandidates.score >= bullishScoreThreshold &&
                           volumeSentiment.score >= bullishScoreThreshold &&
                           speculativeInterest.score >= 6.0 &&
                           momentumImbalance.score >= 6.0 &&
                           liquidationHeatmap.score >= 6.0;

  const isBearishAligned = generalBias.score <= (10 - bearishScoreThreshold) && // Inverse for bearish scores
                           fundingImbalance.score >= bearishScoreThreshold &&
                           longTrapCandidates.score >= bearishScoreThreshold &&
                           volumeSentiment.score >= bearishScoreThreshold &&
                           speculativeInterest.score <= 4.0 &&
                           momentumImbalance.score >= bearishScoreThreshold && // Momentum bearish (high RSI implies reversal down)
                           liquidationHeatmap.score >= bearishScoreThreshold;

  const isMixedAligned = generalBias.score > neutralScoreRange.min && generalBias.score < neutralScoreRange.max &&
                         fundingImbalance.score > neutralScoreRange.min && fundingImbalance.score < neutralScoreRange.max &&
                         volumeSentiment.score > neutralScoreRange.min && volumeSentiment.score < neutralScoreRange.max &&
                         speculativeInterest.score > neutralScoreRange.min && speculativeInterest.score < neutralScoreRange.max &&
                         momentumImbalance.score > neutralScoreRange.min && momentumImbalance.score < neutralScoreRange.max &&
                         liquidationHeatmap.score > neutralScoreRange.min && liquidationHeatmap.score < neutralScoreRange.max;

  if (isBullishAligned) {
    overallSentimentAccuracy = "✅ Bullish Confirmation: All major indicators align for a bullish outlook.";
  } else if (isBearishAligned) {
    overallSentimentAccuracy = "✅ Bearish Confirmation: Strong indicators point to a bearish market.";
  } else if (isMixedAligned) {
    overallSentimentAccuracy = "🟡 Mixed Signals: Market is indecisive with conflicting data points.";
  } else {
    overallSentimentAccuracy = "💡 Neutral/Unclear: The sentiment is currently neutral, awaiting clearer market direction or mixed signals are present.";
  }

  return {
    generalBias,
    fundingImbalance,
    shortSqueezeCandidates,
    longTrapCandidates,
    volumeSentiment,
    speculativeInterest,
    liquidationHeatmap,
    momentumImbalance,
    overallSentimentAccuracy,
    // overallMarketOutlook is still calculated in the main component (PriceFundingTracker)
  };
}
