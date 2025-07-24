// utils/sentimentAnalyzer.ts
import { MarketStats, MarketAnalysisResults, SentimentRating, SentimentSignal } from "../types";

// --- Configuration Constants for Sentiment Analysis ---
const BIAS_STRONG_THRESHOLD = 1.5; // e.g., green > red * 1.5
const BIAS_MILD_THRESHOLD = 1.0;   // e.g., green > red * 1.0

const FUNDING_STRONG_IMBALANCE_THRESHOLD = 2.0; // e.g., positive funding > negative funding * 2
const FUNDING_MILD_IMBALANCE_THRESHOLD = 1.2;    // e.g., positive funding > negative funding * 1.2

const SQUEEZE_HIGH_THRESHOLD = 15; // Number of green negative funding assets for "High Squeeze Potential"
const SQUEEZE_MODERATE_THRESHOLD = 5; // Number of green negative funding assets for "Moderate Squeeze Potential"

const TRAP_HIGH_THRESHOLD = 15; // Number of red positive funding assets for "High Long Trap Risk"
const TRAP_MODERATE_THRESHOLD = 5; // Number of red positive funding assets for "Moderate Long Trap Risk"

const VOLUME_STRONG_IMBALANCE_THRESHOLD = 1.5; // e.g., green volume > red volume * 1.5

const LIQUIDATION_DOMINANT_RATIO = 0.7; // Ratio for dominant liquidations (e.g., >70%)
const LIQUIDATION_MILD_IMBALANCE_RATIO = 0.5; // Ratio for mild imbalance (e.g., >50%)

const FLAG_STRONG_SIGNAL_RATIO = 2.0; // e.g., bullish flagged > bearish flagged * 2
const FLAG_MILD_SIGNAL_RATIO = 1.0;   // e.g., bullish flagged > bearish flagged * 1

// --- Main Sentiment Analysis Function ---
export const analyzeSentiment = (stats: MarketStats): MarketAnalysisResults => {
  const defaultSentiment: SentimentRating = { rating: "Neutral", interpretation: "No clear bias.", score: 5.0 };

  let generalBias: SentimentRating = { ...defaultSentiment };
  let fundingImbalance: SentimentRating = { ...defaultSentiment };
  let shortSqueezeCandidates: SentimentRating = { ...defaultSentiment };
  let longTrapCandidates: SentimentRating = { ...defaultSentiment };
  let volumeSentiment: SentimentRating = { ...defaultSentiment };
  let liquidationHeatmap: SentimentRating = { ...defaultSentiment };
  let highQualityBreakout: SentimentRating = { ...defaultSentiment };
  let flaggedSignalSentiment: SentimentRating = { ...defaultSentiment };

  // --- General Bias Analysis ---
  if (stats.green > stats.red * BIAS_STRONG_THRESHOLD) {
    generalBias = {
      rating: "Strongly Bullish",
      interpretation: "A large majority of assets are green, pointing to significant buying pressure and bullish sentiment.",
      score: 8.0,
    };
  } else if (stats.green > stats.red * BIAS_MILD_THRESHOLD) {
    generalBias = {
      rating: "Mildly Bullish",
      interpretation: "More assets are green than red, indicating a slight bullish tilt.",
      score: 6.5,
    };
  } else if (stats.red > stats.green * BIAS_STRONG_THRESHOLD) {
    generalBias = {
      rating: "Strongly Bearish",
      interpretation: "A large majority of assets are red, pointing to significant selling pressure and bearish sentiment.",
      score: 2.0,
    };
  } else if (stats.red > stats.green * BIAS_MILD_THRESHOLD) {
    generalBias = {
      rating: "Mildly Bearish",
      interpretation: "More assets are red than green, indicating a slight bearish tilt.",
      score: 3.5,
    };
  }

  // --- Funding Imbalance Analysis ---
  const totalPositiveFunding = stats.fundingStats.greenPositiveFunding + stats.fundingStats.redPositiveFunding;
  const totalNegativeFunding = stats.fundingStats.greenNegativeFunding + stats.fundingStats.redNegativeFunding;

  if (totalPositiveFunding > totalNegativeFunding * FUNDING_STRONG_IMBALANCE_THRESHOLD) {
    fundingImbalance = {
      rating: "Strong Bearish Funding Imbalance",
      interpretation: "A very large number of longs are paying, especially on falling assets, indicating extreme long trap potential.",
      score: 2.0,
    };
  } else if (totalPositiveFunding > totalNegativeFunding * FUNDING_MILD_IMBALANCE_THRESHOLD) {
    fundingImbalance = {
      rating: "Bearish Funding Imbalance",
      interpretation: "A large number of longs are paying, especially on falling assets, indicating significant long trap potential.",
      score: 3.0,
    };
  } else if (totalNegativeFunding > totalPositiveFunding * FUNDING_STRONG_IMBALANCE_THRESHOLD) {
    fundingImbalance = {
      rating: "Strong Bullish Funding Imbalance",
      interpretation: "A very large number of shorts are paying, especially on rising assets, indicating extreme short squeeze potential.",
      score: 8.0,
    };
  } else if (totalNegativeFunding > totalPositiveFunding * FUNDING_MILD_IMBALANCE_THRESHOLD) {
    fundingImbalance = {
      rating: "Bullish Funding Imbalance",
      interpretation: "A large number of shorts are paying, especially on rising assets, indicating significant short squeeze potential.",
      score: 7.0,
    };
  }

  // --- Short Squeeze Candidates Analysis ---
  const shortSqueezeCount = stats.fundingStats.greenNegativeFunding;
  if (shortSqueezeCount > SQUEEZE_HIGH_THRESHOLD) {
    shortSqueezeCandidates = {
      rating: "High Squeeze Potential",
      interpretation: "A significant number of assets are showing strong short squeeze setups, where price is rising and shorts are paying heavily.",
      score: 8.5,
    };
  } else if (shortSqueezeCount > SQUEEZE_MODERATE_THRESHOLD) {
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

  // --- Long Trap Risk Analysis ---
  const longTrapCount = stats.fundingStats.redPositiveFunding;
  if (longTrapCount > TRAP_HIGH_THRESHOLD) {
    longTrapCandidates = {
      rating: "High Long Trap Risk",
      interpretation: "Many assets are falling with positive funding, indicating trapped longs and potential for cascades.",
      score: 2.0,
    };
  } else if (longTrapCount > TRAP_MODERATE_THRESHOLD) {
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

  // --- Volume Sentiment Analysis ---
  const totalVolume = stats.volumeData.reduce((sum, d) => sum + d.volume, 0);
  const greenVolume = stats.volumeData
    .filter(d => d.priceChange >= 0)
    .reduce((sum, d) => sum + d.volume, 0);
  const redVolume = stats.volumeData
    .filter(d => d.priceChange < 0)
    .reduce((sum, d) => sum + d.volume, 0);

  if (greenVolume > redVolume * VOLUME_STRONG_IMBALANCE_THRESHOLD) {
    volumeSentiment = {
      rating: "Bullish Volume",
      interpretation: "Dominant buying volume on rising assets, confirming uptrends.",
      score: 8.0,
    };
  } else if (redVolume > greenVolume * VOLUME_STRONG_IMBALANCE_THRESHOLD) {
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

  // --- Liquidation Sentiment Analysis ---
  if (stats.liquidationData) {
    const { totalLongLiquidationsUSD, totalShortLiquidationsUSD } = stats.liquidationData;
    const totalLiquidations = totalLongLiquidationsUSD + totalShortLiquidationsUSD;

    if (totalLiquidations > 0) {
      const longLiquidationRatio = totalLongLiquidationsUSD / totalLiquidations;
      const shortLiquidationRatio = totalShortLiquidationsUSD / totalLiquidations;

      if (longLiquidationRatio > LIQUIDATION_DOMINANT_RATIO) {
        liquidationHeatmap = {
          rating: "Dominant Long Liquidations",
          interpretation: "Overwhelming long liquidations suggest a strong bearish push or cascading sell-offs.",
          score: 2.0,
        };
      } else if (shortLiquidationRatio > LIQUIDATION_DOMINANT_RATIO) {
        liquidationHeatmap = {
          rating: "Dominant Short Liquidations",
          interpretation: "Overwhelming short liquidations suggest a strong bullish push or short squeeze.",
          score: 8.0,
        };
      } else if (longLiquidationRatio > LIQUIDATION_MILD_IMBALANCE_RATIO) {
        liquidationHeatmap = {
          rating: "More Long Liquidations",
          interpretation: "More long liquidations than short, indicating some bearish pressure.",
          score: 4.0,
        };
      } else if (shortLiquidationRatio > LIQUIDATION_MILD_IMBALANCE_RATIO) {
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

  // --- High Quality Breakout Analysis (Placeholder) ---
  highQualityBreakout = {
    rating: "No Clear Breakouts Detected",
    interpretation: "No immediate high-quality breakout patterns are broadly apparent across the market.",
    score: 5.0,
  };

  // --- Flagged Signal Sentiment Analysis ---
  const bullishSignals = stats.flaggedSignals.filter(s => s.signal === 'Bullish Opportunity').length;
  const bearishSignals = stats.flaggedSignals.filter(s => s.signal === 'Bearish Risk').length;
  const totalFlagged = bullishSignals + bearishSignals;

  if (totalFlagged === 0) {
    flaggedSignalSentiment = {
      rating: "No Strong Signals",
      interpretation: "The automated checklist did not identify significant bullish or bearish opportunities.",
      score: 5.0,
    };
  } else if (bullishSignals > bearishSignals * FLAG_STRONG_SIGNAL_RATIO) {
    flaggedSignalSentiment = {
      rating: "Strong Bullish Signals",
      interpretation: "A high number of assets are flagged with strong bullish opportunities based on specific criteria.",
      score: 8.5,
    };
  } else if (bullishSignals > bearishSignals * FLAG_MILD_SIGNAL_RATIO) {
    flaggedSignalSentiment = {
      rating: "Moderate Bullish Signals",
      interpretation: "More bullish opportunities are flagged than bearish risks.",
      score: 7.0,
    };
  } else if (bearishSignals > bullishSignals * FLAG_STRONG_SIGNAL_RATIO) {
    flaggedSignalSentiment = {
      rating: "Strong Bearish Signals",
      interpretation: "A high number of assets are flagged with strong bearish risks based on specific criteria.",
      score: 2.0,
    };
  } else if (bearishSignals > bullishSignals * FLAG_MILD_SIGNAL_RATIO) {
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

  // --- Overall Sentiment Accuracy (Placeholder) ---
  const overallSentimentAccuracy = "Pending Historical Data Validation";

  // --- Return all calculated sentiment ratings ---
  return {
    generalBias,
    fundingImbalance,
    shortSqueezeCandidates,
    longTrapCandidates,
    volumeSentiment,
    liquidationHeatmap,
    highQualityBreakout,
    flaggedSignalSentiment,
    overallSentimentAccuracy,
    // overallMarketOutlook is computed in the component, so we provide a placeholder here
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" },
  };
};
