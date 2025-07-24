// src/utils/sentimentAnalyzer.ts
import {
  MarketStats,
  MarketAnalysisResults,
  // AggregatedLiquidationData, // Not directly used in analyzeSentiment arguments
  SentimentArticle, // Import the new type
} from "../types"; // Make sure to update your types.ts file as well

export function analyzeSentiment(data: MarketStats, news: SentimentArticle[] = []): MarketAnalysisResults {
  const {
    green,
    red,
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
    newsSentiment: { rating: "", interpretation: "", score: 0 }, // NEW: News Sentiment
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
  const BULLISH_PUN_THRESHOLD = 30; // Price Up Negative Funding (shorts paying) is small
  const BULLISH_PDP_THRESHOLD = 230; // Price Down Positive Funding (longs paying) is large

  const BEARISH_PUN_THRESHOLD = 230; // Price Up Negative Funding (shorts paying) is large
  const BEARISH_PDP_THRESHOLD = 30; // Price Down Positive Funding (longs paying) is small

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

  // --- 7. News Sentiment (NEW) ---
  if (news && news.length > 0) {
    let bullishNewsCount = 0;
    let bearishNewsCount = 0;
    let neutralNewsCount = 0;

    news.forEach(article => {
      // Simple keyword-based sentiment detection for headlines
      const lowerTitle = article.title.toLowerCase();
      if (
        lowerTitle.includes("etf inflow") ||
        lowerTitle.includes("etf surge") ||
        lowerTitle.includes("institutional adoption") ||
        lowerTitle.includes("record high") ||
        lowerTitle.includes("breakout") ||
        lowerTitle.includes("rally") ||
        lowerTitle.includes("bullish") ||
        lowerTitle.includes("positive outlook") ||
        lowerTitle.includes("legislative momentum") ||
        lowerTitle.includes("schwab") || // Specific to your example news
        lowerTitle.includes("$4t") // Specific to your example news
      ) {
        bullishNewsCount++;
      } else if (
        lowerTitle.includes("profit-taking") ||
        lowerTitle.includes("bearish") ||
        lowerTitle.includes("sell-off") ||
        lowerTitle.includes("decline") ||
        lowerTitle.includes("regulatory chill") ||
        lowerTitle.includes("concerns") ||
        lowerTitle.includes("fears")
      ) {
        bearishNewsCount++;
      } else {
        neutralNewsCount++;
      }
    });

    if (bullishNewsCount > bearishNewsCount * 1.5) {
      results.newsSentiment = {
        rating: "Strongly Bullish News Flow",
        interpretation: `Predominantly positive headlines (${bullishNewsCount} bullish, ${bearishNewsCount} bearish) supporting a strong market.`,
        score: 9.0,
      };
    } else if (bearishNewsCount > bullishNewsCount * 1.5) {
      results.newsSentiment = {
        rating: "Strongly Bearish News Flow",
        interpretation: `Predominantly negative headlines (${bearishNewsCount} bearish, ${bullishNewsCount} bullish) indicating headwinds.`,
        score: 1.0,
      };
    } else if (bullishNewsCount > bearishNewsCount) {
      results.newsSentiment = {
        rating: "Slightly Bullish News",
        interpretation: `More positive news than negative news (${bullishNewsCount} bullish, ${bearishNewsCount} bearish).`,
        score: 7.0,
      };
    } else if (bearishNewsCount > bullishNewsCount) {
      results.newsSentiment = {
        rating: "Slightly Bearish News",
        interpretation: `More negative news than positive news (${bearishNewsCount} bearish, ${bullishNewsCount} bullish).`,
        score: 3.0,
      };
    } else {
      results.newsSentiment = {
        rating: "Neutral News Flow",
        interpretation: `Balanced or few significant bullish/bearish news items (${bullishNewsCount} bullish, ${bearishNewsCount} bearish, ${neutralNewsCount} neutral).`,
        score: 5.0,
      };
    }
  } else {
    results.newsSentiment = {
      rating: "No Recent News",
      interpretation: "No recent news articles to analyze for sentiment.",
      score: 5.0, // Neutral if no news available
    };
  }

  results.overallSentimentAccuracy = "Based on multiple indicators.";

  return results;
}
