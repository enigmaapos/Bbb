// src/utils/sentimentAnalyzer.ts
import {
  MarketStats,
  MarketAnalysisResults,
  AggregatedLiquidationData,
} from "../types";

export function analyzeSentiment(data: MarketStats): MarketAnalysisResults {
  const {
    green,
    red,
    // fundingStats, // This parameter is no longer directly used in the fundingImbalance logic, nor in the general sentiment calcs
    volumeData,
    liquidationData,
  } = data;

  const results: MarketAnalysisResults = {
    generalBias: { rating: "", interpretation: "", score: 0 },
    fundingImbalance: { rating: "", interpretation: "", score: 0 },
    shortSqueezeCandidates: { rating: "", interpretation: "", score: 0 },
    longTrapCandidates: { rating: "", interpretation: "", score: 0 },
    volumeSentiment: { rating: "", interpretation: "", score: 0 },
    liquidationHeatmap: { rating: "", interpretation: "", score: 0 },
    // momentumImbalance: { rating: "", interpretation: "", score: 0 }, // REMOVED
    overallSentimentAccuracy: "",
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" },
  };

  // --- 1. General Bias ---
  if (green > red * 1.5) {
    results.generalBias = {
      rating: "Strongly Bullish",
      interpretation: "Significantly more pairs are showing positive 24h price change.",
      score: 8.5,
    };
  } else if (red > green * 1.5) {
    results.generalBias = {
      rating: "Strongly Bearish",
      interpretation: "Significantly more pairs are showing negative 24h price change.",
      score: 2.5,
    };
  } else if (green > red) {
    results.generalBias = {
      rating: "Slightly Bullish",
      interpretation: "More pairs are showing positive 24h price change.",
      score: 6.5,
    };
  } else if (red > green) {
    results.generalBias = {
      rating: "Slightly Bearish",
      interpretation: "More pairs are showing negative 24h price change.",
      score: 4.5,
    };
  } else {
    results.generalBias = {
      rating: "Neutral",
      interpretation: "Even split between positive and negative price changes.",
      score: 5,
    };
  }

  // --- 2. Funding Imbalance (ONLY Custom Sentiment Formula) ---
  const priceUpFundingNegative = volumeData.filter(d => d.priceChange > 0 && d.fundingRate < 0).length;
  const priceDownFundingPositive = volumeData.filter(d => d.priceChange < 0 && d.fundingRate > 0).length;

  // Define thresholds based on your custom formula
  const BULLISH_PUN_THRESHOLD = 13; // Price Up Negative Funding (shorts paying) is small
  const BULLISH_PDP_THRESHOLD = 250; // Price Down Positive Funding (longs paying) is large

  const BEARISH_PUN_THRESHOLD = 250; // Price Up Negative Funding (shorts paying) is large
  const BEARISH_PDP_THRESHOLD = 13; // Price Down Positive Funding (longs paying) is small

  if (priceUpFundingNegative <= BULLISH_PUN_THRESHOLD && priceDownFundingPositive >= BULLISH_PDP_THRESHOLD) {
    results.fundingImbalance = {
      rating: "📈 Bullish Trap Squeeze",
      interpretation: `Many longs are trapped (${priceDownFundingPositive} pairs) while very few shorts are paying for rising prices (${priceUpFundingNegative} pairs). This suggests strong buying pressure and potential for a squeeze.`,
      score: 9.0,
    };
  } else if (priceUpFundingNegative >= BEARISH_PUN_THRESHOLD && priceDownFundingPositive <= BEARISH_PDP_THRESHOLD) {
    results.fundingImbalance = {
      rating: "📉 Bearish Trap Squeeze",
      interpretation: `Many shorts are trapped (${priceUpFundingNegative} pairs) while very few longs are paying for falling prices (${priceDownFundingPositive} pairs). This suggests a potential bearish reversal or capitulation.`,
      score: 1.0, // A low score for bearish
    };
  } else {
    // If neither specific trap squeeze condition is met, it's neutral
    results.fundingImbalance = {
      rating: "Neutral/Mixed Funding",
      interpretation: "Funding rates do not meet specific 'trap squeeze' criteria.",
      score: 5,
    };
  }

  // --- 3. Short Squeeze Candidates ---
  const shortSqueezeCount = volumeData.filter(d => d.priceChange > 0 && d.fundingRate < 0 && d.volume > 50_000_000).length;
  if (shortSqueezeCount > 10) {
    results.shortSqueezeCandidates = {
      rating: "High Potential",
      interpretation: `Many pairs (over ${shortSqueezeCount}) show price appreciation with negative funding, indicating shorts are being squeezed.`,
      score: 8,
    };
  } else if (shortSqueezeCount > 3) {
    results.shortSqueezeCandidates = {
      rating: "Moderate Potential",
      interpretation: `${shortSqueezeCount} pairs show signs of short squeezes.`,
      score: 6,
    };
  } else {
    results.shortSqueezeCandidates = {
      rating: "Low Potential",
      interpretation: "Few short squeeze setups observed.",
      score: 4,
    };
  }

  // --- 4. Long Trap Candidates ---
  const longTrapCount = volumeData.filter(d => d.priceChange < 0 && d.fundingRate > 0 && d.volume > 50_000_000).length;
  if (longTrapCount > 10) {
    results.longTrapCandidates = {
      rating: "High Risk",
      interpretation: `Many pairs (over ${longTrapCount}) show price depreciation with positive funding, indicating longs are trapped.`,
      score: 2,
    };
  } else if (longTrapCount > 3) {
    results.longTrapCandidates = {
      rating: "Moderate Risk",
      interpretation: `${longTrapCount} pairs show signs of long traps.`,
      score: 4,
    };
  } else {
    results.longTrapCandidates = {
      rating: "Low Risk",
      interpretation: "Few long trap setups observed.",
      score: 6,
    };
  }

  // --- 5. Volume Sentiment ---
  const bullishVolume = volumeData.filter(d => d.priceChange > 0 && d.volume > 100_000_000).length;
  const bearishVolume = volumeData.filter(d => d.priceChange < 0 && d.volume > 100_000_000).length;

  if (bullishVolume > bearishVolume * 2) {
    results.volumeSentiment = {
      rating: "Strong Bullish Volume",
      interpretation: "Significant volume flowing into rising assets, confirming upward momentum.",
      score: 7.5,
    };
  } else if (bearishVolume > bullishVolume * 2) {
    results.volumeSentiment = {
      rating: "Strong Bearish Volume",
      interpretation: "Significant volume flowing out of falling assets, confirming downward momentum.",
      score: 3.5,
    };
  } else {
    results.volumeSentiment = {
      rating: "Mixed Volume",
      interpretation: "Volume distribution is relatively balanced or not indicative of a strong trend.",
      score: 5,
    };
  }

  // --- 6. Liquidation Heatmap Sentiment ---
  if (liquidationData) {
    const { totalLongLiquidationsUSD, totalShortLiquidationsUSD } = liquidationData;
    const totalLiquidations = totalLongLiquidationsUSD + totalShortLiquidationsUSD;

    if (totalLiquidations > 0) {
      const longLiquidationRatio = totalLongLiquidationsUSD / totalLiquidations;
      const shortLiquidationRatio = totalShortLiquidationsUSD / totalLiquidations;

      if (longLiquidationRatio > 0.7) { // Over 70% long liquidations
        results.liquidationHeatmap = {
          rating: "Heavy Long Liquidations",
          interpretation: `A significant amount of long positions (${(longLiquidationRatio * 100).toFixed(0)}%) are being liquidated, indicating strong downward pressure.`,
          score: 1.5, // Very bearish
        };
      } else if (shortLiquidationRatio > 0.7) { // Over 70% short liquidations
        results.liquidationHeatmap = {
          rating: "Heavy Short Liquidations",
          interpretation: `A significant amount of short positions (${(shortLiquidationRatio * 100).toFixed(0)}%) are being liquidated, indicating strong upward pressure or short squeezes.`,
          score: 8.5, // Very bullish
        };
      } else {
        results.liquidationHeatmap = {
          rating: "Mixed Liquidations",
          interpretation: "Liquidation volume is relatively balanced between long and short positions, or overall volume is low.",
          score: 5,
        };
      }
    } else {
      results.liquidationHeatmap = {
        rating: "No Recent Liquidations",
        interpretation: "No significant liquidation events observed recently.",
        score: 5, // Neutral if no liquidations
      };
    }
  } else {
    results.liquidationHeatmap = {
      rating: "Data Unavailable",
      interpretation: "Liquidation data not yet available for sentiment analysis.",
      score: 5, // Neutral fallback
    };
  }

  // --- Momentum Imbalance (Removed as per user request for real data only) ---
  // The 'Momentum Imbalance' section using RSI has been completely removed.

  results.overallSentimentAccuracy = "Based on multiple indicators.";

  return results;
}
