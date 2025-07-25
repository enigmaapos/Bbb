// src/utils/sentimentAnalyzer.ts
import { SentimentAnalyzer } from 'vader-sentiment';
import {
  MarketStats,
  MarketAnalysisResults,
  SentimentArticle, // Make sure SentimentArticle is imported for clarity
} from "../types";

export interface IndividualSentimentResult {
  compound: number;
  category: 'positive' | 'negative' | 'neutral';
  // You might want to include raw neg, neu, pos scores too for debugging/detail
  neg?: number;
  neu?: number;
  pos?: number;
}

/**
 * Analyzes the sentiment of a single piece of text using VADER.
 * @param text The text content (e.g., article title, description, or content).
 * @returns An object with a compound score (-1 to +1) and a sentiment category.
 */
export function getVaderSentiment(text: string | null | undefined): IndividualSentimentResult {
  if (!text || text.trim() === '') {
    return { compound: 0, category: 'neutral' };
  }

  const analyzer = new SentimentAnalyzer();
  // CORRECTED: Use polarity_scores
  const sentiment = analyzer.polarity_scores(text);

  const compound = sentiment.compound;

  let category: 'positive' | 'negative' | 'neutral';
  // Standard VADER thresholds
  if (compound >= 0.05) {
    category = 'positive';
  } else if (compound <= -0.05) {
    category = 'negative';
  } else {
    category = 'neutral';
  }

  return { compound, category, neg: sentiment.neg, neu: sentiment.neu, pos: sentiment.pos };
}

// --- Your main Market Analysis Function (analyzeSentiment) remains as you provided it ---
// (assuming the rest of your logic for other sections is correct based on your data structures)
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

  // --- 1. General Bias (Existing Logic) ---
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

  // --- 2. Funding Imbalance (Existing Logic) ---
  const priceUpFundingNegative = volumeData.filter(d => d.priceChangePercent > 0 && d.fundingRate < 0).length;
  const priceDownFundingPositive = volumeData.filter(d => d.priceChangePercent < 0 && d.fundingRate > 0).length;

  results.marketData.priceUpFundingNegativeCount = priceUpFundingNegative;
  results.marketData.priceDownFundingPositiveCount = priceDownFundingPositive;

  const BULLISH_PUN_THRESHOLD = 0; // These thresholds should be reviewed based on actual data distribution
  const BULLISH_PDP_THRESHOLD = 0;

  const BEARISH_PUN_THRESHOLD = 0;
  const BEARISH_PDP_THRESHOLD = 0;

  if (priceUpFundingNegative <= BULLISH_PUN_THRESHOLD && priceDownFundingPositive >= BULLISH_PDP_THRESHOLD) {
    results.fundingImbalance = {
      rating: "📈 Potential Bullish Trap Squeeze",
      interpretation: `Many longs are trapped (${priceDownFundingPositive} pairs) while very few shorts are paying for rising prices (${priceUpFundingNegative} pairs). This suggests strong buying pressure and potential for a squeeze.`,
      score: 9.0,
    };
  } else if (priceUpFundingNegative >= BEARISH_PUN_THRESHOLD && priceDownFundingPositive <= BEARISH_PDP_THRESHOLD) {
    results.fundingImbalance = {
      rating: "📉 Potential Bearish Trap Squeeze",
      interpretation: `Many shorts are trapped (${priceUpFundingNegative} pairs) while very few longs are paying for falling prices (${priceDownFundingPositive} pairs). This suggests a potential bearish reversal or capitulation.`,
      score: 1.0,
    };
  } else {
    results.fundingImbalance = {
      rating: "Neutral/Mixed Funding",
      interpretation: "Funding rates do not meet specific 'trap squeeze' criteria.",
      score: 5,
    };
  }

  // --- 3. Short Squeeze Candidates (Existing Logic) ---
  const topShortSqueezeCandidates = volumeData
    .filter(d => d.priceChangePercent > 0 && d.fundingRate < 0)
    .sort((a, b) => a.fundingRate - b.fundingRate)
    .slice(0, 5);

  results.marketData.topShortSqueeze = topShortSqueezeCandidates;

  const shortSqueezeCount = topShortSqueezeCandidates.filter(d => d.volume > 50_000_000).length;
  if (shortSqueezeCount > 3) {
    results.shortSqueezeCandidates = {
      rating: "High Potential",
      interpretation: `Multiple pairs (${shortSqueezeCount} of top 5) show price appreciation with negative funding, indicating shorts are being squeezed.`,
      score: 8,
    };
  } else if (shortSqueezeCount > 0) {
    results.shortSqueezeCandidates = {
      rating: "Moderate Potential",
      interpretation: `Some pairs (${shortSqueezeCount} of top 5) show signs of short squeezes.`,
      score: 6,
    };
  } else {
    results.shortSqueezeCandidates = {
      rating: "Low Potential",
      interpretation: "Few short squeeze setups observed.",
      score: 4,
    };
  }

  // --- 4. Long Trap Candidates (Existing Logic) ---
  const topLongTrapCandidates = volumeData
    .filter(d => d.priceChangePercent < 0 && d.fundingRate > 0)
    .sort((a, b) => b.fundingRate - a.fundingRate)
    .slice(0, 5);

  results.marketData.topLongTrap = topLongTrapCandidates;

  const longTrapCount = topLongTrapCandidates.filter(d => d.volume > 50_000_000).length;
  if (longTrapCount > 3) {
    results.longTrapCandidates = {
      rating: "High Risk",
      interpretation: `Multiple pairs (${longTrapCount} of top 5) show price depreciation with positive funding, indicating longs are trapped.`,
      score: 2,
    };
  } else if (longTrapCount > 0) {
    results.longTrapCandidates = {
      rating: "Moderate Risk",
      interpretation: `Some pairs (${longTrapCount} of top 5) show signs of long traps.`,
      score: 4,
    };
  } else {
    results.longTrapCandidates = {
      rating: "Low Risk",
      interpretation: "Few long trap setups observed.",
      score: 6,
    };
  }

  // --- 5. Volume Sentiment (Existing Logic) ---
  const bullishVolume = volumeData.filter(d => d.priceChangePercent > 0 && d.volume > 100_000_000).length;
  const bearishVolume = volumeData.filter(d => d.priceChangePercent < 0 && d.volume > 100_000_000).length;

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

  // --- 6. Liquidation Heatmap Sentiment (Existing Logic) ---
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

  // --- 7. Corrected News Sentiment Analysis (Aggregating Pre-analyzed News) ---
  let totalNewsScore = 0;
  let validNewsCount = 0;

  newsArticles.forEach(article => {
    if (article.sentimentScore !== undefined && article.sentimentScore !== null) {
      totalNewsScore += article.sentimentScore;
      validNewsCount++;
    }
  });

  let averageNewsSentimentScore = 5; // Default to neutral on a 1-10 scale
  if (validNewsCount > 0) {
    averageNewsSentimentScore = totalNewsScore / validNewsCount;
  }

  let newsSentimentRating = "Neutral News";
  let newsSentimentInterpretation = `News sentiment is balanced or indecisive (Avg. score: ${averageNewsSentimentScore.toFixed(2)}).`;

  if (averageNewsSentimentScore >= 8) {
    newsSentimentRating = "Strongly Bullish News";
    newsSentimentInterpretation = `Recent news is predominantly positive (Avg. score: ${averageNewsSentimentScore.toFixed(2)}), highly likely supporting upward price action.`;
  } else if (averageNewsSentimentScore >= 6) {
    newsSentimentRating = "Slightly Bullish News";
    newsSentimentInterpretation = `News sentiment leans positive (Avg. score: ${averageNewsSentimentScore.toFixed(2)}), suggesting a mild positive sentiment from headlines.`;
  } else if (averageNewsSentimentScore <= 3) {
    newsSentimentRating = "Strongly Bearish News";
    newsSentimentInterpretation = `Recent news is predominantly negative (Avg. score: ${averageNewsSentimentScore.toFixed(2)}), highly likely contributing to downward price action.`;
  } else if (averageNewsSentimentScore <= 4) {
    newsSentimentRating = "Slightly Bearish News";
    newsSentimentInterpretation = `News sentiment leans negative (Avg. score: ${averageNewsSentimentScore.toFixed(2)}), suggesting a mild negative sentiment from headlines.`;
  }

  results.newsSentiment = {
    rating: newsSentimentRating,
    interpretation: newsSentimentInterpretation,
    score: parseFloat(averageNewsSentimentScore.toFixed(2))
  };

  results.overallSentimentAccuracy = "Based on multiple indicators.";

  // Calculate overall market outlook score, tone, and strategy suggestion
  const totalScore =
    results.generalBias.score +
    results.fundingImbalance.score +
    results.shortSqueezeCandidates.score +
    results.longTrapCandidates.score +
    results.volumeSentiment.score +
    results.liquidationHeatmap.score +
    results.newsSentiment.score;

  const numberOfScores = 7;
  const averageOverallScore = totalScore / numberOfScores;

  let overallTone = "";
  let strategySuggestion = "";

  if (averageOverallScore >= 7.5) {
    overallTone = "Strongly Bullish";
    strategySuggestion = "Consider aggressive long positions with tight risk management. Focus on strong fundamental projects.";
  } else if (averageOverallScore >= 6) {
    overallTone = "Moderately Bullish";
    strategySuggestion = "Cautiously seek long opportunities, consider consolidating positions. Monitor key resistance levels.";
  } else if (averageOverallScore >= 4.5) {
    overallTone = "Neutral/Volatile";
    strategySuggestion = "Market is indecisive. Consider range trading or wait for clearer signals. High volatility is possible.";
  } else if (averageOverallScore >= 3) {
    overallTone = "Moderately Bearish";
    strategySuggestion = "Consider shorting opportunities or reducing long exposure. Monitor key support levels carefully.";
  } else {
    overallTone = "Strongly Bearish";
    strategySuggestion = "Favor short positions or remain in cash. Protect capital as further downside is likely.";
  }

  results.overallMarketOutlook = {
    score: parseFloat(averageOverallScore.toFixed(2)),
    tone: overallTone,
    strategySuggestion: strategySuggestion,
  };

  return results;
}
