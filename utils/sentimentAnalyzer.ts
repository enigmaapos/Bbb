// src/utils/sentimentAnalyzer.ts
import {
  MarketStats,
  MarketAnalysisResults,
  AggregatedLiquidationData,
  SymbolData,
  MarketData,
  NewsData,
  SentimentArticle,
} from "../types";

// The function now takes MarketStats, which includes newsArticles directly
export function analyzeSentiment(data: MarketStats): MarketAnalysisResults {
  const {
    green,
    red,
    fundingStats,
    volumeData,   // This is now guaranteed to be SymbolData[]
    liquidationData,
    newsArticles, // Destructure newsArticles from MarketStats
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
    marketData: { // Initialize with defaults or actual data
        greenCount: green,
        redCount: red,
        greenPositiveFunding: fundingStats.greenPositiveFunding,
        greenNegativeFunding: fundingStats.greenNegativeFunding,
        redPositiveFunding: fundingStats.redPositiveFunding,
        redNegativeFunding: fundingStats.redNegativeFunding,
        priceUpFundingNegativeCount: 0, // Will be calculated below
        priceDownFundingPositiveCount: 0, // Will be calculated below
        topShortSqueeze: [], // Initialized as empty
        topLongTrap: [],     // Initialized as empty
        totalLongLiquidationsUSD: liquidationData?.totalLongLiquidationsUSD || 0,
        totalShortLiquidationsUSD: liquidationData?.totalShortLiquidationsUSD || 0,
    },
    newsData: newsArticles, // Directly use the newsArticles passed in MarketStats
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
const priceUpFundingNegative = volumeData.filter(d => d.priceChangePercent > 0 && d.fundingRate < 0).length; // PUN
const priceDownFundingPositive = volumeData.filter(d => d.priceChangePercent < 0 && d.fundingRate > 0).length; // PDP

results.marketData.priceUpFundingNegativeCount = priceUpFundingNegative;
results.marketData.priceDownFundingPositiveCount = priceDownFundingPositive;

// Thresholds
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
  // Filter and sort directly from volumeData which is already SymbolData[]
  // FIX: Changed d.priceChange to d.priceChangePercent
  const topShortSqueezeCandidates = volumeData
    .filter(d => d.priceChangePercent > 0 && d.fundingRate < 0)
    .sort((a, b) => a.fundingRate - b.fundingRate) // Sort by funding rate (most negative first)
    .slice(0, 5);

  // Assign to marketData
  results.marketData.topShortSqueeze = topShortSqueezeCandidates;

  const shortSqueezeCount = topShortSqueezeCandidates.filter(d => d.volume > 50_000_000).length;
  if (shortSqueezeCount > 3) { // Adjusted condition to be more realistic for a slice of 5
    results.shortSqueezeCandidates = {
      rating: "High Potential",
      interpretation: `Many pairs (${shortSqueezeCount}) show price appreciation with negative funding, indicating shorts are being squeezed.`,
      score: 8,
    };
  } else if (shortSqueezeCount > 0) { // If there's at least one candidate
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
  // Filter and sort directly from volumeData which is already SymbolData[]
  // FIX: Changed d.priceChange to d.priceChangePercent
  const topLongTrapCandidates = volumeData
    .filter(d => d.priceChangePercent < 0 && d.fundingRate > 0)
    .sort((a, b) => b.fundingRate - a.fundingRate) // Sort by funding rate (most positive first)
    .slice(0, 5); // Take top 5

  // Assign to marketData
  results.marketData.topLongTrap = topLongTrapCandidates;

  const longTrapCount = topLongTrapCandidates.filter(d => d.volume > 50_000_000).length;
  if (longTrapCount > 3) { // Adjusted condition to be more realistic for a slice of 5
    results.longTrapCandidates = {
      rating: "High Risk",
      interpretation: `Many pairs (${longTrapCount}) show price depreciation with positive funding, indicating longs are trapped.`,
      score: 2,
    };
  } else if (longTrapCount > 0) { // If there's at least one candidate
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
  // FIX: Changed d.priceChange to d.priceChangePercent
  const bullishVolume = volumeData.filter(d => d.priceChangePercent > 0 && d.volume > 100_000_000).length;
  // FIX: Changed d.priceChange to d.priceChangePercent
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

  // --- 7. News Sentiment Analysis (Improved) ---
const sentimentKeywords: Record<string, number> = {
  bullish: 2,
  gain: 1,
  rise: 1,
  breakout: 2,
  surge: 2,
  rally: 2,
  pump: 2,
  spike: 1,
  moon: 2,
  profit: 1,

  bearish: -2,
  crash: -3,
  fall: -2,
  drop: -2,
  correction: -1,
  dip: -1,
  selloff: -2,
  dump: -2,
  panic: -2,
  loss: -1,
};

let totalSentimentScore = 0;
let keywordHitCount = 0;
let positiveHeadlines: string[] = [];
let negativeHeadlines: string[] = [];

newsArticles.forEach(article => {
  const title = article.title.toLowerCase();

  // Ignore headlines that negate sentiment
  if (title.includes("trap") || title.includes("fake") || title.includes("scam")) return;

  let score = 0;

  for (const [keyword, weight] of Object.entries(sentimentKeywords)) {
    if (title.includes(keyword)) {
      score += weight;
      keywordHitCount++;
    }
  }

  totalSentimentScore += score;

  if (score > 0) positiveHeadlines.push(article.title);
  else if (score < 0) negativeHeadlines.push(article.title);
});

// Normalize score to a 0–10 scale (base score is 5, extreme = ±10)
let newsSentimentScore = 5;
if (keywordHitCount > 0) {
  const avgSentiment = totalSentimentScore / keywordHitCount;
  newsSentimentScore = Math.max(0, Math.min(10, 5 + avgSentiment * 2)); // scale factor
}

let newsSentimentRating = "Neutral News";
let newsSentimentInterpretation = "News sentiment is balanced or inconclusive.";

if (newsSentimentScore >= 7.5) {
  newsSentimentRating = "Bullish News";
  newsSentimentInterpretation = "News headlines strongly favor upward movement.";
} else if (newsSentimentScore >= 6) {
  newsSentimentRating = "Slightly Bullish News";
  newsSentimentInterpretation = "News sentiment leans slightly positive.";
} else if (newsSentimentScore <= 2.5) {
  newsSentimentRating = "Bearish News";
  newsSentimentInterpretation = "News headlines suggest strong bearish pressure.";
} else if (newsSentimentScore <= 4) {
  newsSentimentRating = "Slightly Bearish News";
  newsSentimentInterpretation = "News sentiment leans slightly negative.";
}

// Final assignment
results.newsSentiment = {
  rating: newsSentimentRating,
  interpretation: newsSentimentInterpretation,
  score: parseFloat(newsSentimentScore.toFixed(1)),
  topHeadlines: [...positiveHeadlines.slice(0, 3), ...negativeHeadlines.slice(0, 2)], // Max 5
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
    results.newsSentiment.score; // Include news sentiment

  const numberOfScores = 7; // Update this if you add/remove sentiment categories
  const averageScore = totalScore / numberOfScores;

  let overallTone = "";
  let strategySuggestion = "";

  if (averageScore >= 7.5) {
    overallTone = "Strongly Bullish";
    strategySuggestion = "Consider aggressive long positions with tight risk management. Focus on strong fundamental projects.";
  } else if (averageScore >= 6) {
    overallTone = "Moderately Bullish";
    strategySuggestion = "Cautiously seek long opportunities, consider consolidating positions. Monitor key resistance levels.";
  } else if (averageScore >= 4.5) {
    overallTone = "Neutral/Volatile";
    strategySuggestion = "Market is indecisive. Consider range trading or wait for clearer signals. High volatility is possible.";
  } else if (averageScore >= 3) {
    overallTone = "Moderately Bearish";
    strategySuggestion = "Consider shorting opportunities or reducing long exposure. Monitor key support levels carefully.";
  } else {
    overallTone = "Strongly Bearish";
    strategySuggestion = "Favor short positions or remain in cash. Protect capital as further downside is likely.";
  }

  results.overallMarketOutlook = {
    score: parseFloat(averageScore.toFixed(2)),
    tone: overallTone,
    strategySuggestion: strategySuggestion,
  };

  return results;
}
