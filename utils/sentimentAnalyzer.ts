// src/utils/sentimentAnalyzer.ts
import {
  MarketStats,
  MarketAnalysisResults,
  AggregatedLiquidationData,
  SymbolData,
  MarketData,
  NewsData,
  SentimentArticle,
  SentimentSignal,
} from "../types";

import { detectSentimentSignals } from "./signalDetector"; // Assuming you have this import for your signal detector

// KEEP THIS ONE AND ADD 'return results;' at the end
export function analyzeSentiment(data: MarketStats): MarketAnalysisResults {
  const {
    green,
    red,
    fundingStats,
    volumeData,
    liquidationData,
    newsArticles,
  } = data;

  const results: MarketAnalysisResults = {
    generalBias: { rating: "", interpretation: "", score: 0 },
    fundingImbalance: { rating: "", interpretation: "", score: 0 },
    shortSqueezeCandidates: { rating: "", interpretation: "", score: 0 },
    longTrapCandidates: { rating: "", interpretation: "", score: 0 },
    volumeSentiment: { rating: "", interpretation: "", score: 0 },
    liquidationHeatmap: { rating: "", interpretation: "", score: 0 },
    newsSentiment: { rating: "", interpretation: "", score: 0 },
    actionableSentimentSignals: [],
    actionableSentimentSummary: { bullishCount: 0, bearishCount: 0, tone: "", interpretation: "", score: 0 },
    overallSentimentAccuracy: "",
    overallMarketOutlook: { score: 0, tone: "", strategySuggestion: "" },
    marketData: {
      greenCount: green,
      redCount: red,
      greenPositiveFunding: fundingStats.greenPositiveFunding,
      greenNegativeFunding: fundingStats.greenNegativeFunding,
      redPositiveFunding: fundingStats.redPositiveFunding,
      redNegativeFunding: fundingStats.redNegativeFunding,
      priceUpFundingNegativeCount: 0,
      priceDownFundingPositiveCount: 0,
      topShortSqueeze: [],
      topLongTrap: [],
      totalLongLiquidationsUSD: liquidationData?.totalLongLiquidationsUSD || 0,
      totalShortLiquidationsUSD: liquidationData?.totalShortLiquidationsUSD || 0,
    },
    newsData: newsArticles,
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

  // --- 2. Funding Imbalance (Refined Custom Trap Logic) ---
  const priceUpFundingNegative = volumeData.filter(
    (d) => d.priceChangePercent > 0 && d.fundingRate < 0
  ).length; // PUN
  const priceDownFundingPositive = volumeData.filter(
    (d) => d.priceChangePercent < 0 && d.fundingRate > 0
  ).length; // PDP

  results.marketData.priceUpFundingNegativeCount = priceUpFundingNegative;
  results.marketData.priceDownFundingPositiveCount = priceDownFundingPositive;

  const PUN_MAX = 30;
  const PDP_HIGH_THRESHOLD = 230;
  const PDP_LOW_THRESHOLD = 150;

  if (priceUpFundingNegative < PUN_MAX && priceDownFundingPositive > PDP_HIGH_THRESHOLD) {
    results.fundingImbalance = {
      rating: "📉 Bearish Trap Skew",
      interpretation: `Bearish trap: ${priceDownFundingPositive} longs are paying while price drops, and only ${priceUpFundingNegative} shorts are present. Longs are trapped, further selloff possible.`,
      score: 2.0,
    };
  } else if (priceUpFundingNegative < PUN_MAX && priceDownFundingPositive < PDP_LOW_THRESHOLD) {
    results.fundingImbalance = {
      rating: "📈 Bullish Weak Trap Recovery",
      interpretation: `Bullish recovery possible: ${priceDownFundingPositive} longs are paying but not extreme, and only ${priceUpFundingNegative} shorts are defending upside. Market may lean bullish.`,
      score: 8.0,
    };
  } else {
    results.fundingImbalance = {
      rating: "⚪ Mixed/Neutral Funding",
      interpretation: `No strong trap pattern. PUN: ${priceUpFundingNegative}, PDP: ${priceDownFundingPositive}.`,
      score: 5.0,
    };
  }

  // --- 3. Short Squeeze Candidates ---
  const topShortSqueezeCandidates = volumeData
    .filter((d) => d.priceChangePercent > 0 && d.fundingRate < 0)
    .sort((a, b) => a.fundingRate - b.fundingRate)
    .slice(0, 5);

  results.marketData.topShortSqueeze = topShortSqueezeCandidates;

  const shortSqueezeCount = topShortSqueezeCandidates.filter(
    (d) => d.volume > 50_000_000
  ).length;
  if (shortSqueezeCount > 3) {
    results.shortSqueezeCandidates = {
      rating: "High Potential",
      interpretation: `Many pairs (${shortSqueezeCount}) show price appreciation with negative funding, indicating shorts are being squeezed.`,
      score: 8,
    };
  } else if (shortSqueezeCount > 0) {
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
  const topLongTrapCandidates = volumeData
    .filter((d) => d.priceChangePercent < 0 && d.fundingRate > 0)
    .sort((a, b) => b.fundingRate - a.fundingRate)
    .slice(0, 5);

  results.marketData.topLongTrap = topLongTrapCandidates;

  const longTrapCount = topLongTrapCandidates.filter(
    (d) => d.volume > 50_000_000
  ).length;
  if (longTrapCount > 3) {
    results.longTrapCandidates = {
      rating: "High Risk",
      interpretation: `Many pairs (${longTrapCount}) show price depreciation with positive funding, indicating longs are trapped.`,
      score: 2,
    };
  } else if (longTrapCount > 0) {
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
  const bullishVolume = volumeData.filter(
    (d) => d.priceChangePercent > 0 && d.volume > 100_000_000
  ).length;
  const bearishVolume = volumeData.filter(
    (d) => d.priceChangePercent < 0 && d.volume > 100_000_000
  ).length;

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

      if (longLiquidationRatio > 0.7) {
        results.liquidationHeatmap = {
          rating: "Heavy Long Liquidations",
          interpretation: `A significant amount of long positions (${(longLiquidationRatio * 100).toFixed(0)}%) are being liquidated, indicating strong downward pressure.`,
          score: 1.5,
        };
      } else if (shortLiquidationRatio > 0.7) {
        results.liquidationHeatmap = {
          rating: "Heavy Short Liquidations",
          interpretation: `A significant amount of short positions (${(shortLiquidationRatio * 100).toFixed(0)}%) are being liquidated, indicating strong upward pressure or short squeezes.`,
          score: 8.5,
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
        score: 5,
      };
    }
  } else {
    results.liquidationHeatmap = {
      rating: "Data Unavailable",
      interpretation: "Liquidation data not yet available for sentiment analysis.",
      score: 5,
    };
  }

  // --- 7. News Sentiment Analysis ---
  let positiveNewsCount = 0;
  let negativeNewsCount = 0;

  newsArticles.forEach((article) => {
    const title = article.title.toLowerCase();
    if (
      title.includes("bullish") ||
      title.includes("gain") ||
      title.includes("rise") ||
      title.includes("surge") ||
      title.includes("breakout")
    ) {
      positiveNewsCount++;
    }
    if (
      title.includes("bearish") ||
      title.includes("fall") ||
      title.includes("drop") ||
      title.includes("crash") ||
      title.includes("sell-off")
    ) {
      negativeNewsCount++;
    }
  });

  if (positiveNewsCount > negativeNewsCount * 2) {
    results.newsSentiment = {
      rating: "Bullish News",
      interpretation: "Recent news headlines are predominantly positive, likely supporting upward price action.",
      score: 8,
    };
  } else if (negativeNewsCount > positiveNewsCount * 2) {
    results.newsSentiment = {
      rating: "Bearish News",
      interpretation: "Recent news headlines are predominantly negative, likely contributing to downward price action.",
      score: 3,
    };
  } else if (positiveNewsCount > negativeNewsCount) {
    results.newsSentiment = {
      rating: "Slightly Bullish News",
      interpretation: "More positive news than negative, suggesting a mild positive sentiment from headlines.",
      score: 6,
    };
  } else if (negativeNewsCount > positiveNewsCount) {
    results.newsSentiment = {
      rating: "Slightly Bearish News",
      interpretation: "More negative news than positive, suggesting a mild negative sentiment from headlines.",
      score: 4,
    };
  } else {
    // This 'else' block was causing the error due to incomplete statement and then another else block
    results.newsSentiment = {
      rating: "Neutral News",
      interpretation: "News sentiment is balanced or indecisive.",
      score: 5,
    };
  }

  // --- 8. Actionable Sentiment Signals ---
    const actionableSentimentSignals: SentimentSignal[] = detectSentimentSignals(volumeData);

  // Count bullish and bearish signals
  const bullishCount = actionableSentimentSignals.filter(
    (sig) => sig.signal === "Bullish Opportunity"
  ).length;
  const bearishCount = actionableSentimentSignals.filter(
    (sig) => sig.signal === "Bearish Risk"
  ).length;

  // Evaluate overall tone from counts
  let tone: "Bullish" | "Bearish" | "Neutral" = "Neutral";
  let interpretation = "";
  let score = 5; // Neutral base

  if (bullishCount > bearishCount) {
    tone = "Bullish";
    interpretation = `Market shows more bullish opportunities (${bullishCount}) than bearish risks (${bearishCount}).`;
    score = 7;
  } else if (bearishCount > bullishCount) {
    tone = "Bearish";
    interpretation = `Market shows more bearish risks (${bearishCount}) than bullish opportunities (${bullishCount}).`;
    score = 3;
  } else {
    tone = "Neutral";
    interpretation = `Bullish opportunities and bearish risks are balanced (${bullishCount} each).`;
    score = 5;
  }

  // Compose the actionable sentiment summary
  const actionableSentimentSummary = {
    bullishCount,
    bearishCount,
    tone,
    interpretation,
    score,
  };

  // --- 9. Overall Sentiment Accuracy ---
  results.overallSentimentAccuracy = "Based on multiple indicators including price action, funding, volume, liquidations, and news.";

  // --- 10. Overall Market Outlook ---
  // Include actionable sentiment score in average calculation
  const totalScore =
    results.generalBias.score +
    results.fundingImbalance.score +
    results.shortSqueezeCandidates.score +
    results.longTrapCandidates.score +
    results.volumeSentiment.score +
    results.liquidationHeatmap.score +
    results.newsSentiment.score +
    results.actionableSentimentSummary.score;

  const numberOfScores = 8; // Updated to include actionableSentimentSummary

  const averageScore = totalScore / numberOfScores;

  let overallTone = "";
  let strategySuggestion = "";

  if (averageScore >= 7.5) {
    overallTone = "Strongly Bullish";
    strategySuggestion =
      "Consider aggressive long positions with tight risk management. Focus on strong fundamental projects.";
  } else if (averageScore >= 6) {
    overallTone = "Moderately Bullish";
    strategySuggestion =
      "Cautiously seek long opportunities, consider consolidating positions. Monitor key resistance levels.";
  } else if (averageScore >= 4.5) {
    overallTone = "Neutral/Volatile";
    strategySuggestion =
      "Market is indecisive. Consider range trading or wait for clearer signals. High volatility is possible.";
  } else if (averageScore >= 3) {
    overallTone = "Moderately Bearish";
    strategySuggestion =
      "Consider shorting opportunities or reducing long exposure. Monitor key support levels carefully.";
  } else {
    overallTone = "Strongly Bearish";
    strategySuggestion =
      "Favor short positions or remain in cash. Protect capital as further downside is likely.";
  }

  results.overallMarketOutlook = {
    score: parseFloat(averageScore.toFixed(2)),
    tone: overallTone,
    strategySuggestion,
  };

  // Ensure to return the results object at the end of the main function body
  return results;
}
