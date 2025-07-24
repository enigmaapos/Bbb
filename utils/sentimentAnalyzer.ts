// utils/sentimentAnalyzer.ts
import { MarketStats, MarketAnalysisResults, SentimentRating, SentimentSignal } from "../types";

export const analyzeSentiment = (stats: MarketStats): MarketAnalysisResults => {
  // Initialize all sentiment ratings
  const defaultSentiment: SentimentRating = { rating: "Neutral", interpretation: "No clear bias.", score: 5.0 };

  let generalBias: SentimentRating = { ...defaultSentiment };
  let fundingImbalance: SentimentRating = { ...defaultSentiment };
  let shortSqueezeCandidates: SentimentRating = { ...defaultSentiment };
  let longTrapCandidates: SentimentRating = { ...defaultSentiment };
  let volumeSentiment: SentimentRating = { ...defaultSentiment };
  let liquidationHeatmap: SentimentRating = { ...defaultSentiment };
  let highQualityBreakout: SentimentRating = { ...defaultSentiment };
  let flaggedSignalSentiment: SentimentRating = { ...defaultSentiment };

  // --- General Bias ---
  if (stats.green > stats.red * 1.5) { // Significantly more green
    generalBias = {
      rating: "Strongly Bullish",
      interpretation: "A large majority of assets are green, pointing to significant buying pressure and bullish sentiment.",
      score: 8.0,
    };
  } else if (stats.green > stats.red) { // More green
    generalBias = {
      rating: "Mildly Bullish",
      interpretation: "More assets are green than red, indicating a slight bullish tilt.",
      score: 6.5,
    };
  } else if (stats.red > stats.green * 1.5) { // Significantly more red
    generalBias = {
      rating: "Strongly Bearish",
      interpretation: "A large majority of assets are red, pointing to significant selling pressure and bearish sentiment.",
      score: 2.0,
    };
  } else if (stats.red > stats.green) { // More red
    generalBias = {
      rating: "Mildly Bearish",
      interpretation: "More assets are red than green, indicating a slight bearish tilt.",
      score: 3.5,
    };
  }


  // --- Funding Imbalance ---
  // FIX: Access properties through stats.fundingStats
  const totalPositiveFunding = stats.fundingStats.greenPositiveFunding + stats.fundingStats.redPositiveFunding;
  const totalNegativeFunding = stats.fundingStats.greenNegativeFunding + stats.fundingStats.redNegativeFunding;

  if (totalPositiveFunding > totalNegativeFunding * 2) {
    fundingImbalance = {
      rating: "Strong Bearish Funding Imbalance",
      interpretation: "A very large number of longs are paying, especially on falling assets, indicating extreme long trap potential.",
      score: 2.0,
    };
  } else if (totalPositiveFunding > totalNegativeFunding * 1.2) {
    fundingImbalance = {
      rating: "Bearish Funding Imbalance",
      interpretation: "A large number of longs are paying, especially on falling assets, indicating significant long trap potential.",
      score: 3.0,
    };
  } else if (totalNegativeFunding > totalPositiveFunding * 2) {
    fundingImbalance = {
      rating: "Strong Bullish Funding Imbalance",
      interpretation: "A very large number of shorts are paying, especially on rising assets, indicating extreme short squeeze potential.",
      score: 8.0,
    };
  } else if (totalNegativeFunding > totalPositiveFunding * 1.2) {
    fundingImbalance = {
      rating: "Bullish Funding Imbalance",
      interpretation: "A large number of shorts are paying, especially on rising assets, indicating significant short squeeze potential.",
      score: 7.0,
    };
  }

  // --- Short Squeeze Candidates ---
  // FIX: Access properties through stats.fundingStats
  const shortSqueezeCount = stats.fundingStats.greenNegativeFunding; // This assumes greenNegativeFunding is a good proxy for short squeeze candidates.
                                                                     // You might refine this later based on specific criteria from your flaggedSignals.
  if (shortSqueezeCount > 15) { // Example threshold
    shortSqueezeCandidates = {
      rating: "High Squeeze Potential",
      interpretation: "A significant number of assets are showing strong short squeeze setups, where price is rising and shorts are paying heavily.",
      score: 8.5,
    };
  } else if (shortSqueezeCount > 5) {
    shortSqueezeCandidates = {
      rating: "Moderate Squeeze Potential",
      interpretation: "A fair number of assets are showing short squeeze setups.",
      score: 7.0,
    };
  } else if (shortSqueezeCount > 0) {
    shortSqueezeCandidates = {
      rating: "Low Squeeze Potential",
      interpretation: "Few assets currently meet the criteria for short squeeze setups.",
      score: 5.5,
    };
  } else {
    shortSqueezeCandidates = {
      rating: "No Clear Squeeze Potential",
      interpretation: "No assets currently meet the criteria for short squeeze setups.",
      score: 4.0,
    };
  }

  // --- Long Trap Risk ---
  // FIX: Access properties through stats.fundingStats
  const longTrapCount = stats.fundingStats.redPositiveFunding; // This assumes redPositiveFunding is a good proxy for long trap candidates.
                                                               // You might refine this later based on specific criteria from your flaggedSignals.
  if (longTrapCount > 15) { // Example threshold
    longTrapCandidates = {
      rating: "High Long Trap Risk",
      interpretation: "Many assets are falling with positive funding, indicating trapped longs and potential for cascades.",
      score: 2.0,
    };
  } else if (longTrapCount > 5) {
    longTrapCandidates = {
      rating: "Moderate Long Trap Risk",
      interpretation: "Some assets are showing long trap characteristics, proceed with caution.",
      score: 3.5,
    };
  } else if (longTrapCount > 0) {
    longTrapCandidates = {
      rating: "Low Long Trap Risk",
      interpretation: "Few assets are currently showing strong long trap characteristics.",
      score: 6.0,
    };
  } else {
    longTrapCandidates = {
      rating: "No Significant Long Trap Risk",
      interpretation: "No assets are currently showing significant long trap characteristics.",
      score: 7.5,
    };
  }

  // --- Volume Sentiment ---
  const totalVolume = stats.volumeData.reduce((sum, d) => sum + d.volume, 0);
  const greenVolume = stats.volumeData
    .filter(d => d.priceChange >= 0)
    .reduce((sum, d) => sum + d.volume, 0);
  const redVolume = stats.volumeData
    .filter(d => d.priceChange < 0)
    .reduce((sum, d) => sum + d.volume, 0);

  if (greenVolume > redVolume * 1.5) {
    volumeSentiment = {
      rating: "Bullish Volume",
      interpretation: "Dominant buying volume on rising assets, confirming uptrends.",
      score: 8.0,
    };
  } else if (redVolume > greenVolume * 1.5) {
    volumeSentiment = {
      rating: "Bearish Volume",
      interpretation: "Heavy selling volume on declining assets, confirming downtrends and capitulation.",
      score: 3.0,
    };
  } else {
    volumeSentiment = {
      rating: "Mixed Volume",
      interpretation: "Volume is balanced between buying and selling, suggesting consolidation or indecision.",
      score: 5.0,
    };
  }

  // --- Liquidation Sentiment ---
  if (stats.liquidationData) {
    const { totalLongLiquidationsUSD, totalShortLiquidationsUSD } = stats.liquidationData;
    const totalLiquidations = totalLongLiquidationsUSD + totalShortLiquidationsUSD;

    if (totalLiquidations > 0) {
      const longLiquidationRatio = totalLongLiquidationsUSD / totalLiquidations;
      const shortLiquidationRatio = totalShortLiquidationsUSD / totalLiquidations;

      if (longLiquidationRatio > 0.7) { // Overwhelming long liquidations
        liquidationHeatmap = {
          rating: "Dominant Long Liquidations",
          interpretation: "Overwhelming long liquidations suggest a strong bearish push or cascading sell-offs.",
          score: 2.0,
        };
      } else if (shortLiquidationRatio > 0.7) { // Overwhelming short liquidations
        liquidationHeatmap = {
          rating: "Dominant Short Liquidations",
          interpretation: "Overwhelming short liquidations suggest a strong bullish push or short squeeze.",
          score: 8.0,
        };
      } else if (longLiquidationRatio > 0.5) { // More long liquidations
        liquidationHeatmap = {
          rating: "More Long Liquidations",
          interpretation: "More long liquidations than short, indicating some bearish pressure.",
          score: 4.0,
        };
      } else if (shortLiquidationRatio > 0.5) { // More short liquidations
        liquidationHeatmap = {
          rating: "More Short Liquidations",
          interpretation: "More short liquidations than long, indicating some bullish pressure.",
          score: 6.0,
        };
      } else {
        liquidationHeatmap = {
          rating: "Balanced Liquidations",
          interpretation: "Long and short liquidations are relatively balanced, indicating mixed market forces.",
          score: 5.0,
        };
      }
    } else {
      liquidationHeatmap = {
        rating: "No Recent Liquidations",
        interpretation: "No significant liquidation data available in the recent period.",
        score: 5.0,
      };
    }
  }

  // --- High Quality Breakout (Placeholder - requires more complex logic) ---
  // This would typically involve analyzing chart patterns, volume surges on breakouts, etc.
  // For now, it's a placeholder.
  highQualityBreakout = {
    rating: "No Clear Breakouts Detected",
    interpretation: "No immediate high-quality breakout patterns are broadly apparent across the market.",
    score: 5.0,
  };


  // --- Flagged Signal Sentiment ---
  const bullishSignals = stats.flaggedSignals.filter(s => s.signal === 'Bullish Opportunity').length;
  const bearishSignals = stats.flaggedSignals.filter(s => s.signal === 'Bearish Risk').length;
  const totalFlagged = bullishSignals + bearishSignals;

  if (totalFlagged === 0) {
    flaggedSignalSentiment = {
      rating: "No Strong Signals",
      interpretation: "The automated checklist did not identify significant bullish or bearish opportunities.",
      score: 5.0,
    };
  } else if (bullishSignals > bearishSignals * 2) {
    flaggedSignalSentiment = {
      rating: "Strong Bullish Signals",
      interpretation: "A high number of assets are flagged with strong bullish opportunities based on specific criteria.",
      score: 8.5,
    };
  } else if (bullishSignals > bearishSignals) {
    flaggedSignalSentiment = {
      rating: "Moderate Bullish Signals",
      interpretation: "More bullish opportunities are flagged than bearish risks.",
      score: 7.0,
    };
  } else if (bearishSignals > bullishSignals * 2) {
    flaggedSignalSentiment = {
      rating: "Strong Bearish Signals",
      interpretation: "A high number of assets are flagged with strong bearish risks based on specific criteria.",
      score: 2.0,
    };
  } else if (bearishSignals > bullishSignals) {
    flaggedSignalSentiment = {
      rating: "Moderate Bearish Signals",
      interpretation: "More bearish risks are flagged than bullish opportunities.",
      score: 3.5,
    };
  } else { // Equal or near equal
    flaggedSignalSentiment = {
      rating: "Mixed Flagged Signals",
      interpretation: "An equal or similar number of bullish and bearish signals are present.",
      score: 5.0,
    };
  }


  // --- Overall Sentiment Accuracy (Placeholder - more advanced logic needed) ---
  // This would ideally involve comparing predictions with actual market movements.
  const overallSentimentAccuracy = "Pending Historical Data Validation";


  // --- Overall Market Outlook Score Aggregation (already done in index.tsx) ---
  // The overall market outlook is calculated in the component itself.
  // So, we just return the individual sentiment ratings here.

  return {
    generalBias,
    fundingImbalance,
    shortSqueezeCandidates,
    longTrapCandidates,
    volumeSentiment,
    liquidationHeatmap,
    highQualityBreakout,
    flaggedSignalSentiment, // Ensure this is returned!
    overallSentimentAccuracy,
    // The overallMarketOutlook is computed in the component itself
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" }, // Placeholder, computed in index.tsx
  };
};
